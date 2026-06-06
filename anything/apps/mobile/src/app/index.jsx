import { useEffect, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/utils/auth/useAuth";

export default function EntryPoint() {
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState(null);
  const { auth, isReady, setAuth } = useAuth();

  useEffect(() => {
    async function determineRoute() {
      try {
        console.log("[EntryPoint] Starting route determination");
        console.log("[EntryPoint] Auth ready:", isReady, "Auth:", !!auth);

        // Wait for auth to be ready
        if (!isReady) {
          console.log("[EntryPoint] Waiting for auth to be ready");
          return;
        }

        // Not authenticated → Welcome screen
        if (!auth) {
          console.log("[EntryPoint] No auth, redirecting to /welcome");
          setDestination("/welcome");
          setLoading(false);
          return;
        }

        // Authenticated → Check for pets
        console.log("[EntryPoint] User authenticated, checking for pets");

        try {
          const petsResponse = await fetch("/api/pets");

          // A 401 means the stored token is invalid/stale (e.g. an Anything-era
          // JWT the new backend can't verify under the current AUTH_SECRET).
          // Don't mask it as "no pets" → onboarding. Clear the bad token
          // (setAuth(null) deletes the keychain key) and surface sign-in so the
          // user re-authenticates against the current backend and gets a JWT
          // the server can actually verify.
          if (petsResponse.status === 401) {
            console.warn(
              "[EntryPoint] 401 from /api/pets — invalid session, clearing token and routing to sign-in",
            );
            setAuth(null);
            setDestination("/welcome");
            setLoading(false);
            return;
          }

          if (!petsResponse.ok) {
            console.error("[EntryPoint] Pets API failed:", petsResponse.status);
            // If API fails, check AsyncStorage as fallback
            const cachedProfile = await AsyncStorage.getItem("pet_profile");
            const cachedOnboarding = await AsyncStorage.getItem(
              "has_completed_onboarding",
            );

            if (cachedProfile && cachedOnboarding === "true") {
              console.log(
                "[EntryPoint] Using cached data, redirecting to feed",
              );
              setDestination("/(tabs)");
            } else {
              console.log(
                "[EntryPoint] No cached data, redirecting to onboarding",
              );
              setDestination("/onboarding-photo");
            }
            setLoading(false);
            return;
          }

          const { pets } = await petsResponse.json();
          console.log("[EntryPoint] Pets found:", pets?.length || 0);

          if (pets && pets.length > 0) {
            // Has pets → Main app Feed
            console.log("[EntryPoint] User has pets, redirecting to feed");
            await AsyncStorage.setItem("has_completed_onboarding", "true");
            setDestination("/(tabs)");
          } else {
            // No pets → Onboarding
            console.log("[EntryPoint] No pets, redirecting to onboarding");
            setDestination("/onboarding-photo");
          }
        } catch (apiError) {
          console.error("[EntryPoint] API error:", apiError);
          // Fallback to cache
          const cachedProfile = await AsyncStorage.getItem("pet_profile");
          const cachedOnboarding = await AsyncStorage.getItem(
            "has_completed_onboarding",
          );

          if (cachedProfile && cachedOnboarding === "true") {
            console.log("[EntryPoint] API failed, using cache → feed");
            setDestination("/(tabs)");
          } else {
            console.log("[EntryPoint] API failed, no cache → onboarding");
            setDestination("/onboarding-photo");
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("[EntryPoint] Error determining route:", error);
        // On any error, default to welcome screen for safety
        setDestination("/welcome");
        setLoading(false);
      }
    }

    determineRoute();
  }, [isReady, auth]);

  // Show loading screen while determining route
  if (!isReady || loading || !destination) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#FFF7EF",
        }}
      >
        <Text style={{ fontSize: 72, marginBottom: 20 }}>🐾</Text>
        <ActivityIndicator size="large" color="#FF6F61" />
        <Text
          style={{
            marginTop: 16,
            fontSize: 16,
            fontWeight: "600",
            color: "#7A6254",
          }}
        >
          Loading...
        </Text>
      </View>
    );
  }

  console.log("[EntryPoint] Redirecting to:", destination);
  return <Redirect href={destination} />;
}
