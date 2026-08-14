// CareRingCard — the full "Rex's Day" ring surface on Health → Today (unit E1).
//
// Shows the ring, a celebrate-the-dog status line (never shame), three tappable segment pills that
// deep-link to the action that closes each one, and rest/vacation controls (a rest-day toggle + a
// pause-until date). A rest/paused day keeps the ring and streak intact — the copy stays gentle.

import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { maybeScheduleStreakSave } from "@/utils/engagementNotifications";
import { Card } from "@/components/ui/Card";
import DateField from "@/components/DateField";
import { CareRing } from "@/components/Health/CareRing";
import { useCareRing, useSetRestDay, useSetPause, useRepairStreak } from "@/hooks/useCareRing";
import {
  normalizeRing,
  ringStatusKey,
  segmentDone,
  RING_SEGMENTS,
  streakCount,
  streakIsSafe,
  canRepairStreak,
} from "@/utils/careRing";
import { COLORS } from "@/constants/colors";
import { getLocalPostDateString } from "@/utils/dateUtils";

const SEG_LABEL_KEY = { walk: "segmentWalk", moment: "segmentMoment", care: "segmentCare" };
const SEG_HINT_KEY = { walk: "hintWalk", moment: "hintMoment", care: "hintCare" };

export function CareRingCard({ petId, petName, onPressSegment }) {
  const { t } = useTranslation();
  const name = petName || "";
  const { data } = useCareRing(petId);
  const s = normalizeRing(data);
  const setRest = useSetRestDay(petId);
  const setPause = useSetPause(petId);
  const repairStreak = useRepairStreak(petId);
  const [showPause, setShowPause] = useState(false);
  const count = streakCount(data);

  // E5 streak-save: when today's ring is exactly one segment from closing and the streak is at
  // risk, book the single positive evening nudge (guarded by policy + prefs + daily cap inside
  // maybeScheduleStreakSave — it no-ops otherwise). Fire-and-forget; never blocks render.
  useEffect(() => {
    if (!data) return;
    maybeScheduleStreakSave({
      t,
      ring: {
        walkDone: s.walk_done,
        momentDone: s.moment_done,
        careDone: s.care_done,
        ringClosed: s.ring_closed,
        restDay: s.rest_day,
        paused: s.paused,
      },
      streakCount: count,
      petName: name,
    }).catch(() => {});
  }, [data, s.walk_done, s.moment_done, s.care_done, s.ring_closed, s.rest_day, s.paused, count, name, t]);

  const statusKey = ringStatusKey(s);
  // Prefer the pause-specific line (with a resume date) when paused; otherwise the status copy.
  const statusText = s.paused
    ? t("health.careRing.paused", { name, date: s.paused_until || "" })
    : t(`health.careRing.${statusKey}`, { name });

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{name ? t("health.careRing.title", { name }) : t("health.careRing.titleGeneric")}</Text>

      <View style={styles.ringRow}>
        <CareRing state={s} size={116} onPressSegment={onPressSegment} />
        <View style={styles.side}>
          <Text style={styles.status}>{statusText}</Text>
          <Text style={styles.progress}>{t("health.careRing.progress", { done: [s.walk_done, s.moment_done, s.care_done].filter(Boolean).length })}</Text>
          {streakIsSafe(data) ? (
            <Text style={styles.safe}>{t("health.careRing.streakSafe", { name, count })}</Text>
          ) : null}
        </View>
      </View>

      {canRepairStreak(data) ? (
        <Pressable
          style={styles.repair}
          onPress={() => repairStreak.mutate()}
          accessibilityRole="button"
        >
          <Text style={styles.repairText}>🔥 {t("health.careRing.streakRepairCta")}</Text>
          <Text style={styles.repairHint}>{t("health.careRing.streakRepairHint", { count })}</Text>
        </Pressable>
      ) : null}

      <View style={styles.pills}>
        {RING_SEGMENTS.map((seg) => {
          const done = segmentDone(s, seg);
          return (
            <Pressable
              key={seg}
              onPress={() => onPressSegment?.(seg)}
              accessibilityRole="button"
              accessibilityLabel={t(`health.careRing.${SEG_HINT_KEY[seg]}`)}
              style={[styles.pill, done && styles.pillDone]}
            >
              <Text style={[styles.pillText, done && styles.pillTextDone]}>
                {done ? "✓ " : ""}
                {t(`health.careRing.${SEG_LABEL_KEY[seg]}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Rest / vacation mode — always visible, always gentle. */}
      <View style={styles.restRow}>
        {s.paused ? (
          <Pressable onPress={() => setPause.mutate(null)} accessibilityRole="button">
            <Text style={styles.restLink}>{t("health.careRing.resume")}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => setRest.mutate(!s.rest_day)}
              accessibilityRole="switch"
              accessibilityState={{ checked: s.rest_day }}
            >
              <Text style={styles.restLink}>
                {s.rest_day ? t("health.careRing.endRest") : t("health.careRing.restToday")}
              </Text>
            </Pressable>
            <Text style={styles.dot}>·</Text>
            <Pressable onPress={() => setShowPause((v) => !v)} accessibilityRole="button">
              <Text style={styles.restLink}>{t("health.careRing.pause")}</Text>
            </Pressable>
          </>
        )}
      </View>

      {showPause && !s.paused ? (
        <View style={styles.pauseBox}>
          <Text style={styles.pauseHint}>{t("health.careRing.pauseHint", { name })}</Text>
          <DateField
            value={null}
            placeholder={t("health.careRing.pauseTitle", { name })}
            minimumDate={new Date()}
            onChange={(canonical) => {
              if (canonical && canonical > getLocalPostDateString()) {
                setPause.mutate(canonical);
                setShowPause(false);
              }
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginBottom: 10 },
  ringRow: { flexDirection: "row", alignItems: "center" },
  side: { flex: 1, marginLeft: 16 },
  status: { fontSize: 15, fontWeight: "600", color: COLORS.warmBrown, lineHeight: 20 },
  progress: { marginTop: 6, fontSize: 13, color: COLORS.mutedBrown },
  safe: { marginTop: 6, fontSize: 13, fontWeight: "700", color: COLORS.terracotta },
  repair: { marginTop: 14, backgroundColor: "#FFE7D6", borderRadius: 12, padding: 12 },
  repairText: { fontSize: 14, fontWeight: "800", color: COLORS.terracotta },
  repairHint: { marginTop: 2, fontSize: 12, color: COLORS.mutedBrown },
  pills: { flexDirection: "row", marginTop: 14, gap: 8 },
  pill: {
    flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.sand,
    alignItems: "center",
  },
  pillDone: { backgroundColor: "#E7F1E4" },
  pillText: { fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown },
  pillTextDone: { color: COLORS.sageDark },
  restRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  restLink: { fontSize: 13, fontWeight: "600", color: COLORS.coral },
  dot: { marginHorizontal: 8, color: COLORS.mutedBrown },
  pauseBox: { marginTop: 10 },
  pauseHint: { fontSize: 13, color: COLORS.mutedBrown, marginBottom: 8, lineHeight: 18 },
});

export default CareRingCard;
