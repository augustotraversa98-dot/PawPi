// PressableScale (ticket 2.77 — Liquid Glass foundation).
// A tactile button wrapper: springs down slightly on press-in and back on
// release (the iOS-feeling micro-interaction), built on reanimated. Drop-in for
// Pressable/TouchableOpacity — forwards onPress, disabled, hitSlop, accessibility
// props, style, and children untouched (visual only; no behavior change).
//
// Accessibility: when Reduce Motion is on, the scale is skipped and it falls back
// to a simple opacity dim, so the press is still felt without movement.

import React from "react";
import { Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SPRINGS, SCALE, DURATIONS } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useAccessibilityPrefs";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  children,
  onPress,
  onPressIn,
  onPressOut,
  disabled = false,
  scaleTo = SCALE.pressed,
  style,
  ...rest
}) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      // No movement — a gentle opacity dim only.
      return { opacity: 1 - pressed.value * 0.25 };
    }
    const scale = 1 - pressed.value * (1 - scaleTo);
    return { transform: [{ scale }] };
  });

  const handlePressIn = (e) => {
    pressed.value = reduceMotion
      ? withTiming(1, { duration: DURATIONS.fast })
      : withSpring(1, SPRINGS.press);
    onPressIn?.(e);
  };

  const handlePressOut = (e) => {
    pressed.value = reduceMotion
      ? withTiming(0, { duration: DURATIONS.fast })
      : withSpring(0, SPRINGS.press);
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

export default PressableScale;
