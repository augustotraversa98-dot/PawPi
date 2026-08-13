// Confetti — a lightweight, one-shot celebration burst for milestone moments (unit E3).
// Pure RN Animated (no reanimated worklets) so it's test-safe and cheap; pieces fall + spin once,
// then fade. Deterministic layout (index-derived) — no per-frame randomness.

import React, { useEffect, useRef } from "react";
import { Animated, View, Easing, StyleSheet } from "react-native";

const PALETTE = ["#FF6F61", "#FFB37A", "#FFC857", "#A7BFA3", "#B75D32"];

export function Confetti({ count = 14, duration = 1600, height = 240 }) {
  const pieces = useRef(
    Array.from({ length: count }, (_, i) => ({
      key: i,
      leftPct: ((i * 61) % 100) / 100, // spread across the width, deterministically
      color: PALETTE[i % PALETTE.length],
      delay: (i % 6) * 70,
      size: 6 + (i % 3) * 3,
      anim: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    const anims = pieces.map((p) =>
      Animated.timing(p.anim, {
        toValue: 1,
        duration,
        delay: p.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();
  }, [pieces, duration]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      {pieces.map((p) => {
        const translateY = p.anim.interpolate({ inputRange: [0, 1], outputRange: [-16, height] });
        const rotate = p.anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "540deg"] });
        const opacity = p.anim.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
        return (
          <Animated.View
            key={p.key}
            style={{
              position: "absolute",
              left: `${p.leftPct * 100}%`,
              width: p.size,
              height: p.size,
              borderRadius: 2,
              backgroundColor: p.color,
              transform: [{ translateY }, { rotate }],
              opacity,
            }}
          />
        );
      })}
    </View>
  );
}

export default Confetti;
