// LifeStageCard — life-stage-aware ring guidance (unit E15).
//
// Shows the dog's effective life stage (puppy / adult / senior) with a POSITIVE, BEHAVIORAL tip on how
// its ring closes — a senior is never judged against a puppy's bar; the ring keeps its three segments,
// this only adapts the copy. The owner can override the detected stage (Auto / Puppy / Adult / Senior).
// Never diagnostic.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useLifeStage, useSetLifeStageOverride } from "@/hooks/useLifeStage";

const C = {
  card: "#FFFCF8",
  peach: "#FFD9B3",
  coral: "#FF6F61",
  sageDark: "#5A8A74",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

const OPTIONS = [
  { key: null, i18n: "lifeStage.auto" },
  { key: "puppy", i18n: "lifeStage.puppyShort" },
  { key: "adult", i18n: "lifeStage.adultShort" },
  { key: "senior", i18n: "lifeStage.seniorShort" },
];

export function LifeStageCard({ petId, petName, canEdit = true }) {
  const { t } = useTranslation();
  const { data } = useLifeStage(petId);
  const setter = useSetLifeStageOverride(petId);

  if (!data?.effective) return null;
  const stage = data.effective;
  const name = petName || t("lifeStage.petFallback");

  const onPick = (key) => {
    if (!canEdit) return;
    setter.setOverride(key).catch(() => {}); // friendly no-op on failure
  };

  return (
    <View testID="life-stage-card" style={styles.card}>
      <Text style={styles.title}>{t(`lifeStage.${stage}Title`)}</Text>
      <Text testID="life-stage-tip" style={styles.tip}>{t(`lifeStage.${stage}Tip`, { name })}</Text>

      {canEdit ? (
        <>
          <Text style={styles.label}>{t("lifeStage.overrideLabel")}</Text>
          <View style={styles.segment}>
            {OPTIONS.map((o) => {
              const selected =
                (o.key === null && (data.override === null || data.override === undefined)) ||
                o.key === data.override;
              return (
                <TouchableOpacity
                  key={o.i18n}
                  testID={`life-stage-opt-${o.key ?? "auto"}`}
                  onPress={() => onPick(o.key)}
                  style={[styles.segItem, selected && styles.segItemActive]}
                >
                  <Text style={[styles.segText, selected && styles.segTextActive]}>{t(o.i18n)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {data.override == null ? (
            <Text style={styles.detected}>{t("lifeStage.detectedNote", { stage: t(`lifeStage.${data.detected}Short`) })}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.peach,
  },
  title: { fontSize: 16, fontWeight: "800", color: C.warmBrown },
  tip: { fontSize: 13, color: C.mutedBrown, marginTop: 4 },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: C.mutedBrown,
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 8,
  },
  segment: { flexDirection: "row", gap: 6 },
  segItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.peach,
    alignItems: "center",
  },
  segItemActive: { backgroundColor: C.coral, borderColor: C.coral },
  segText: { fontSize: 12, fontWeight: "700", color: C.mutedBrown },
  segTextActive: { color: "#FFF" },
  detected: { fontSize: 11, color: C.mutedBrown, marginTop: 8, fontStyle: "italic" },
});
