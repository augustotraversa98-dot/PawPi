import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/utils/auth/useAuth";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { PawMark } from "@/components/ui";

/**
 * Post-authentication hand-off.
 *
 * AuthWebView lands here after a successful sign-in. This screen deliberately makes NO
 * routing decision of its own: it waits for the auth store to be ready and then hands off
 * to the EntryPoint ("/"), which already owns the post-auth decision — a 12 s-bounded
 * pets + providers fetch, a "couldn't reach PawPi / Try again" state on network failure,
 * session clearing on 401/403, and the role-aware destination (feed / onboarding /
 * business) via `determinePetsRoute`.
 *
 * It used to re-implement that decision with weaker semantics (AUDIT_2026-09 A-03): two
 * un-timed fetches behind a full-screen spinner (could spin forever), a 5xx on /api/pets
 * sent the user to pet onboarding (the duplicate-pet path EntryPoint exists to prevent),
 * and business/staff accounts with no pets were forced into pet onboarding because it
 * never consulted /api/providers. Delegating removes all three failure modes.
 */
export default function AuthSuccessRedirect() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, isReady } = useAuth();

  useEffect(() => {
    if (!isReady) return;
    router.replace(isAuthenticated ? "/" : "/welcome");
  }, [isReady, isAuthenticated, router]);

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
          {t("welcome.settingUp")}
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
          {t("welcome.oneMoment")}
        </Text>
      </View>
    </View>
  );
}
