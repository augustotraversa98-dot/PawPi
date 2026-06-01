import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Repeat, Settings } from "lucide-react-native";

// Import only Routines and Settings tabs
import RoutinesTab from "@/components/Health/Reminders/RoutinesTab";
import SettingsTab from "@/components/Health/Reminders/SettingsTab";

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

const TABS = {
  ROUTINES: "routines",
  SETTINGS: "settings",
};

export default function RemindersRoutinesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(TABS.ROUTINES);

  const TabButton = ({ tab, label, icon: Icon }) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        onPress={() => setActiveTab(tab)}
        style={{
          flex: 1,
          paddingVertical: 12,
          alignItems: "center",
          borderBottomWidth: 2,
          borderBottomColor: isActive ? C.coral : "transparent",
        }}
      >
        <Icon
          size={20}
          color={isActive ? C.coral : C.mutedBrown}
          strokeWidth={isActive ? 2.5 : 2}
        />
        <Text
          style={{
            fontSize: 12,
            fontWeight: isActive ? "700" : "600",
            color: isActive ? C.coral : C.mutedBrown,
            marginTop: 4,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 12 }}
          >
            <ArrowLeft size={22} color={C.warmBrown} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: C.warmBrown,
                letterSpacing: -0.5,
              }}
            >
              Reminders & Routines
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                marginTop: 2,
              }}
            >
              Set your pet's care schedule and reminder preferences
            </Text>
          </View>
        </View>
      </View>

      {/* Tab Bar - Only Routines and Settings */}
      <View
        style={{
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
          flexDirection: "row",
        }}
      >
        <TabButton tab={TABS.ROUTINES} label="Routines" icon={Repeat} />
        <TabButton tab={TABS.SETTINGS} label="Settings" icon={Settings} />
      </View>

      {/* Tab Content */}
      {activeTab === TABS.ROUTINES && <RoutinesTab />}
      {activeTab === TABS.SETTINGS && <SettingsTab />}
    </View>
  );
}
