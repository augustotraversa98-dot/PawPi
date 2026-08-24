import { Tabs } from "expo-router";
import {
  NativeTabs,
  Icon,
  Label,
} from "expo-router/unstable-native-tabs";
import { useEffect } from "react";
import { View, StyleSheet, Platform, PlatformColor } from "react-native";
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
import { TABS } from "./tabsConfig";
import "@/i18n"; // ensure i18n is initialized wherever the tabs render (ticket 2.29)

// The Profile tab icon is the active pet's PHOTO (ticket 2.60) — a small circular
// avatar with an active-state coral ring; falls back to the neutral paw/dog glyph
// (2.55) when there's no photo or no pet.
//
// NOTE: this custom-component icon is ANDROID-ONLY. The iOS Liquid Glass native
// tab bar can't host an arbitrary React component as an icon (it takes SF Symbols
// or an image source), so on iOS the Profile tab uses the `pawprint.circle` SF
// Symbol from tabsConfig instead (see the native branch below).
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
import { syncLocaleToServer } from "@/i18n/localePreference";

// popToTopOnBlur (ticket 2.19) only applies to the Android JS bar. On iOS the
// native tab bar uses Apple's standard behavior (re-tap an active tab to pop its
// stack to root) — see LIQUID_GLASS_AUDIT.md §4a (approved).
const POP_TO_TOP_ON_BLUR = new Set(["services", "more"]);

// iOS 26 Liquid Glass native tab bar. The system renders the refractive glass
// material, the scroll-edge effect and the scroll-to-minimize behavior — so we
// deliberately set NO backgroundColor/blurEffect here (those only apply as an
// iOS-18-and-earlier fallback and would defeat the real material on iOS 26).
// Colors use semantic PlatformColor so the inactive label/icon adapts to
// light/dark automatically; the selected tint is the PawPi coral.
function NativeGlassTabs() {
  const { t } = useTranslation();
  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      iconColor={{
        default: PlatformColor("secondaryLabel"),
        selected: COLORS.coral,
      }}
      labelStyle={{
        default: { color: PlatformColor("secondaryLabel") },
        selected: { color: COLORS.coral },
      }}
    >
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <Label>{t(tab.titleKey)}</Label>
          <Icon
            sf={{ default: tab.sf, selected: tab.sfActive }}
            selectedColor={COLORS.coral}
          />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

// Android keeps the existing floating-pill JS bar (expo-blur GlassSurface). Do
// NOT ship NativeTabs on Android. The Profile tab keeps its live pet-photo avatar.
function AndroidGlassTabs() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Floating Instagram-style pill (ticket 2.59): a rounded bar with side
        // margins lifted off the bottom edge (above the home indicator). Kept
        // IN-FLOW (margins reserve its footprint) rather than position:absolute,
        // so it never covers the last row of scrolling content.
        //
        // Liquid Glass (2.77): the fill is a translucent expo-blur surface
        // (tabBarBackground) so content diffuses softly behind the bar. The frame
        // itself is transparent so the blur shows; GlassSurface falls back to a
        // solid cream fill under Reduce Transparency.
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
      {TABS.map((tab) => {
        const LucideIcon = tab.lucide;
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.titleKey),
              tabBarIcon:
                tab.name === "more"
                  ? ({ focused }) => <ProfileTabIcon focused={focused} />
                  : ({ color }) => <LucideIcon color={color} size={23} />,
              // Safety net (ticket 2.19): leaving Services / More pops their stack
              // to root so they never reopen on a stale pushed screen.
              ...(POP_TO_TOP_ON_BLUR.has(tab.name)
                ? { popToTopOnBlur: true }
                : {}),
            }}
          />
        );
      })}
    </Tabs>
  );
}

export default function TabLayout() {
  // FF1: once the authenticated pet shell mounts (i.e. on login/app entry), mirror the
  // app's resolved locale to the server so digest/win-back emails match. Best-effort.
  useEffect(() => {
    syncLocaleToServer();
  }, []);
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

  // Platform split: iOS gets the native Liquid Glass tab bar; Android keeps the
  // existing JS floating-pill bar. Never mix NativeTabs and <Tabs> in one tree.
  return Platform.OS === "ios" ? <NativeGlassTabs /> : <AndroidGlassTabs />;
}
