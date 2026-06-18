import { Tabs } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import {
  Home,
  HeartPulse,
  GraduationCap,
  Stethoscope,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import "@/i18n"; // ensure i18n is initialized wherever the tabs render (ticket 2.29)

// The Profile tab icon is the active pet's PHOTO (ticket 2.60) — a small circular
// avatar with an active-state coral ring; falls back to the neutral paw/dog glyph
// (2.55) when there's no photo or no pet.
function ProfileTabIcon({ focused }) {
  const { data: currentPet } = useCurrentPet();
  return (
    <View
      style={{
        borderWidth: 2,
        borderColor: focused ? "#FF6F61" : "transparent",
        borderRadius: 16,
        padding: 1,
      }}
    >
      <PetAvatar uri={currentPet?.avatar_url || undefined} size={24} />
    </View>
  );
}
import useRoutinesStore from "@/store/routinesStore";
import { startReminderNotificationSync } from "@/utils/reminderNotificationSync";
import { getScheduledNotifications } from "@/utils/notifications";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import useRemindersStore from "@/store/remindersStore";

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    // Initialize reminders from routines on app start
    const routinesStore = useRoutinesStore.getState();
    const remindersStore = useRemindersStore.getState();

    // Generate reminders from all active routines
    const reminders = routinesStore.routines
      .filter((routine) => routine.isActive)
      .flatMap((routine) => generateRemindersFromRoutine(routine));

    // Schedule them, then (DEV only) confirm how many OS notifications landed.
    Promise.all(
      reminders.map((reminder) =>
        remindersStore.addReminderFromRoutine(reminder),
      ),
    ).then(async () => {
      if (__DEV__) {
        const scheduled = await getScheduledNotifications();
        console.log(`[notifications] scheduled count: ${scheduled.length}`);
      }
    });

    // Start notification sync
    const cleanup = startReminderNotificationSync();

    return cleanup;
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Floating Instagram-style pill (ticket 2.59): a rounded bar with side
        // margins lifted off the bottom edge (above the home indicator) with a
        // soft shadow and no top hairline. Kept IN-FLOW (margins reserve its
        // footprint) rather than position:absolute, so it never covers the last
        // row of scrolling content — no per-screen padding needed. Routes, tabs
        // and navigation behavior are unchanged (purely visual).
        tabBarStyle: {
          marginHorizontal: 16,
          marginBottom: Math.max(insets.bottom, 12),
          height: 62,
          borderRadius: 28,
          backgroundColor: "#FFF7EF",
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "#FFD9B3",
          paddingBottom: 0,
          paddingTop: 8,
          shadowColor: "#B75D32",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.14,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarActiveTintColor: "#FF6F61",
        tabBarInactiveTintColor: "#B5947F",
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.feed"),
          tabBarIcon: ({ color }) => <Home color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: t("tabs.health"),
          tabBarIcon: ({ color }) => <HeartPulse color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: t("tabs.training"),
          tabBarIcon: ({ color }) => <GraduationCap color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: t("tabs.services"),
          tabBarIcon: ({ color }) => <Stethoscope color={color} size={23} />,
          // Safety net (ticket 2.19): leaving the Services tab pops its stack to the grid
          // root, so it never reopens on a stale pushed screen.
          popToTopOnBlur: true,
        }}
      />
      <Tabs.Screen
        name="more/index"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
          // Safety net (ticket 2.19): leaving the More tab pops its stack to the landing
          // page and tears down any in-progress pushed flow / routine-creation modal, so
          // tapping More always reopens its root — even if some unforeseen push slipped in.
          popToTopOnBlur: true,
        }}
      />
    </Tabs>
  );
}
