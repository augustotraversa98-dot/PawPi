import { Tabs } from "expo-router";
import { useEffect } from "react";
import {
  Home,
  HeartPulse,
  GraduationCap,
  Stethoscope,
  MoreHorizontal,
} from "lucide-react-native";
import useRoutinesStore from "@/store/routinesStore";
import { startReminderNotificationSync } from "@/utils/reminderNotificationSync";
import { getScheduledNotifications } from "@/utils/notifications";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import useRemindersStore from "@/store/remindersStore";

export default function TabLayout() {
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
          title: "Feed",
          tabBarIcon: ({ color }) => <Home color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: "Health",
          tabBarIcon: ({ color }) => <HeartPulse color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Training",
          tabBarIcon: ({ color }) => <GraduationCap color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: "Services",
          tabBarIcon: ({ color }) => <Stethoscope color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="more/index"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => <MoreHorizontal color={color} size={23} />,
        }}
      />
    </Tabs>
  );
}
