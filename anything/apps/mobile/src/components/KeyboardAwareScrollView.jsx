import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, TextInput } from "react-native";

// Gap kept between the bottom of the focused input and the top of the keyboard.
export const KEYBOARD_INPUT_MARGIN = 16;

/**
 * Extra bottom content padding needed so everything in the scroll view can be
 * scrolled above the keyboard. Both arguments are window coordinates.
 */
export function computeKeyboardPadding(scrollViewBottomY, keyboardTopY) {
  return Math.max(0, Math.round(scrollViewBottomY - keyboardTopY));
}

/**
 * How far the scroll offset must increase for the focused input to clear the
 * keyboard. Both arguments are window coordinates. 0 means already visible.
 */
export function computeScrollDelta(
  inputBottomY,
  keyboardTopY,
  margin = KEYBOARD_INPUT_MARGIN,
) {
  return Math.max(0, Math.round(inputBottomY + margin - keyboardTopY));
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
 * remaining overlap is measured against settled positions). iOS re-posts
 * these notifications when focus moves between inputs, which re-runs the
 * adjustment for the newly focused input.
 */
const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  { children, contentContainerStyle, onScroll, scrollEventThrottle, ...props },
  ref,
) {
  const scrollRef = useRef(null);
  const scrollOffsetYRef = useRef(0);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  useImperativeHandle(ref, () => scrollRef.current);

  useEffect(() => {
    const adjustForKeyboard = (event) => {
      const keyboardTopY = event?.endCoordinates?.screenY;
      const scrollView = scrollRef.current;
      if (scrollView == null || typeof keyboardTopY !== "number") return;

      const scrollHost = scrollView.getNativeScrollRef?.() ?? scrollView;
      scrollHost.measureInWindow?.((sx, sy, sw, sh) => {
        setKeyboardPadding(computeKeyboardPadding(sy + sh, keyboardTopY));

        const input = TextInput.State.currentlyFocusedInput?.();
        if (input == null) return;
        input.measureInWindow((ix, iy, iw, ih) => {
          const delta = computeScrollDelta(iy + ih, keyboardTopY);
          if (delta > 0) {
            scrollView.scrollTo({
              y: scrollOffsetYRef.current + delta,
              animated: true,
            });
          }
        });
      });
    };
    const resetForKeyboard = () => setKeyboardPadding(0);

    const subscriptions =
      Platform.OS === "ios"
        ? [
            Keyboard.addListener("keyboardWillShow", adjustForKeyboard),
            Keyboard.addListener("keyboardDidShow", adjustForKeyboard),
            Keyboard.addListener("keyboardWillHide", resetForKeyboard),
          ]
        : [
            Keyboard.addListener("keyboardDidShow", adjustForKeyboard),
            Keyboard.addListener("keyboardDidHide", resetForKeyboard),
          ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

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
      {...props}
      ref={scrollRef}
      onScroll={handleScroll}
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
