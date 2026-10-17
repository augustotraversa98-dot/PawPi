import { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, Pressable } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/utils/auth/useAuth";
import { determinePetsRoute } from "@/utils/auth/determinePetsRoute";
import { isUsableToken, startOver } from "@/utils/auth/recovery";
import { markBootStep, markBootComplete } from "../../__create/boot-trace";
import { markNavigationReady } from "@/utils/notificationDeepLink";
import { queryClient } from "@/utils/queryClient";
import {
  PETS_QUERY_KEY,
  MY_PROVIDERS_QUERY_KEY,
  fetchPets,
  fetchMyProviders,
} from "@/utils/launchQueries";
import { reportStartup } from "@/telemetry/startup";
import { PawMark } from "@/components/ui";
import { COLORS } from "@/constants/theme";

export default function EntryPoint() {
  markBootStep("entrypoint:render");
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState(null);
  const [error, setError] = useState(false);
  const { auth, isReady, setAuth } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  // The session (JWT) a destination has already been issued for — `undefined` until the first
  // decision. EntryPoint is the app's one-shot launch/sign-in gate: once it has routed a session
  // it must not re-run, because a re-run that sees a different answer (e.g. a transient empty
  // pets list) would redirect a user who is already inside the app back to onboarding/welcome.
  // Keyed on the JWT, not the `auth` object: the store can hand us a new object for the same
  // session (re-hydration, a user-info refresh) and that is not a new session. A real change —
  // logout (null), "Use a different account", a fresh sign-in — changes the key and routes again.
  const routedForSession = useRef(undefined);
  const sessionKey = auth?.jwt ?? null;

  const determineRoute = useCallback(async ({ force = false } = {}) => {
    if (isReady && !force && routedForSession.current === sessionKey) {
      return;
    }

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
      routedForSession.current = sessionKey;
      setDestination("/welcome");
      setLoading(false);
      return;
    }
    // A stored token that is not even a well-formed Bearer value makes header construction
    // throw on every fetch (→ "couldn't reach" forever). It is dead — clear it, don't retry.
    if (!isUsableToken(auth.jwt)) {
      console.log("[EntryPoint] Stored token is malformed, clearing session");
      setAuth(null);
      routedForSession.current = sessionKey;
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
    // The pets read goes through the shared React Query cache (key ["pets"], utils/launchQueries):
    // the tabs that mount right after this redirect find it fresh and do NOT fetch it again.
    // staleTime 0 + retry false keep the routing decision on a live read with no hidden retry.
    //
    // Role-aware entry: which providers this account is active STAFF of is only consulted on the
    // empty-pets branch (a business account must never be forced into pet onboarding), so it is
    // fetched ONLY there — an account that has pets never pays for it at launch. Best-effort: a
    // failed/slow providers read degrades to [] (not a business) and never blocks the pet flow.
    let providers = [];
    try {
      const pets = await queryClient.fetchQuery({
        queryKey: PETS_QUERY_KEY,
        queryFn: () => fetchPets({ signal: controller.signal }),
        staleTime: 0,
        retry: false,
      });
      if (!pets || pets.length === 0) {
        providers = await queryClient
          .fetchQuery({
            queryKey: MY_PROVIDERS_QUERY_KEY,
            queryFn: () => fetchMyProviders({ signal: controller.signal }),
            staleTime: 0,
            retry: false,
          })
          .catch(() => []);
      }
      outcome = { ok: true, status: 200, pets, providers };
    } catch (apiError) {
      if (typeof apiError?.status === "number") {
        // The server answered with a non-OK status (401/403 → login, 5xx → retry screen).
        outcome = { ok: false, status: apiError.status };
      } else {
        console.error("[EntryPoint] Pets fetch failed:", apiError);
        outcome = { networkError: true };
      }
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

    routedForSession.current = sessionKey;
    setDestination(result.destination);
    setLoading(false);
  }, [isReady, auth, sessionKey, setAuth]);

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
          backgroundColor: COLORS.cream,
          paddingHorizontal: 32,
        }}
      >
        {/* Back = start over: a post-login failure must never strand the user. */}
        <Pressable
          onPress={() => startOver({ setAuth, router })}
          accessibilityRole="button"
          accessibilityLabel={t("welcome.back")}
          hitSlop={12}
          style={{ position: "absolute", top: 60, left: 20, padding: 8 }}
        >
          <ArrowLeft size={24} color={COLORS.warmBrown} />
        </Pressable>
        <PawMark size={72} color={COLORS.coral} style={{ marginBottom: 20 }} />
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: COLORS.mutedBrown,
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {t("welcome.couldntReach")}
        </Text>
        <Pressable
          onPress={() => determineRoute({ force: true })}
          style={{
            backgroundColor: COLORS.coral,
            paddingHorizontal: 32,
            paddingVertical: 12,
            borderRadius: 24,
          }}
        >
          <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>
            {t("welcome.tryAgain")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => startOver({ setAuth, router })}
          accessibilityRole="button"
          style={{ marginTop: 16, paddingHorizontal: 32, paddingVertical: 12 }}
        >
          <Text style={{ color: COLORS.mutedBrown, fontSize: 16, fontWeight: "600" }}>
            {t("welcome.startOver")}
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
          backgroundColor: COLORS.cream,
        }}
      >
        <PawMark size={72} color={COLORS.coral} style={{ marginBottom: 20 }} />
        <ActivityIndicator size="large" color={COLORS.coral} />
        <Text
          style={{
            marginTop: 16,
            fontSize: 16,
            fontWeight: "600",
            color: COLORS.mutedBrown,
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
  // Anonymous telemetry: perf_startup from the boot trace (once per launch; never throws).
  reportStartup();
  // The redirect is now in place; a notification tap that launched the app (parked by
  // registerNotificationTapRouting) can be delivered on top of it.
  setTimeout(markNavigationReady, 0);
  return <Redirect href={destination} />;
}
