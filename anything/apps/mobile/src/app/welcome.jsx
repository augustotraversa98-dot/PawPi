import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthModal } from "@/utils/auth/store";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { Button, PressableScale } from "@/components/ui";
import {
  didForceStartupFallback,
  didLastBootStall,
  lastBootSummary,
} from "../../__create/boot-trace";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open } = useAuthModal();

  // Startup diagnostic (boot breadcrumbs): only visible when this launch
  // needed the hard fallback or the previous launch stalled. A milestone code
  // for TestFlight debugging — never an error message or stack trace.
  let startupDiagnostic = null;
  try {
    if (didForceStartupFallback() || didLastBootStall()) {
      startupDiagnostic = lastBootSummary() || "startup fallback used this launch";
    }
  } catch (_err) {
    startupDiagnostic = null;
  }

  const handleCreateAccount = () => {
    open({ mode: "signup" });
  };

  const handleLogin = () => {
    open({ mode: "signin" });
  };

  // Password recovery runs on the same web surface as sign-in/sign-up: the auth modal builds
  // `${baseURL}/account/${mode}`, so this opens the real /account/forgot-password screen (backed by
  // POST /api/account/forgot-password). Until now that screen was only reachable via the link on
  // the sign-in page — an owner who couldn't get past login had to guess it was in there.
  const handleForgotPassword = () => {
    open({ mode: "forgot-password" });
  };

  const handleVetAccess = () => {
    router.push("/vet-business-access");
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + SPACING.xl,
          paddingBottom: insets.bottom + SPACING.huge,
          paddingHorizontal: SPACING.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Vet/Business Access Link */}
        <PressableScale
          onPress={handleVetAccess}
          style={{
            alignSelf: "flex-end",
            marginBottom: SPACING.huge,
          }}
        >
          <Text
            style={[
              TYPE.subhead,
              {
                color: COLORS.coral,
                textDecorationLine: "underline",
              },
            ]}
          >
            Access for vets & businesses
          </Text>
        </PressableScale>

        {/* Logo/Icon */}
        <View style={{ alignItems: "center", marginTop: 60, marginBottom: SPACING.huge }}>
          <Text style={{ fontSize: 80, marginBottom: SPACING.xl }}>🐾</Text>
          <Text
            style={[
              TYPE.largeTitle,
              {
                fontSize: 36,
                color: COLORS.warmBrown,
                letterSpacing: -1,
              },
            ]}
          >
            PawPi
          </Text>
        </View>

        {/* Tagline */}
        <Text
          style={[
            TYPE.body,
            {
              fontSize: 18,
              color: COLORS.mutedBrown,
              textAlign: "center",
              lineHeight: 28,
              marginBottom: 60,
              paddingHorizontal: SPACING.xl,
            },
          ]}
        >
          Your pet's daily care, moments, and community — all in one place.
        </Text>

        {/* Spacer to push buttons down */}
        <View style={{ flex: 1 }} />

        {/* Buttons */}
        <View style={{ gap: SPACING.lg, marginTop: SPACING.huge }}>
          {/* Create Account Button */}
          <Button
            title="Create account"
            variant="primary"
            size="lg"
            onPress={handleCreateAccount}
          />

          {/* Log In Button */}
          <Button
            title="Log in"
            variant="secondary"
            size="lg"
            onPress={handleLogin}
          />

          {/* Forgot password */}
          <PressableScale
            onPress={handleForgotPassword}
            accessibilityRole="button"
            accessibilityLabel="Forgot password?"
            style={{ alignSelf: "center", paddingVertical: SPACING.sm }}
          >
            <Text
              style={[
                TYPE.subhead,
                { color: COLORS.mutedBrown, textDecorationLine: "underline" },
              ]}
            >
              Forgot password?
            </Text>
          </PressableScale>
        </View>

        {startupDiagnostic ? (
          <Text
            style={{
              marginTop: 16,
              fontSize: 11,
              color: "#B9A79A",
              textAlign: "center",
            }}
          >
            Startup diagnostic: {startupDiagnostic}
          </Text>
        ) : null}

      </ScrollView>
    </View>
  );
}
