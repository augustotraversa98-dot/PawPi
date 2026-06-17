import { useAuth } from "@/utils/auth/useAuth";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useSocialPetStore from "@/store/socialPetStore";
import { mockNotifications } from "@/data/mockNotificationsData";
import { mockConversations, mockMessages } from "@/data/mockConversationsData";
import {
  mockPopularProfiles,
  mockPopularPetMoments,
} from "@/data/mockDiscoveryData";
import { startReminderNotificationSync } from "@/utils/reminderNotificationSync";
import { initNotifications } from "@/utils/notifications";
import { AuthModal } from "@/utils/auth/useAuthModal";

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

  useEffect(() => {
    initiate();
  }, [initiate]);

  // Ask for notification permission + set up the Android channel ONCE at startup,
  // independent of the reminder loop (which now schedules silently).
  useEffect(() => {
    initNotifications();
  }, []);

  // Start reminder notification sync
  useEffect(() => {
    const cleanup = startReminderNotificationSync();
    return cleanup;
  }, []);

  // Initialize store with mock data
  useEffect(() => {
    const store = useSocialPetStore.getState();

    // Load mock notifications
    if (store.notifications.length === 0) {
      mockNotifications.forEach((notif) => {
        store.addNotification(notif);
      });
    }

    // Load mock conversations
    if (store.conversations.length === 0) {
      mockConversations.forEach((conv) => {
        store.addConversation(conv);
      });
      // Set mock messages directly
      Object.entries(mockMessages).forEach(([convId, msgs]) => {
        store.messages[convId] = msgs;
      });
    }

    // Load discovery data
    if (store.popularProfiles.length === 0) {
      store.setPopularProfiles(mockPopularProfiles);
    }
    if (store.popularPetMoments.length === 0) {
      store.setPopularPetMoments(mockPopularPetMoments);
    }
  }, []);

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
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
