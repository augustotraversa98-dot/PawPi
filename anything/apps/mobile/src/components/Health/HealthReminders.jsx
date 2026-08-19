import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Calendar, Repeat, Settings } from "lucide-react-native";
import UpcomingTab from "./Reminders/UpcomingTab";
import RoutinesTab from "./Reminders/RoutinesTab";
import SettingsTab from "./Reminders/SettingsTab";

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

const TABS = {
  UPCOMING: "upcoming",
  ROUTINES: "routines",
  SETTINGS: "settings",
};

export default function HealthReminders() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(TABS.UPCOMING);

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
    <View style={{ flex: 1 }}>
      {/* Tab Bar */}
      <View
        style={{
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
          flexDirection: "row",
        }}
      >
        <TabButton tab={TABS.UPCOMING} label={t("health.remindersTabs.upcoming")} icon={Calendar} />
        <TabButton tab={TABS.ROUTINES} label={t("health.remindersTabs.routines")} icon={Repeat} />
        <TabButton tab={TABS.SETTINGS} label={t("health.remindersTabs.settings")} icon={Settings} />
      </View>

      {/* Tab Content */}
      {activeTab === TABS.UPCOMING && <UpcomingTab />}
      {activeTab === TABS.ROUTINES && <RoutinesTab />}
      {activeTab === TABS.SETTINGS && <SettingsTab />}
    </View>
  );
}
