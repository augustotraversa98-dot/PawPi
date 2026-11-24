import React from "react";
import { Keyboard, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import KeyboardAwareScrollView from "./KeyboardAwareScrollView";
import useKeyboardMetrics from "@/hooks/useKeyboardMetrics";
import { COLORS, MATERIALS } from "@/constants/theme";
import {
  computeFooterBottomPadding,
  computeSheetHeight,
  SHEET_DEFAULT_RATIO,
} from "@/utils/keyboardLayout";

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

// useSafeAreaInsets throws when there is no SafeAreaProvider (isolated component tests, a Modal
// rendered outside the app shell). A sheet should still lay out, with zero insets.
function useInsetsOrZero() {
  try {
    return useSafeAreaInsets() || NO_INSETS;
  } catch {
    return NO_INSETS;
  }
}

const resolve = (slot, state) => (typeof slot === "function" ? slot(state) : slot);

/**
 * KeyboardSafeSheet — the ONE shared shell for a form that has text inputs and a header and/or a
 * pinned footer (Save / Next / Create). See docs/keyboard-convention.md.
 *
 * Why it exists (root cause of the recurring "keyboard hides the fields" bug): the old hand-rolled
 * sheets were `Modal transparent > KeyboardAvoidingView > View height:"90%"` with a fixed header,
 * a fixed footer padded by `insets.bottom + 20`, and a scroll view in the middle. With the keyboard
 * up the container shrank to (window - keyboard), the sheet took 90% of THAT, and the fixed chrome
 * (header, sub-header, footer hint, 54pt of home-indicator padding under the Save button) ate most
 * of what remained, leaving a sliver of scroll area. On top of that the focused input was only
 * scrolled "above the keyboard", so an input in the band between the scroll view and the keyboard
 * stayed hidden behind the footer.
 *
 * What this component does instead:
 * 1. Presentation: `variant="sheet"` is a tall bottom sheet that, while the keyboard is up, grows to
 *    ALL the space between the status bar and the keyboard (computeSheetHeight). `variant="screen"`
 *    is a full-window form. Both live in a transparent Modal that covers the whole window, so the
 *    keyboard coordinates are correct (no pageSheet offset).
 * 2. Chrome budget: `subheader` is hidden while the keyboard is up, and the footer's bottom padding
 *    drops to 12pt (the keyboard already covers the home indicator). Header and footer are slots
 *    that may be functions receiving `{ keyboardVisible, keyboardOverlap }` to compact further.
 * 3. The footer is a sibling OUTSIDE the scroll view, pinned directly above the keyboard (the
 *    container is padded by the real keyboard overlap, from useKeyboardMetrics).
 * 4. The body is a KeyboardAwareScrollView (focused input scrolled into the VISIBLE area, taps keep
 *    working, drag dismisses the keyboard). Tapping the dimmed backdrop dismisses the keyboard.
 *
 * `fit` (sheet only): for SHORT forms. The sheet is only as tall as its content, capped at the same
 * maximum height (maxHeight instead of height; the scroll body shrinks instead of filling). Tall,
 * scrolling forms must NOT use it: a flex:1 scroll body inside a maxHeight-only parent collapses
 * to 0 height (the Quick Check zero-height bug), which is why `fit` switches the body to
 * flexShrink and the default does not.
 *
 * Props: visible, onRequestClose, variant ("sheet" | "screen"), header, subheader, footer, overlay, children,
 * scrollRef, contentContainerStyle, backgroundColor, ratio, animationType, fit, testID.
 */
export default function KeyboardSafeSheet({
  visible,
  onRequestClose,
  variant = "sheet",
  header,
  subheader,
  footer,
  overlay,
  children,
  scrollRef,
  contentContainerStyle,
  backgroundColor = COLORS.cream,
  ratio = SHEET_DEFAULT_RATIO,
  animationType = "slide",
  fit = false,
  testID,
}) {
  const insets = useInsetsOrZero();
  const { height: windowHeight } = useWindowDimensions();
  const { keyboardVisible, keyboardOverlap } = useKeyboardMetrics();
  const state = { keyboardVisible, keyboardOverlap };
  const isScreen = variant === "screen";

  const footerNode = resolve(footer, state);
  const footerPaddingBottom = computeFooterBottomPadding({
    keyboardVisible,
    insetBottom: insets.bottom,
  });

  // iOS: explicit pixel height (definite, so the flex:1 scroll body never collapses to 0 — see the
  // quickcheck zero-height gotcha). Android: the window resizes under adjustResize, so a percentage
  // of the resized container is right.
  const sheetHeight =
    Platform.OS === "ios"
      ? computeSheetHeight({
          windowHeight,
          keyboardOverlap,
          insetTop: insets.top,
          ratio,
        })
      : `${Math.round(ratio * 100)}%`;

  const body = (
    <>
      {resolve(header, state) != null ? (
        <View
          testID="keyboard-sheet-header"
          style={{ paddingTop: isScreen ? insets.top : 20 }}
        >
          {resolve(header, state)}
        </View>
      ) : null}
      {!keyboardVisible && subheader != null ? (
        <View testID="keyboard-sheet-subheader">{resolve(subheader, state)}</View>
      ) : null}
      <KeyboardAwareScrollView
        ref={scrollRef}
        style={fit && !isScreen ? { flexGrow: 0, flexShrink: 1 } : { flex: 1 }}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        testID="keyboard-sheet-scroll"
      >
        {children}
      </KeyboardAwareScrollView>
      {footerNode != null ? (
        <View
          testID="keyboard-sheet-footer"
          style={{ paddingBottom: footerPaddingBottom }}
        >
          {footerNode}
        </View>
      ) : null}
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent
      onRequestClose={onRequestClose}
      testID={testID}
    >
      <View
        testID="keyboard-sheet-root"
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: isScreen ? backgroundColor : MATERIALS.overlay,
          // Lift everything by the real keyboard overlap (0 on Android / no keyboard).
          paddingBottom: keyboardOverlap,
        }}
      >
        {!isScreen ? (
          // Tapping the dimmed area dismisses the keyboard; it never closes the sheet (an
          // accidental tap must not throw away a half-filled form).
          <Pressable
            testID="keyboard-sheet-backdrop"
            accessible={false}
            style={StyleSheet.absoluteFill}
            onPress={Keyboard.dismiss}
          />
        ) : null}
        <View
          testID="keyboard-sheet-surface"
          style={
            isScreen
              ? { flex: 1, backgroundColor }
              : {
                  backgroundColor,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  ...(fit ? { maxHeight: sheetHeight } : { height: sheetHeight }),
                  // With no footer the sheet itself clears the home indicator.
                  paddingBottom: footerNode == null ? footerPaddingBottom : 0,
                }
          }
        >
          {body}
          {/* Absolutely-positioned layers (pickers, popovers) that must cover the whole form. */}
          {overlay}
        </View>
      </View>
    </Modal>
  );
}
