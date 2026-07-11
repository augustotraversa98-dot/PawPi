import { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator, Text, Pressable } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/utils/auth/useAuth";
import { determinePetsRoute } from "@/utils/auth/determinePetsRoute";
import { markBootStep, markBootComplete } from "../../__create/boot-trace";

export default function EntryPoint() {
  markBootStep("entrypoint:render");
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState(null);
  const [error, setError] = useState(false);
  const { auth, isReady, setAuth } = useAuth();

  const determineRoute = useCallback(async () => {
    setError(false);
    setLoading(true);

    // Wait for auth to be ready
    if (!isReady) {
      return;
    }

    // Not authenticated → Welcome screen
    if (!auth) {
      console.log("[EntryPoint] No auth, redirecting to /welcome");
      markBootStep("entrypoint:no-auth-welcome");
      setDestination("/welcome");
      setLoading(false);
      return;
    }
    markBootStep("entrypoint:pets-fetch");

    // Authenticated → ask the server for pets. Resolve the routing from the
    // *outcome* of that call so an auth failure (401/403) and a transient
    // network failure aren't both mistaken for "no pets → onboarding".
    console.log("[EntryPoint] User authenticated, checking for pets");
    let outcome;
    // Bound the request so an unreachable/slow backend degrades to the retry
    // screen (networkError → action:'error') instead of leaving the EntryPoint
    // on "Loading..." forever. The SecureStore read in useAuth is already
    // timeout-guarded; this startup fetch was not.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const petsResponse = await fetch("/api/pets", { signal: controller.signal });
      if (petsResponse.ok) {
        const { pets } = await petsResponse.json();
        outcome = { ok: true, status: petsResponse.status, pets };
      } else {
        outcome = { ok: false, status: petsResponse.status };
      }
    } catch (apiError) {
      console.error("[EntryPoint] Pets fetch failed:", apiError);
      outcome = { networkError: true };
    } finally {
      clearTimeout(timeoutId);
    }

    const result = determinePetsRoute(outcome);
    console.log("[EntryPoint] Pets outcome:", outcome, "→", result.action);

    if (result.clearSession) {
      // Expired/invalid token: drop the stored JWT so the app stops reading
      // Auth: true with a dead token, then send the user to log in fresh.
      setAuth(null);
    }
    if (result.action === "home") {
      await AsyncStorage.setItem("has_completed_onboarding", "true");
    }
    if (result.action === "error") {
      // Network / non-auth failure: never onboarding (avoids duplicate pets
      // from a transient blip). Surface a retry instead.
      setError(true);
      setLoading(false);
      return;
    }

    setDestination(result.destination);
    setLoading(false);
  }, [isReady, auth, setAuth]);

  useEffect(() => {
    determineRoute();
  }, [determineRoute]);

  // Network / non-auth failure → retry state. Never silently onboarding.
  if (error) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#FFF7EF",
          paddingHorizontal: 32,
        }}
      >
        <Text style={{ fontSize: 72, marginBottom: 20 }}>🐾</Text>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: "#7A6254",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          We couldn't reach PawPi. Check your connection and try again.
        </Text>
        <Pressable
          onPress={determineRoute}
          style={{
            backgroundColor: "#FF6F61",
            paddingHorizontal: 32,
            paddingVertical: 12,
            borderRadius: 24,
          }}
        >
          <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>
            Try Again
          </Text>
        </Pressable>
      </View>
    );
  }

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
  markBootStep("entrypoint:redirect");
  markBootComplete();
  return <Redirect href={destination} />;
}
