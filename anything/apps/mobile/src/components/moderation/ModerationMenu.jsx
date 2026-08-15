import React, { useState } from "react";
import { View, Text, Modal, Pressable, Alert } from "react-native";
import { MoreHorizontal, Flag, Ban, ChevronLeft, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS, TYPE, RADIUS, SPACING } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { reportContent, blockUser } from "@/hooks/useModeration";

// Shared Report + Block overflow menu (Guideline 1.2, ticket T4). Drop ONE of these into any
// UGC surface's header/row. It renders a "···" trigger that opens a sheet with:
//   • Report  → reason picker → POST /api/reports (idempotent; double-report is a no-op)
//   • Block user (only when an author is known + it's not your own content) → confirm → POST /api/blocks
// Own content renders nothing here (the surface shows its own Delete instead).

// The reason `key` is the WIRE value sent to POST /api/reports — it must never be
// translated. Only the i18n key that renders it is presentational.
export const REPORT_REASONS = [
  { key: "spam", labelKey: "moderation.reasonSpam" },
  { key: "harassment", labelKey: "moderation.reasonHarassment" },
  { key: "hate", labelKey: "moderation.reasonHate" },
  { key: "sexual", labelKey: "moderation.reasonSexual" },
  { key: "violence", labelKey: "moderation.reasonViolence" },
  { key: "other", labelKey: "moderation.reasonOther" },
];

function Row({ icon, label, destructive, onPress, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.md,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon}
      <Text style={[TYPE.body, { color: destructive ? COLORS.coral : COLORS.warmBrown }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ModerationMenu({
  targetType,
  targetId,
  authorUserId = null,
  isOwn = false,
  iconColor = COLORS.mutedBrown,
  iconSize = 20,
  triggerLabel,
  onBlocked,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("actions"); // "actions" | "reasons"

  const canReport = targetType != null && targetId != null;
  const canBlock = authorUserId != null;

  // Own content is managed by the surface's own Delete — never Report/Block yourself.
  // Nothing to offer (no reportable target, no blockable author) → render nothing.
  if (isOwn || (!canReport && !canBlock)) return null;

  const close = () => {
    setOpen(false);
    setView("actions");
  };

  const submitReport = async (reason) => {
    close();
    try {
      await reportContent({ targetType, targetId, reason });
      Alert.alert(t("moderation.reportedTitle"), t("moderation.reportedBody"));
    } catch (e) {
      Alert.alert(
        t("moderation.reportFailedTitle"),
        e?.message || t("moderation.pleaseTryAgain"),
      );
    }
  };

  const confirmBlock = () => {
    close();
    Alert.alert(
      t("moderation.blockConfirmTitle"),
      t("moderation.blockConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("moderation.blockAction"),
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser({ blockedUserId: authorUserId });
              Alert.alert(
                t("moderation.blockedTitle"),
                t("moderation.blockedBody"),
              );
              onBlocked?.();
            } catch (e) {
              Alert.alert(
                t("moderation.blockFailedTitle"),
                e?.message || t("moderation.pleaseTryAgain"),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={triggerLabel ?? t("moderation.moreOptions")}
        hitSlop={8}
      >
        <MoreHorizontal size={iconSize} color={iconColor} />
      </PressableScale>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          onPress={close}
          accessibilityLabel={t("moderation.dismissMenu")}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}
        >
          <Pressable
            // Stop taps inside the sheet from dismissing it.
            onPress={() => {}}
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: RADIUS.sheet,
              borderTopRightRadius: RADIUS.sheet,
              paddingBottom: SPACING.xl,
              paddingTop: SPACING.sm,
            }}
          >
            {view === "actions" ? (
              <View>
                {canReport ? (
                  <Row
                    icon={<Flag size={20} color={COLORS.warmBrown} />}
                    label={t("moderation.report")}
                    accessibilityLabel={t("moderation.report")}
                    onPress={() => setView("reasons")}
                  />
                ) : null}
                {canBlock ? (
                  <Row
                    icon={<Ban size={20} color={COLORS.coral} />}
                    label={t("moderation.blockUser")}
                    accessibilityLabel={t("moderation.blockUser")}
                    destructive
                    onPress={confirmBlock}
                  />
                ) : null}
                <Row
                  icon={<X size={20} color={COLORS.mutedBrown} />}
                  label={t("common.cancel")}
                  accessibilityLabel={t("common.cancel")}
                  onPress={close}
                />
              </View>
            ) : (
              <View>
                <Row
                  icon={<ChevronLeft size={20} color={COLORS.mutedBrown} />}
                  label={t("moderation.reasonPrompt")}
                  accessibilityLabel={t("common.back")}
                  onPress={() => setView("actions")}
                />
                {REPORT_REASONS.map((r) => {
                  const label = t(r.labelKey);
                  return (
                    <Row
                      key={r.key}
                      icon={<Flag size={18} color={COLORS.mutedBrown} />}
                      label={label}
                      accessibilityLabel={t("moderation.reasonA11y", {
                        reason: label,
                      })}
                      onPress={() => submitReport(r.key)}
                    />
                  );
                })}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default ModerationMenu;
