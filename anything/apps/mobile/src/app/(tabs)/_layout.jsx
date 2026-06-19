import { Tabs } from "expo-router";
import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
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
import { GlassSurface } from "@/components/ui";
import {
  COLORS,
  RADIUS,
  MATERIALS,
  ELEVATION,
  BLUR,
} from "@/constants/theme";
import "@/i18n"; // ensure i18n is initialized wherever the tabs render (ticket 2.29)

// The Profile tab icon is the active pet's PHOTO (ticket 2.60) — a small circular
// avatar with an active-state coral ring; falls back to the neutral paw/dog glyph
// (2.55) when there's no photo or no pet.
function ProfileTabIcon({ focused }) {
  // useCurrentPet may be loading / have no pet — that's fine: PetAvatar always
  // renders (photo → initials → paw glyph), so this never returns null or throws
  // and the tab always has a valid icon regardless of pet/loading state.
  const { data: currentPet } = useCurrentPet();
  return (
    <View
      style={{
        borderWidth: 2,
        borderColor: focused ? COLORS.coral : "transparent",
        borderRadius: 16,
        padding: 1,
      }}
    >
      <PetAvatar
        uri={currentPet?.avatar_url || undefined}
        name={currentPet?.name}
        size={24}
      />
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
        // margins lifted off the bottom edge (above the home indicator). Kept
        // IN-FLOW (margins reserve its footprint) rather than position:absolute,
        // so it never covers the last row of scrolling content. Routes, tabs and
        // navigation behavior are unchanged (purely visual).
        //
        // Liquid Glass (2.77): the fill is now a translucent expo-blur surface
        // (tabBarBackground) so content diffuses softly behind the bar, with a
        // lighter hairline + softer shadow. The frame itself is transparent so
        // the blur shows; GlassSurface falls back to a solid cream fill under
        // Reduce Transparency.
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
          // Softer, warmer lift than the old chunky shadow.
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
        // The route for the `more/` FOLDER (it has its own _layout) is the folder
        // segment "more" — NOT "more/index". Declaring "more/index" matched no tab
        // route, so expo-router silently dropped these options and auto-rendered
        // the `more` tab with its default label ("more") + default icon, and the
        // 2.19 popToTopOnBlur safety net never attached. Using the real segment
        // makes the title (Profile), the avatar icon, and popToTopOnBlur apply.
        name="more"
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
