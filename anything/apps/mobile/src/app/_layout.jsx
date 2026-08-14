import { useAuth } from "@/utils/auth/useAuth";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/queryClient";
import { startReminderNotificationSync } from "@/utils/reminderNotificationSync";
import { startTelehealthReminderSync } from "@/utils/telehealthReminderSync";
import { initNotifications } from "@/utils/notifications";
import { recordAppOpenHour } from "@/utils/notificationPreferences";
import { AuthModal } from "@/utils/auth/useAuthModal";
import "@/i18n"; // i18n init side-effect (ticket 2.29)
import { initLocaleFromStorage } from "@/i18n/localePreference";
import { markBootStep } from "../../__create/boot-trace";

SplashScreen.preventAutoHideAsync();
markBootStep("layout:module-evaluated");

export default function RootLayout() {
  const { initiate, isReady } = useAuth();
  markBootStep("layout:render");

  useEffect(() => {
    markBootStep("layout:initiate-effect");
    initiate();
  }, [initiate]);

  // Ask for notification permission + set up the Android channel ONCE at startup,
  // independent of the reminder loop (which now schedules silently).
  useEffect(() => {
    initNotifications();
    // E5: learn the owner's usual open hour so the streak-save nudge sends at their time.
    recordAppOpenHour(new Date().getHours());
  }, []);

  // Apply the saved language override (ticket 2.29) — defaults to the phone's language.
  useEffect(() => {
    initLocaleFromStorage();
  }, []);

  // Start reminder notification sync
  useEffect(() => {
    const cleanup = startReminderNotificationSync();
    return cleanup;
  }, []);

  // Schedule/cancel local "video consult starts in 5 minutes" reminders for upcoming
  // telehealth bookings, independent of which screen the owner is on.
  useEffect(() => {
    const cleanup = startTelehealthReminderSync();
    return cleanup;
  }, []);

  // Social data (notifications, DMs, discover) is fetched live from the API
  // (tickets 2.25–2.27) — no mock seeding at startup.

  useEffect(() => {
    if (isReady) {
      markBootStep("layout:splash-hide");
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} initialRouteName="index">
          <Stack.Screen name="index" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="onboarding-photo" />
          <Stack.Screen name="onboarding-photo-preview" />
          <Stack.Screen name="vet-business-access" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="pet-profile" />
          <Stack.Screen name="follows" />
          {/* Emergency Card (ticket 2.51) — owner-facing; the public tag/vet pages are web. */}
          <Stack.Screen name="emergency-card" />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Business mode (business daily moments) — a provider/business account posts moments
              and glances here; management stays on the web extranet. */}
          <Stack.Screen name="business" options={{ headerShown: false }} />
          {/* Shared service screens — a root-level stack OVER the tabs, so opening a
              service from any tab never buries the More tab root (ticket 2.19). */}
          <Stack.Screen name="service" options={{ headerShown: false }} />
          <Stack.Screen
            name="notifications"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen name="search" options={{ presentation: "modal" }} />
          <Stack.Screen name="messages" options={{ presentation: "modal" }} />
          <Stack.Screen name="chat" />
          {/* Owner ↔ provider messaging (ticket 2.5) — distinct from the social-pet
              messages/chat screens above. */}
          <Stack.Screen name="provider-messages" />
          <Stack.Screen name="provider-chat" />
          {/* Live walk watch + report (ticket 2.7, owner). */}
          <Stack.Screen name="walk-live" />
          {/* Walker workspace — start/track/finish booked walks (ticket 2.7). */}
          <Stack.Screen name="walker-walks" />
          {/* Sitter workspace — log per-visit updates for booked sitting jobs (ticket 2.9). */}
          <Stack.Screen name="sitter-visits" />
          {/* Adoption applications review (business hub, A2) — pushed from Today's glance row. */}
          <Stack.Screen name="business-adoption" />
        </Stack>
        <AuthModal />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
