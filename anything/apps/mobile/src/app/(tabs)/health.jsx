import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Heart, Activity, TrendingUp, FileText, Utensils } from "lucide-react-native";

// Import the 4 section components (removed HealthReminders)
import HealthToday from "../../components/Health/HealthToday";
import HealthTrack from "../../components/Health/HealthTrack";
import HealthInsights from "../../components/Health/HealthInsights";
import HealthVetRecord from "../../components/Health/HealthVetRecord";
import { PetSwitcher } from "@/components/Pets/PetSwitcher";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

const SECTIONS = [
  { id: "today", label: "Today", icon: Heart },
  { id: "track", label: "Track", icon: Activity },
  { id: "insights", label: "Insights", icon: TrendingUp },
  { id: "vet-record", label: "Vet Record", icon: FileText },
];

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("today");

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
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 16,
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              fontSize: 26,
              fontWeight: "800",
              color: C.coral,
              letterSpacing: -0.5,
            }}
          >
            Health Hub
          </Text>
          <Text style={{ fontSize: 22 }}>🩺</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            testID="nutrition-button"
            onPress={() => router.push("/nutrition")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: C.sand,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Utensils size={15} color={C.coral} />
            <Text style={{ fontWeight: "800", color: C.coral, fontSize: 13 }}>
              Nutrition
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pet switcher */}
        <View style={{ marginBottom: 12 }}>
          <PetSwitcher variant="pill" />
        </View>

        {/* Disclaimer */}
        <View
          style={{
            backgroundColor: C.sand,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: C.mutedBrown,
              lineHeight: 16,
              textAlign: "center",
            }}
          >
            Social Pet helps you track changes and prepare better conversations
            with your veterinarian. It does not diagnose or replace professional
            veterinary care.
          </Text>
        </View>
      </View>

      {/* Top Segmented Navigation */}
      <View
        style={{
          backgroundColor: C.card,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            const Icon = section.icon;
            return (
              <TouchableOpacity
                key={section.id}
                onPress={() => setActiveSection(section.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 16,
                  backgroundColor: isActive ? C.coral : C.sand,
                  borderWidth: 1.5,
                  borderColor: isActive ? C.coral : C.peach,
                }}
              >
                <Icon size={16} color={isActive ? "#FFF" : C.terracotta} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: isActive ? "800" : "600",
                    color: isActive ? "#FFF" : C.warmBrown,
                  }}
                >
                  {section.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

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
