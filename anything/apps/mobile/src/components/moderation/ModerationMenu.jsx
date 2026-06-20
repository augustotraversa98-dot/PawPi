import React, { useState } from "react";
import { View, Text, Modal, Pressable, Alert } from "react-native";
import { MoreHorizontal, Flag, Ban, ChevronLeft, X } from "lucide-react-native";
import { COLORS, TYPE, RADIUS, SPACING } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { reportContent, blockUser } from "@/hooks/useModeration";

// Shared Report + Block overflow menu (Guideline 1.2, ticket T4). Drop ONE of these into any
// UGC surface's header/row. It renders a "···" trigger that opens a sheet with:
//   • Report  → reason picker → POST /api/reports (idempotent; double-report is a no-op)
//   • Block user (only when an author is known + it's not your own content) → confirm → POST /api/blocks
// Own content renders nothing here (the surface shows its own Delete instead).

export const REPORT_REASONS = [
  { key: "spam", label: "Spam or scam" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "hate", label: "Hate speech" },
  { key: "sexual", label: "Nudity or sexual content" },
  { key: "violence", label: "Violence or threats" },
  { key: "other", label: "Something else" },
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
  triggerLabel = "More options",
  onBlocked,
}) {
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
      Alert.alert("Thanks for reporting", "Our team will review this within 24 hours.");
    } catch (e) {
      Alert.alert("Couldn't report", e?.message || "Please try again.");
    }
  };

  const confirmBlock = () => {
    close();
    Alert.alert(
      "Block this user?",
      "You won't see each other's posts, comments, walks, or messages, and neither of you can contact the other.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser({ blockedUserId: authorUserId });
              Alert.alert("User blocked", "Their content will disappear from your app.");
              onBlocked?.();
            } catch (e) {
              Alert.alert("Couldn't block", e?.message || "Please try again.");
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
        accessibilityLabel={triggerLabel}
        hitSlop={8}
      >
        <MoreHorizontal size={iconSize} color={iconColor} />
      </PressableScale>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          onPress={close}
          accessibilityLabel="Dismiss menu"
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
                    label="Report"
                    accessibilityLabel="Report"
                    onPress={() => setView("reasons")}
                  />
                ) : null}
                {canBlock ? (
                  <Row
                    icon={<Ban size={20} color={COLORS.coral} />}
                    label="Block user"
                    accessibilityLabel="Block user"
                    destructive
                    onPress={confirmBlock}
                  />
                ) : null}
                <Row
                  icon={<X size={20} color={COLORS.mutedBrown} />}
                  label="Cancel"
                  accessibilityLabel="Cancel"
                  onPress={close}
                />
              </View>
            ) : (
              <View>
                <Row
                  icon={<ChevronLeft size={20} color={COLORS.mutedBrown} />}
                  label="Why are you reporting this?"
                  accessibilityLabel="Back"
                  onPress={() => setView("actions")}
                />
                {REPORT_REASONS.map((r) => (
                  <Row
                    key={r.key}
                    icon={<Flag size={18} color={COLORS.mutedBrown} />}
                    label={r.label}
                    accessibilityLabel={`Report reason ${r.label}`}
                    onPress={() => submitReport(r.key)}
                  />
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default ModerationMenu;
