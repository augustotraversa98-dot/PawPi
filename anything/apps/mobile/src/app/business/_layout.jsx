import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { Home, CalendarClock, MessageSquare, Store } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@/components/ui";
import { COLORS, RADIUS, MATERIALS, ELEVATION, BLUR } from "@/constants/theme";
import "@/i18n"; // ensure i18n is initialized wherever the business tabs render

// Business mode v2 tab shell — the daily hub for a provider/business account: Today · Bookings ·
// Messages · Profile. Shown only in business mode (the post-login gate routes a staff-only account
// here; a both-owner-AND-staff account reaches it from the More menu). Every tab reflects the
// currently-active provider (activeProviderStore); the provider switcher lives in the Today header.
// Deep management (services/products/hours/adoption) stays on the PawPi web dashboard.
//
// Mirrors the pet-app (tabs)/_layout floating glass pill so the two shells read alike.
export default function BusinessLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          marginHorizontal: 16,
          marginBottom: Math.max(insets.bottom, 12),
          height: 62,
          borderRadius: RADIUS.bar,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          borderWidth: 0,
          paddingBottom: 0,
          paddingTop: 8,
          ...ELEVATION.lg,
        },
        tabBarBackground: () => (
          <GlassSurface
            intensity={BLUR.thick}
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: RADIUS.bar,
                borderWidth: 1,
                borderColor: MATERIALS.glassBorder,
              },
            ]}
          />
        ),
        tabBarActiveTintColor: COLORS.coral,
        tabBarInactiveTintColor: "#B5947F",
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("business.tabs.today"),
          tabBarIcon: ({ color }) => <Home color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t("business.tabs.bookings"),
          tabBarIcon: ({ color }) => <CalendarClock color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t("business.tabs.messages"),
          tabBarIcon: ({ color }) => <MessageSquare color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("business.tabs.profile"),
          tabBarIcon: ({ color }) => <Store color={color} size={23} />,
        }}
      />
    </Tabs>
  );
}
