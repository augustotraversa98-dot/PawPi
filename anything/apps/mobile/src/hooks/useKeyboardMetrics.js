import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform, useWindowDimensions } from "react-native";
import { computeKeyboardOverlap } from "@/utils/keyboardLayout";

/**
 * Live keyboard state for layouts that must re-budget their height while the keyboard is up
 * (KeyboardSafeSheet, docs/keyboard-convention.md).
 *
 * - `keyboardVisible`: true from keyboardWillShow until keyboardWillHide (iOS) / DidShow..DidHide
 *   (Android).
 * - `keyboardOverlap`: points of the WINDOW the keyboard covers, to pad the bottom of a full-window
 *   container by. 0 on Android: the window itself resizes there (adjustResize), padding as well
 *   would lift the layout twice.
 *
 * iOS also listens to keyboardWillChangeFrame: the keyboard height changes while it is up (the
 * predictive bar toggling, switching between the EN and ES keyboards, an emoji keyboard) and
 * keyboardWillShow does not fire again for that.
 *
 * Each subscription is removed individually (never Keyboard.removeAllListeners — that registry is
 * app-wide and tearing it down crashed the app on logout; see KeyboardAvoidingAnimatedView).
 */
export default function useKeyboardMetrics() {
  const { height: windowHeight } = useWindowDimensions();
  const [state, setState] = useState({ visible: false, screenY: null });

  useEffect(() => {
    const isIOS = Platform.OS === "ios";
    const animate = (event) => {
      // Ease the re-layout in step with the keyboard (same trick KeyboardAvoidingView uses).
      try {
        const duration = event?.duration;
        if (isIOS && typeof duration === "number" && duration > 10) {
          LayoutAnimation.configureNext({
            duration: Math.min(duration, 400),
            update: { type: LayoutAnimation.Types.keyboard },
          });
        }
      } catch {
        // animation is cosmetic; never let it break the screen
      }
    };
    const onShow = (event) => {
      animate(event);
      setState((prev) => {
        const screenY = event?.endCoordinates?.screenY;
        return prev.visible && prev.screenY === screenY
          ? prev
          : { visible: true, screenY: typeof screenY === "number" ? screenY : null };
      });
    };
    const onHide = (event) => {
      animate(event);
      setState((prev) => (prev.visible ? { visible: false, screenY: null } : prev));
    };

    const subscriptions = isIOS
      ? [
          Keyboard.addListener("keyboardWillShow", onShow),
          Keyboard.addListener("keyboardWillChangeFrame", (event) => {
            // Only follow frame changes while the keyboard is up; a frame change that ends
            // at the bottom of the screen is the keyboard leaving (keyboardWillHide handles it).
            setState((prev) => {
              const screenY = event?.endCoordinates?.screenY;
              if (!prev.visible || typeof screenY !== "number") return prev;
              return prev.screenY === screenY ? prev : { ...prev, screenY };
            });
          }),
          Keyboard.addListener("keyboardWillHide", onHide),
        ]
      : [
          Keyboard.addListener("keyboardDidShow", onShow),
          Keyboard.addListener("keyboardDidHide", onHide),
        ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  return {
    keyboardVisible: state.visible,
    keyboardOverlap:
      Platform.OS === "ios" && state.visible
        ? computeKeyboardOverlap(windowHeight, state.screenY)
        : 0,
  };
}
