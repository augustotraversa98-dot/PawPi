import React, { useState } from "react";
import { View, Text, ActivityIndicator, Alert, Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTranslation } from "react-i18next";
import { COLORS, TYPE, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { signInWithApple, signInWithGoogle } from "@/utils/auth/socialAuth";

// The social sign-in buttons shown on the Welcome screen. Each button appears only when its
// provider is actually available (see useSocialProviders) — there is no "coming soon".
//
//  • Apple uses the official native AppleAuthentication button (App Store guideline 4.8 / Sign in
//    with Apple design requirement) — never a custom-styled substitute.
//  • Google uses a neutral bordered button ("Continue with Google") that opens the system browser.
//
// On success it hands { jwt, user } to onAuthenticated (the caller stores it + routes). A user
// cancel resolves to null and does nothing; a genuine failure shows a localized alert.
export function SocialSignInButtons({ showGoogle, showApple, onAuthenticated }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(null); // 'apple' | 'google' | null

  if (!showGoogle && !showApple) return null;

  const run = async (which, fn) => {
    if (busy) return;
    setBusy(which);
    try {
      const result = await fn();
      if (result?.jwt) {
        onAuthenticated(result);
      }
    } catch (err) {
      console.error(`[social] ${which} sign-in failed:`, err?.message);
      Alert.alert(t("welcome.social.errorTitle"), t("welcome.social.errorBody"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: SPACING.md }}>
      {/* Divider */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md, marginVertical: SPACING.sm }}>
        <View style={{ flex: 1, height: 1, backgroundColor: COLORS.sand }} />
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>{t("welcome.social.dividerOr")}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: COLORS.sand }} />
      </View>

      {showApple && Platform.OS === "ios" ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={RADIUS?.lg ?? 12}
          style={{ height: 52, width: "100%" }}
          onPress={() => run("apple", signInWithApple)}
        />
      ) : null}

      {showGoogle ? (
        <PressableScale
          onPress={() => run("google", signInWithGoogle)}
          accessibilityRole="button"
          accessibilityLabel={t("welcome.social.continueGoogle")}
          disabled={!!busy}
          style={{
            height: 52,
            borderRadius: RADIUS?.lg ?? 12,
            borderWidth: 1,
            borderColor: COLORS.sand,
            backgroundColor: COLORS.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACING.sm,
          }}
        >
          {busy === "google" ? (
            <ActivityIndicator color={COLORS.warmBrown} />
          ) : (
            <>
              <GoogleGlyph />
              <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
                {t("welcome.social.continueGoogle")}
              </Text>
            </>
          )}
        </PressableScale>
      ) : null}
    </View>
  );
}

// Google "G" wordmark colors, drawn simply (no network image, no brand asset shipped). Uses the
// four Google hues on a small SVG-free glyph made of Text so we add no image dependency.
function GoogleGlyph() {
  return (
    <Text style={{ fontSize: 18, fontWeight: "700", lineHeight: 20 }}>
      <Text style={{ color: "#4285F4" }}>G</Text>
    </Text>
  );
}

export default SocialSignInButtons;
