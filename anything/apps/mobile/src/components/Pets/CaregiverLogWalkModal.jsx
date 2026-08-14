import React, { useState } from "react";
import { View, Text, Modal, TextInput, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, PawPrint } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS, TYPE, SPACING, RADIUS } from "@/constants/theme";

// FF2 — a compact "Log a walk" sheet a FAMILY caregiver opens for a pet SHARED with them (from the
// "Shared with me" tab). Posts to /api/health/walk-logs for the given petId; the server anchors the
// write to the pet's owner (owner-OR-family gate), so the household sees it. Owned-pet logging flows
// are untouched — this is a separate, petId-scoped entry point for shared pets.
export default function CaregiverLogWalkModal({ visible, petId, petName, onClose }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setDuration("");
    setNotes("");
  };

  const logWalk = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/health/walk-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId,
          durationMinutes: duration ? parseInt(duration, 10) : null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to log walk");
      }
      return res.json();
    },
    onSuccess: () => {
      // Reflect in the shared pet's care-ring + history for anyone viewing.
      qc.invalidateQueries({ queryKey: ["health", "walk-logs"] });
      if (petId != null) qc.invalidateQueries({ queryKey: ["care-ring", petId] });
      reset();
      onClose?.();
      Alert.alert(t("caregiverLog.saved"));
    },
    onError: () => {
      Alert.alert(t("caregiverLog.saveError"));
    },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: SPACING.xl,
            paddingTop: SPACING.lg,
            paddingBottom: insets.bottom + SPACING.xl,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: SPACING.md }}>
            <PawPrint size={20} color={COLORS.coral} style={{ marginRight: SPACING.sm }} />
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
                {t("caregiverLog.logWalkTitle")}
              </Text>
              {petName ? (
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                  {t("caregiverLog.logWalkFor", { name: petName })}
                </Text>
              ) : null}
            </View>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close", "Close")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="caregiver-log-walk-close"
            >
              <X size={22} color={COLORS.mutedBrown} />
            </PressableScale>
          </View>

          <Text style={[TYPE.footnote, { color: COLORS.warmBrown, marginBottom: 4 }]}>
            {t("caregiverLog.duration")}
          </Text>
          <TextInput
            testID="caregiver-log-walk-duration"
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
            placeholder={t("caregiverLog.durationPlaceholder")}
            placeholderTextColor={COLORS.mutedBrown}
            style={inputStyle}
          />

          <Text style={[TYPE.footnote, { color: COLORS.warmBrown, marginTop: SPACING.md, marginBottom: 4 }]}>
            {t("caregiverLog.notes")}
          </Text>
          <TextInput
            testID="caregiver-log-walk-notes"
            value={notes}
            onChangeText={setNotes}
            placeholder={t("caregiverLog.notesPlaceholder")}
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            style={[inputStyle, { minHeight: 64, textAlignVertical: "top" }]}
          />

          <PressableScale
            onPress={() => logWalk.mutate()}
            disabled={logWalk.isPending}
            accessibilityRole="button"
            testID="caregiver-log-walk-save"
            style={{
              marginTop: SPACING.lg,
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.card,
              paddingVertical: SPACING.md,
              alignItems: "center",
              opacity: logWalk.isPending ? 0.6 : 1,
            }}
          >
            {logWalk.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={[TYPE.headline, { color: "#FFF" }]}>{t("caregiverLog.save")}</Text>
            )}
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const inputStyle = {
  backgroundColor: COLORS.card,
  borderRadius: RADIUS.control,
  borderWidth: 1,
  borderColor: COLORS.peach,
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.sm + 2,
  color: COLORS.warmBrown,
  fontSize: 16,
};
