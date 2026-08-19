import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useUser from "@/utils/auth/useUser";
import { useAuth } from "@/utils/auth/useAuth";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { PawMark } from "@/components/ui";

/**
 * Auth redirect handler
 * This page is shown after successful authentication
 * and routes the user to the correct screen based on their profile state
 */
export default function AuthSuccessRedirect() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: user, loading: userLoading, refetch } = useUser();
  const { isAuthenticated, isReady } = useAuth();
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [statusMessage, setStatusMessage] = useState(
    "Setting up your account...",
  );

  useEffect(() => {
    async function handleAuthRedirect() {
      try {
        console.log("[AuthSuccess] Starting auth redirect flow");

        // Wait for auth to be ready
        if (!isReady) {
          console.log("[AuthSuccess] Auth not ready yet");
          return;
        }

        // If not authenticated, redirect to welcome
        if (!isAuthenticated) {
          console.log(
            "[AuthSuccess] Not authenticated, redirecting to welcome",
          );
          router.replace("/welcome");
          return;
        }

        setStatusMessage("Loading your profile...");

        // Wait for user to load
        if (userLoading) {
          console.log("[AuthSuccess] User still loading");
          return;
        }

        console.log("[AuthSuccess] User loaded, fetching profile");

        // Get or create user profile
        setStatusMessage("Checking your profile...");
        const profileResponse = await fetch("/api/user-profile");

        if (!profileResponse.ok) {
          console.error(
            "[AuthSuccess] Profile fetch failed:",
            profileResponse.status,
          );
          // If unauthorized, redirect to welcome
          if (profileResponse.status === 401) {
            router.replace("/welcome");
            return;
          }
          throw new Error("Failed to fetch profile");
        }

        const { profile } = await profileResponse.json();

        if (!profile) {
          console.error("[AuthSuccess] No profile returned");
          router.replace("/welcome");
          return;
        }

        console.log("[AuthSuccess] Profile loaded, checking for pets");

        // Check if user has any pets
        setStatusMessage("Checking for pets...");
        const petsResponse = await fetch("/api/pets");

        if (!petsResponse.ok) {
          console.error(
            "[AuthSuccess] Pets fetch failed:",
            petsResponse.status,
          );
          // Default to onboarding if pets fetch fails
          router.replace("/onboarding-photo");
          return;
        }

        const { pets } = await petsResponse.json();
        console.log("[AuthSuccess] Pets found:", pets?.length || 0);

        if (pets && pets.length > 0) {
          console.log("[AuthSuccess] User has pets, redirecting to feed");
          // User has pets, mark onboarding complete and go to feed
          await fetch("/api/user-profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ onboarding_completed: true }),
          });
          router.replace("/(tabs)");
        } else {
          // No pets, redirect to onboarding
          console.log("[AuthSuccess] No pets found, redirecting to onboarding");
          router.replace("/onboarding-photo");
        }
      } catch (error) {
        console.error("[AuthSuccess] Error during redirect:", error);
        setStatusMessage("Something went wrong. Redirecting...");
        // Wait a moment then redirect to onboarding as safe default for logged-in users
        setTimeout(() => {
          router.replace("/onboarding-photo");
        }, 1500);
      } finally {
        setIsCheckingProfile(false);
      }
    }

    handleAuthRedirect();
  }, [isReady, isAuthenticated, userLoading, router, user, refetch]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.cream,
        justifyContent: "center",
        alignItems: "center",
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingHorizontal: SPACING.xxl,
      }}
    >
      <View style={{ alignItems: "center", gap: SPACING.xl }}>
        <PawMark size={72} color={COLORS.coral} />
        <ActivityIndicator size="large" color={COLORS.coral} />
        <Text
          style={[
            TYPE.headline,
            {
              fontSize: 18,
              color: COLORS.warmBrown,
              textAlign: "center",
            },
          ]}
        >
          {statusMessage}
        </Text>
        <Text
          style={[
            TYPE.callout,
            {
              color: COLORS.mutedBrown,
              textAlign: "center",
              marginTop: -10,
            },
          ]}
        >
          This will only take a moment...
        </Text>
      </View>
    </View>
  );
}
