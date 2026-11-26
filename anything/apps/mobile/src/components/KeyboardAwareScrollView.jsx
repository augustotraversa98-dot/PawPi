import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import {
  computeFollowDelay,
  computeSheetOffset,
  computeVisibleBottom,
} from "@/utils/keyboardLayout";

// Gap kept between the bottom of the focused input and the top of the keyboard.
export const KEYBOARD_INPUT_MARGIN = 16;

/**
 * Extra bottom content padding needed so everything in the scroll view can be
 * scrolled above the keyboard. Both arguments are window coordinates.
 *
 * Returns 0 (not NaN) when a measurement is missing/non-finite: a native
 * measureInWindow callback can hand back `undefined` coords for a node that
 * isn't laid out yet, and feeding NaN into a paddingBottom style is a Yoga
 * crash on the New Architecture — so the guard here keeps the layout safe.
 */
export function computeKeyboardPadding(scrollViewBottomY, keyboardTopY) {
  const pad = Math.round(scrollViewBottomY - keyboardTopY);
  return Number.isFinite(pad) ? Math.max(0, pad) : 0;
}

/**
 * How far the scroll offset must increase for the focused input to clear the
 * bottom of the VISIBLE scroll area. Both arguments are window coordinates.
 * `visibleBottomY` is the keyboard top, or the scroll view's own bottom edge when
 * that is higher (a pinned footer sits between the scroll view and the keyboard —
 * see computeVisibleBottom). 0 means already visible (and 0 for any non-finite
 * input, so a NaN never reaches scrollTo).
 */
export function computeScrollDelta(
  inputBottomY,
  visibleBottomY,
  margin = KEYBOARD_INPUT_MARGIN,
) {
  const delta = Math.round(inputBottomY + margin - visibleBottomY);
  return Number.isFinite(delta) ? Math.max(0, delta) : 0;
}

// Pause before following a focus / content-size / keyboard-frame change, so layout
// has settled when we measure.
const FOLLOW_DELAY_MS = 60;

// Which scroll view the focused field belongs to. Containment alone is not enough: a
// form inside a <Modal> that is rendered by a scroll view is also "inside" that outer
// scroll view. The focus event bubbles innermost-first, so the first one to see it owns it.
let focusOwner = null;
const claimedFocusEvents = new WeakSet();

function claimFocus(owner, event) {
  const key = event?.nativeEvent;
  if (key && typeof key === "object") {
    if (claimedFocusEvents.has(key)) return;
    claimedFocusEvents.add(key);
  }
  focusOwner = owner;
}

/**
 * Run `callback` only if `input` lives inside this scroll view. Measuring the input
 * relative to the content view fails natively when it is not a descendant. When the
 * check is not available the callback runs (the previous behaviour).
 */
function whenContained(scrollView, input, callback) {
  const content = scrollView.getInnerViewRef?.();
  if (content == null || typeof input.measureLayout !== "function") {
    callback();
    return;
  }
  input.measureLayout(
    content,
    () => {
      try {
        callback();
      } catch {
        // stale node during measure — ignore, keyboard still works
      }
    },
    () => {},
  );
}

/**
 * KeyboardAwareScrollView
 *
 * Drop-in ScrollView replacement that keeps the focused TextInput visible
 * above the keyboard. Unlike KeyboardAvoidingView (which measures its frame
 * relative to its parent and never scrolls), this measures the scroll view
 * and the focused input in *window* coordinates — the same space the keyboard
 * frame is reported in — so it works inside pageSheet modals, bottom-sheet
 * style modals, and full-screen modals alike:
 *
 * 1. While the keyboard is up, bottom content padding equal to the actual
 *    overlap is added so any input (and any button inside the scroll content)
 *    can be scrolled above the keyboard.
 * 2. The focused input is explicitly scrolled into view above the keyboard.
 *
 * Measurement runs on keyboardWillShow (fast response while the keyboard
 * animates in) and again on keyboardDidShow (authoritative — any ancestor
 * KeyboardAvoidingView has finished its layout animation by then, so the
 * remaining overlap is measured against settled positions).
 *
 * While the keyboard stays up it also re-runs:
 *  - when focus moves to another field (the TextInput's onFocus bubbles here),
 *  - when the content grows or shrinks (a multiline field gaining a line, so the
 *    caret stays visible; also the commit of the keyboard padding itself, without
 *    which a field near the bottom cannot be scrolled far enough),
 *  - when the keyboard changes height (iOS keyboardWillChangeFrame).
 *
 * Only the INNERMOST scroll view that contains the focused field scrolls: other
 * mounted scroll views (the screen behind a modal) hear the same keyboard events
 * and must stay where they are.
 *
 * `inPageSheet`: REQUIRED on a scroll view inside a `presentationStyle="pageSheet"`
 * modal (guard test rule 7). There iOS measures relative to the sheet, not the
 * screen, so without it the field stays hidden by the sheet's top offset. The scroll
 * view must run to the bottom of the sheet.
 *
 * The focused field is read from `TextInput.State`. The app wraps TextInput
 * (polyfills/native/textinput.native.jsx), and that wrapper must keep `State`.
 */
