import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Heart, Activity, TrendingUp, FileText, Utensils } from "lucide-react-native";

// Import the 4 section components (removed HealthReminders)
import HealthToday from "../../components/Health/HealthToday";
import HealthTrack from "../../components/Health/HealthTrack";
import HealthInsights from "../../components/Health/HealthInsights";
import HealthVetRecord from "../../components/Health/HealthVetRecord";
import { PetSwitcher } from "@/components/Pets/PetSwitcher";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { GlassSurface, PressableScale } from "@/components/ui";
import { useTranslation } from "react-i18next";

const SECTIONS = [
  { id: "today", labelKey: "health.today", icon: Heart },
  { id: "track", labelKey: "health.track", icon: Activity },
  { id: "insights", labelKey: "health.insights", icon: TrendingUp },
  { id: "vet-record", labelKey: "health.vetRecord.title", icon: FileText },
];

const VALID_SECTIONS = SECTIONS.map((s) => s.id);

export default function HealthScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Honor a `?section=` deep link (e.g. from the iOS widget, ticket 2.76);
  // ignore anything unknown and default to Today.
  const { section } = useLocalSearchParams();
  const initialSection =
    typeof section === "string" && VALID_SECTIONS.includes(section) ? section : "today";
  const [activeSection, setActiveSection] = useState(initialSection);

  const renderContent = () => {
    switch (activeSection) {
      case "today":
        return <HealthToday />;
      case "track":
        return <HealthTrack />;
      case "insights":
        return <HealthInsights />;
      case "vet-record":
        return <HealthVetRecord />;
      default:
        return <HealthToday />;
    }
  };

  // Today and Vet Record own their scroll container (each wires its own
  // pull-to-refresh), so they render directly. Track and Insights have no
  // scroller of their own and rely on the shared wrapper below.
  const selfScrolling =
    activeSection === "today" || activeSection === "vet-record";

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.lg,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
            marginBottom: SPACING.md,
          }}
        >
          <Text style={[TYPE.largeTitle, { color: COLORS.coral }]}>
            {t("health.hubTitle")}
          </Text>
          <Text style={{ fontSize: 22 }}>🩺</Text>
          <View style={{ flex: 1 }} />
          <PressableScale
            testID="nutrition-button"
            onPress={() => router.push("/nutrition")}
            accessibilityRole="button"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: MATERIALS.glassTintLight,
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.md,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: MATERIALS.hairline,
            }}
          >
            <Utensils size={15} color={COLORS.coral} />
            <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>
              {t("health.nutritionButton")}
            </Text>
          </PressableScale>
        </View>

        {/* Pet switcher */}
        <View style={{ marginBottom: SPACING.md }}>
          <PetSwitcher variant="pill" />
        </View>

        {/* Disclaimer */}
        <View
          style={{
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            padding: SPACING.md,
            borderWidth: 1,
            borderColor: MATERIALS.hairline,
          }}
        >
          <Text style={[TYPE.caption, { color: COLORS.mutedBrown, lineHeight: 16, textAlign: "center", letterSpacing: 0 }]}>
            {t("health.disclaimer")}
          </Text>
        </View>
      </GlassSurface>

      {/* Top Segmented Navigation */}
      <GlassSurface
        intensity={BLUR.regular}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.md,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: SPACING.sm }}
        >
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            const Icon = section.icon;
            return (
              <PressableScale
                key={section.id}
                onPress={() => setActiveSection(section.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: SPACING.lg,
                  paddingVertical: SPACING.sm + 2,
                  borderRadius: RADIUS.control,
                  backgroundColor: isActive ? COLORS.coral : MATERIALS.glassTintLight,
                  borderWidth: 1,
                  borderColor: isActive ? COLORS.coral : MATERIALS.hairline,
                }}
              >
                <Icon size={16} color={isActive ? "#FFF" : COLORS.terracotta} />
                <Text
                  style={[
                    TYPE.callout,
                    {
                      fontWeight: isActive ? "800" : "600",
                      color: isActive ? "#FFF" : COLORS.warmBrown,
                    },
                  ]}
                >
                  {t(section.labelKey)}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </GlassSurface>

      {/* Content Area */}
      {selfScrolling ? (
        <View style={{ flex: 1 }}>{renderContent()}</View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
        >
          {renderContent()}
        </ScrollView>
      )}
    </View>
  );
}
