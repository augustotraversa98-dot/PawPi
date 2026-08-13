// CareRing — the daily "Rex's Day" ring (unit E1, docs/pet-owner-engagement.md).
//
// Three equal arcs (Walk · Moment · Care). A filled arc = that segment is done today; an empty arc is
// a gentle invitation, never a scold. When all three close, a one-time celebratory pop + success
// haptic fire. On a rest/paused day the ring shows a calm, full "resting" state so the streak never
// feels broken. Pure RN Animated (no reanimated worklets) + guarded expo-haptics keeps it test-safe.

import React, { useEffect, useRef, useState } from "react";
import { Animated, View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { COLORS } from "@/constants/colors";
import {
  RING_SEGMENTS,
  RING_GAP_DEG,
  SEGMENT_SWEEP_DEG,
  normalizeRing,
  ringClosed,
  isRestOrPaused,
  completedCount,
} from "@/utils/careRing";

const SEGMENT_COLOR = { walk: COLORS.coral, moment: COLORS.apricot, care: COLORS.sageDark };
const TRACK_COLOR = "#EFE2D3"; // faint sand track for an unfinished arc
const REST_COLOR = COLORS.sage;

function polar(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx, cy, r, startDeg, endDeg) {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export function CareRing({ state, size = 120, strokeWidth = 12, onPressSegment, showCenter = true }) {
  const s = normalizeRing(state);
  const closed = ringClosed(s);
  const resting = isRestOrPaused(s);
  const done = completedCount(s);

  const scale = useRef(new Animated.Value(1)).current;
  const prevClosed = useRef(closed);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    // Fire ONCE on the false -> true transition (closing the ring today).
    if (closed && !prevClosed.current && !resting) {
      setCelebrating(true);
      try {
        // Lazy require so a missing native module can never crash the render.
        const Haptics = require("expo-haptics");
        Haptics.notificationAsync?.(Haptics.NotificationFeedbackType?.Success);
      } catch {}
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.08, useNativeDriver: true, friction: 4 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
      ]).start(() => setCelebrating(false));
    }
    prevClosed.current = closed;
  }, [closed, resting, scale]);

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;

  const segments = RING_SEGMENTS.map((seg, i) => {
    const start = i * (SEGMENT_SWEEP_DEG + RING_GAP_DEG) + RING_GAP_DEG / 2;
    const end = start + SEGMENT_SWEEP_DEG;
    const filled = seg === "walk" ? s.walk_done : seg === "moment" ? s.moment_done : s.care_done;
    const color = resting ? REST_COLOR : filled ? SEGMENT_COLOR[seg] : TRACK_COLOR;
    return { seg, d: arcPath(cx, cy, r, start, end), color };
  });

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, transform: [{ scale }] }]}>
      <Svg width={size} height={size}>
        {segments.map(({ seg, d, color }) => (
          <Path
            key={seg}
            d={d}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            onPress={onPressSegment ? () => onPressSegment(seg) : undefined}
          />
        ))}
        {/* subtle inner disc keeps the center legible over any backdrop */}
        <Circle cx={cx} cy={cy} r={r - strokeWidth} fill="transparent" />
      </Svg>
      {showCenter ? (
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerIcon}>{resting ? "🌙" : closed ? "🎉" : "🐾"}</Text>
          {!resting ? <Text style={styles.centerCount}>{done}/3</Text> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  center: { position: "absolute", alignItems: "center", justifyContent: "center" },
  centerIcon: { fontSize: 22 },
  centerCount: { marginTop: 2, fontSize: 13, fontWeight: "700", color: COLORS.warmBrown },
});

export default CareRing;