const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  {
    children,
    contentContainerStyle,
    onScroll,
    onFocus,
    onContentSizeChange,
    scrollEventThrottle,
    inPageSheet = false,
    ...props
  },
  ref,
) {
  const scrollRef = useRef(null);
  const scrollOffsetYRef = useRef(0);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  useImperativeHandle(ref, () => scrollRef.current);

  // Window Y of the keyboard's top edge while it is up, null while it is down.
  const keyboardTopRef = useRef(null);
  // Stable identity of this instance in the focus-ownership check.
  const ownerRef = useRef({});
  const lastScrollAtRef = useRef(0);
  const followTimerRef = useRef(null);

  // The whole sequence is guarded: it runs inside native measureInWindow
  // callbacks that can fire after the focused input (or this scroll view) has
  // unmounted — e.g. tapping the name field on the first onboarding step,
  // where the keyboard opens as the wizard is still settling. Measuring or
  // scrolling against a stale node there crashed the app on device, so every
  // native call is behind a type guard and a try/catch. A skipped adjustment
  // just means the keyboard-avoidance is a no-op that once; it never throws.
  const adjustForKeyboard = useCallback(() => {
    try {
      const keyboardTopY = keyboardTopRef.current;
      const scrollView = scrollRef.current;
      if (scrollView == null || typeof keyboardTopY !== "number") return;

      const scrollHost = scrollView.getNativeScrollRef?.() ?? scrollView;
      if (typeof scrollHost?.measureInWindow !== "function") return;

      scrollHost.measureInWindow((sx, measuredY, sw, sh) => {
        try {
          // The keyboard can have left while the measure was in flight.
          if (keyboardTopRef.current == null) return;
          // Converts measured Y values to screen coordinates (see computeSheetOffset).
          const sheetOffset =
            inPageSheet && Platform.OS === "ios"
              ? computeSheetOffset(Dimensions.get("window").height, measuredY + sh)
              : 0;
          const scrollBottomY = measuredY + sh + sheetOffset;
          setKeyboardPadding(computeKeyboardPadding(scrollBottomY, keyboardTopY));

          const input = TextInput.State?.currentlyFocusedInput?.();
          if (input == null || typeof input.measureInWindow !== "function") {
            return;
          }
          if (focusOwner != null && focusOwner !== ownerRef.current) return;
          whenContained(scrollView, input, () => {
            input.measureInWindow((ix, iy, iw, ih) => {
              try {
                // Measure against what is actually visible: a pinned footer between
                // the scroll view and the keyboard hides an input that is "above the
                // keyboard" but below the scroll view's own bottom edge.
                const delta = computeScrollDelta(
                  iy + ih + sheetOffset,
                  computeVisibleBottom(scrollBottomY, keyboardTopY),
                );
                if (delta > 0 && typeof scrollView.scrollTo === "function") {
                  lastScrollAtRef.current = Date.now();
                  scrollView.scrollTo({
                    y: scrollOffsetYRef.current + delta,
                    animated: true,
                  });
                }
              } catch {
                // stale node during the scroll — ignore, keyboard still works
              }
            });
          });
        } catch {
          // stale node during measure — ignore, keyboard still works
        }
      });
    } catch {
      // never let keyboard-avoidance bookkeeping crash the screen
    }
  }, [inPageSheet]);

  const cancelFollow = useCallback(() => {
    if (followTimerRef.current != null) clearTimeout(followTimerRef.current);
    followTimerRef.current = null;
  }, []);

  // Re-run the adjustment shortly (debounced). Waits out a scroll that is still
  // animating: measuring mid-animation would overshoot.
  const followFocusedInput = useCallback(
    (minDelay) => {
      if (keyboardTopRef.current == null) return;
      cancelFollow();
      followTimerRef.current = setTimeout(
        () => {
          followTimerRef.current = null;
          adjustForKeyboard();
        },
        computeFollowDelay(Date.now() - lastScrollAtRef.current, minDelay),
      );
    },
    [adjustForKeyboard, cancelFollow],
  );

  useEffect(() => {
    const owner = ownerRef.current;
    return () => {
      if (focusOwner === owner) focusOwner = null;
    };
  }, []);

  useEffect(() => {
    const showKeyboard = (event) => {
      const keyboardTopY = event?.endCoordinates?.screenY;
      if (typeof keyboardTopY !== "number") return;
      keyboardTopRef.current = keyboardTopY;
      if (computeFollowDelay(Date.now() - lastScrollAtRef.current, 0) > 0) {
        followFocusedInput(0);
      } else {
        adjustForKeyboard();
      }
    };
    // The keyboard changed size while up (suggestion bar, number pad, emoji).
    const changeFrame = (event) => {
      const keyboardTopY = event?.endCoordinates?.screenY;
      if (keyboardTopRef.current == null || typeof keyboardTopY !== "number") return;
      if (keyboardTopY === keyboardTopRef.current) return;
      keyboardTopRef.current = keyboardTopY;
      followFocusedInput(FOLLOW_DELAY_MS);
    };
    const hideKeyboard = () => {
      keyboardTopRef.current = null;
      cancelFollow();
      setKeyboardPadding(0);
    };

    const subscriptions =
      Platform.OS === "ios"
        ? [
            Keyboard.addListener("keyboardWillShow", showKeyboard),
            Keyboard.addListener("keyboardDidShow", showKeyboard),
            Keyboard.addListener("keyboardWillChangeFrame", changeFrame),
            Keyboard.addListener("keyboardWillHide", hideKeyboard),
          ]
        : [
            Keyboard.addListener("keyboardDidShow", showKeyboard),
            Keyboard.addListener("keyboardDidHide", hideKeyboard),
          ];
    // Mounted while the keyboard is already up (a form opened from a focused
    // screen): no show event is coming, so start from the current frame.
    try {
      const current = Keyboard.metrics?.();
      if (current && current.height > 0 && typeof current.screenY === "number") {
        keyboardTopRef.current = current.screenY;
      }
    } catch {
      // not available — the next keyboard event sets it
    }
    return () => {
      cancelFollow();
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [adjustForKeyboard, cancelFollow, followFocusedInput]);

  // Focus moved to another field. TextInput focus events bubble through here.
  const handleFocus = useCallback(
    (event) => {
      claimFocus(ownerRef.current, event);
      onFocus?.(event);
      followFocusedInput(FOLLOW_DELAY_MS);
    },
    [onFocus, followFocusedInput],
  );

  // The content changed height: keep the caret / focused field visible.
  const handleContentSizeChange = useCallback(
    (width, height) => {
      onContentSizeChange?.(width, height);
      followFocusedInput(FOLLOW_DELAY_MS);
    },
    [onContentSizeChange, followFocusedInput],
  );

  const handleScroll = useCallback(
    (event) => {
      scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  // Keyboard padding is added on top of whatever bottom padding the caller's
  // contentContainerStyle already declares, instead of replacing it.
  const flatContentStyle = StyleSheet.flatten(contentContainerStyle) || {};
  const basePaddingBottom =
    flatContentStyle.paddingBottom ??
    flatContentStyle.paddingVertical ??
    flatContentStyle.padding ??
    0;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
      {...props}
      ref={scrollRef}
      onScroll={handleScroll}
      onFocus={handleFocus}
      onContentSizeChange={handleContentSizeChange}
      scrollEventThrottle={scrollEventThrottle ?? 16}
      contentContainerStyle={[
        contentContainerStyle,
        keyboardPadding > 0
          ? { paddingBottom: basePaddingBottom + keyboardPadding }
          : null,
      ]}
    >
      {children}
    </ScrollView>
  );
});

export default KeyboardAwareScrollView;
