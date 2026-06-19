import { useAuth } from "@/utils/auth/useAuth";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { startReminderNotificationSync } from "@/utils/reminderNotificationSync";
import { initNotifications } from "@/utils/notifications";
import { AuthModal } from "@/utils/auth/useAuthModal";
import "@/i18n"; // i18n init side-effect (ticket 2.29)
import { initLocaleFromStorage } from "@/i18n/localePreference";

import { BUILD_MARKER } from "@/constants/buildMarker";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const { initiate, isReady } = useAuth();

  // TEMP diagnostic (2.77 tab fix): prove which bundle the device runs.
  useEffect(() => {
    if (__DEV__) {
      console.log(
        `🐾 [PAWPI-BOOT] build=${BUILD_MARKER} — bottom tabs: index, health, training, services, more (5th tab = Profile). If you see an expo-router warning "No route named ... exists in nested children", a tab name is mismatched.`,
      );
    }
  }, []);

  useEffect(() => {
    initiate();
  }, [initiate]);

  // Ask for notification permission + set up the Android channel ONCE at startup,
  // independent of the reminder loop (which now schedules silently).
  useEffect(() => {
    initNotifications();
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

  // Social data (notifications, DMs, discover) is fetched live from the API
  // (tickets 2.25–2.27) — no mock seeding at startup.

  useEffect(() => {
    if (isReady) {
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
        </Stack>
        <AuthModal />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
