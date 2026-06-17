import { Tabs } from "expo-router";
import { useEffect } from "react";
import {
  Home,
  HeartPulse,
  GraduationCap,
  Stethoscope,
  CircleUser,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import "@/i18n"; // ensure i18n is initialized wherever the tabs render (ticket 2.29)
import useRoutinesStore from "@/store/routinesStore";
import { startReminderNotificationSync } from "@/utils/reminderNotificationSync";
import { getScheduledNotifications } from "@/utils/notifications";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import useRemindersStore from "@/store/remindersStore";

export default function TabLayout() {
  const { t } = useTranslation();
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
        tabBarStyle: {
          backgroundColor: "#FFF7EF",
          borderTopWidth: 1,
          borderColor: "#FFD9B3",
          paddingBottom: 10,
          paddingTop: 8,
          shadowColor: "#B75D32",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 8,
        },
        tabBarActiveTintColor: "#FF6F61",
        tabBarInactiveTintColor: "#B5947F",
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
          tabBarIcon: ({ color }) => <CircleUser color={color} size={23} />,
          // Safety net (ticket 2.19): leaving the More tab pops its stack to the landing
          // page and tears down any in-progress pushed flow / routine-creation modal, so
          // tapping More always reopens its root — even if some unforeseen push slipped in.
          popToTopOnBlur: true,
        }}
      />
    </Tabs>
  );
}
