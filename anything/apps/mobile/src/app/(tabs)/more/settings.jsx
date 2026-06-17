import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Bell,
  Lock,
  Eye,
  Globe,
  HelpCircle,
  PawPrint,
  Activity,
  Check,
} from "lucide-react-native";
import WalkTrackingSettings from "@/components/Health/WalkActivity/WalkTrackingSettings";
import {
  getLocalePreference,
  setLocalePreference,
} from "@/i18n/localePreference";

const C = {
  coral: "#FF6F61",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

// Language selector (ticket 2.29): System default / English / Español. Updates the app
// language immediately and persists the choice. "System default" follows the phone.
function LanguageSelector() {
  const { t } = useTranslation();
  const [pref, setPref] = useState("system");

  useEffect(() => {
    getLocalePreference().then(setPref);
  }, []);

  const choose = async (value) => {
    setPref(value);
    await setLocalePreference(value);
  };

  const OPTIONS = [
    { value: "system", label: t("settings.systemDefault") },
    { value: "en", label: t("settings.english") },
    { value: "es", label: t("settings.spanish") },
  ];

  return (
    <View>
      {OPTIONS.map((o, i) => (
        <TouchableOpacity
          key={o.value}
          testID={`lang-${o.value}`}
          onPress={() => choose(o.value)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
            borderBottomWidth: i < OPTIONS.length - 1 ? 1 : 0,
            borderBottomColor: "#FFD9B3",
          }}
        >
          <Text style={{ flex: 1, fontSize: 15, color: "#3B241B", fontWeight: "600" }}>
            {o.label}
          </Text>
          {pref === o.value ? <Check size={18} color="#FF6F61" /> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [feedReminder, setFeedReminder] = useState(true);
  const [healthAlerts, setHealthAlerts] = useState(true);
  const [communityUpdates, setCommunityUpdates] = useState(false);

  const SettingRow = ({
    label,
    icon: Icon,
    value,
    isSwitch = false,
    onValueChange,
  }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.peach,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 14,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <Icon size={18} color={C.mutedBrown} />
      </View>
      <Text
        style={{ flex: 1, fontSize: 15, color: C.warmBrown, fontWeight: "600" }}
      >
        {label}
      </Text>
      {isSwitch ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: C.peach, true: C.coral }}
          thumbColor="#FFF"
        />
      ) : (
        <Text style={{ color: C.mutedBrown, fontSize: 13, fontWeight: "600" }}>
          {value}
        </Text>
      )}
    </View>
  );

  const SectionCard = ({ children }) => (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 18,
        paddingHorizontal: 16,
        marginBottom: 22,
        borderWidth: 1,
        borderColor: C.peach,
        shadowColor: C.terracotta,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      }}
    >
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: C.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 14 }}
        >
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: "800", color: C.warmBrown }}>
          {t("settings.title")} ⚙️
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
          NOTIFICATIONS
        </Text>
        <SectionCard>
          <SettingRow
            label="Feed Reminders"
            icon={Bell}
            value={feedReminder}
            isSwitch
            onValueChange={setFeedReminder}
          />
          <SettingRow
            label="Health Alerts"
            icon={Lock}
            value={healthAlerts}
            isSwitch
            onValueChange={setHealthAlerts}
          />
          <SettingRow
            label="Community Updates"
            icon={Eye}
            value={communityUpdates}
            isSwitch
            onValueChange={setCommunityUpdates}
          />
        </SectionCard>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
          WALK TRACKING
        </Text>
        <SectionCard>
          <View style={{ paddingVertical: 6 }}>
            <WalkTrackingSettings />
          </View>
        </SectionCard>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
          {t("settings.language").toUpperCase()}
        </Text>
        <SectionCard>
          <LanguageSelector />
        </SectionCard>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
          PRIVACY & DATA
        </Text>
        <SectionCard>
          <SettingRow label="Account Privacy" icon={Lock} value="Public" />
        </SectionCard>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
          SUPPORT
        </Text>
        <SectionCard>
          <SettingRow label="Help Center" icon={HelpCircle} value="→" />
          <SettingRow label="Contact Us" icon={Globe} value="→" />
        </SectionCard>

        <View style={{ alignItems: "center", marginTop: 12, gap: 6 }}>
          <PawPrint size={20} color={C.peach} />
          <Text
            style={{ color: C.mutedBrown, fontSize: 12, fontWeight: "600" }}
          >
            Social Pet v1.0.0
          </Text>
          <Text style={{ color: C.peach, fontSize: 11 }}>
            Made with 🐾 for dog parents
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
