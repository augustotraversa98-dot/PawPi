import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, PawPrint } from "lucide-react-native";
import { COLORS, TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";
import { useGettingStarted } from "@/hooks/useGettingStarted";

// "Getting started" activation card (ticket 2.98) — a persistent card at the top of the Home tab
// that surfaces the high-value first actions. Every item's done/undone is DERIVED (never a stored
// flag); the card retires only when everything is genuinely complete, with a brief celebration.
// On-brand (coral/cream), encouraging, with a per-item CTA that jumps to the screen that completes it.

const HOW_LONG_CELEBRATION_MS = 3600;

export function GettingStartedCard({ onSharePost }) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    pet,
    activation,
    enableNotifications,
    celebrated,
    markCelebrated,
  } = useGettingStarted();
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  // No active pet → nothing to activate yet.
  if (!pet) return null;

  // Complete: play the celebration ONCE, then retire for good (derived — no manual dismiss).
  if (activation.isComplete) {
    if (celebrated || locallyDismissed) return null;
    return (
      <Celebration
        petName={pet.name}
        t={t}
        onDone={() => {
          markCelebrated();
          setLocallyDismissed(true);
        }}
      />
    );
  }

  const onPressItem = (key) => {
    switch (key) {
      case "basics":
      case "history":
        router.push("/(tabs)/more/profile-edit");
        break;
      case "reminder":
        router.push("/(tabs)/more/reminders");
        break;
      case "meal":
        router.push("/(tabs)/health");
        break;
      case "post":
        onSharePost?.();
        break;
      case "notifications":
        enableNotifications();
        break;
      default:
        break;
    }
  };

  return (
    <Card
      testID="getting-started-card"
      level="md"
      radius={RADIUS.card}
      borderColor={COLORS.peach}
      style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: SPACING.lg }}
    >
      {/* Header: a % badge + encouraging copy. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
        <ProgressBadge percent={activation.percent} />
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}>
            {t("gettingStarted.title")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
            {t("gettingStarted.progress", {
              completed: activation.completed,
              total: activation.total,
            })}
          </Text>
        </View>
      </View>

      {/* Thin progress bar echoing the badge. */}
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: COLORS.sand,
          overflow: "hidden",
          marginTop: SPACING.md,
          marginBottom: SPACING.sm,
        }}
      >
        <View
          testID="getting-started-progress-fill"
          style={{
            width: `${activation.percent}%`,
            height: "100%",
            backgroundColor: COLORS.coral,
            borderRadius: 3,
          }}
        />
      </View>

      {/* Checklist rows. */}
      {activation.items.map((item) => (
        <ChecklistRow
          key={item.key}
          itemKey={item.key}
          done={item.done}
          label={t(`gettingStarted.items.${item.key}`)}
          onPress={() => onPressItem(item.key)}
        />
      ))}
    </Card>
  );
}

// A circular % badge — a coral ring with the percentage centered (a lightweight "ring" without SVG).
function ProgressBadge({ percent }) {
  return (
    <View
      testID="getting-started-badge"
      style={{
        width: 54,
        height: 54,
        borderRadius: 27,
        borderWidth: 4,
        borderColor: COLORS.coral,
        backgroundColor: COLORS.coral + "14",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>
        {percent}%
      </Text>
    </View>
  );
}

function ChecklistRow({ itemKey, done, label, onPress }) {
  return (
    <PressableScale
      testID={`gs-item-${itemKey}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ checked: done }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.md,
        paddingVertical: SPACING.sm + 2,
      }}
    >
      {/* Done → filled coral check; undone → empty peach ring. */}
      <View
        testID={`gs-check-${itemKey}${done ? "-done" : ""}`}
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: done ? 0 : 2,
          borderColor: COLORS.peach,
          backgroundColor: done ? COLORS.coral : "transparent",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {done ? <Check size={15} color="#FFF" /> : null}
      </View>
      <Text
        style={[
          TYPE.body,
          {
            flex: 1,
            color: done ? COLORS.mutedBrown : COLORS.warmBrown,
            fontWeight: done ? "500" : "700",
            textDecorationLine: done ? "line-through" : "none",
          },
        ]}
      >
        {label}
      </Text>
      {!done ? <ChevronRight size={18} color={COLORS.mutedBrown} /> : null}
    </PressableScale>
  );
}

// Brief 100% celebration, then it calls onDone (which persists the celebrated flag + hides).
function Celebration({ petName, t, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, HOW_LONG_CELEBRATION_MS);
    return () => clearTimeout(timer);
    // onDone is stable enough for one-shot; deliberately run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card
      testID="getting-started-celebration"
      level="md"
      radius={RADIUS.card}
      borderColor={COLORS.coral}
      style={{
        marginHorizontal: SPACING.lg,
        marginTop: SPACING.md,
        padding: SPACING.xl,
        alignItems: "center",
      }}
    >
      <PawPrint size={40} color={COLORS.coral} fill={COLORS.coral} />
      <Text
        style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800", marginTop: SPACING.sm }]}
      >
        {t("gettingStarted.celebrateTitle")}
      </Text>
      <Text
        style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 4, textAlign: "center" }]}
      >
        {t("gettingStarted.celebrateBody", { petName: petName || t("gettingStarted.yourPet") })}
      </Text>
    </Card>
  );
}

export default GettingStartedCard;
