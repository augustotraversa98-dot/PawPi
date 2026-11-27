import React, { useState } from "react";
import { View, Text, ActivityIndicator, Alert, Platform, Linking } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTranslation } from "react-i18next";
import { COLORS, TYPE, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { signInWithApple, signInWithGoogle } from "@/utils/auth/socialAuth";
import { trackFunnel } from "@/telemetry/track";
import { recordSocialConsent } from "@/utils/auth/recordSocialConsent";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/constants/legal";

// The social sign-in buttons shown on the Welcome screen and under the sign-in window. Each button appears only when
// its provider is actually available (see useSocialProviders) — there is no "coming soon". Continuing with one of them
// can create an account, so the Terms line below them is part of the component and the acceptance is recorded.
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
    trackFunnel("activation", "signup_or_oauth_start", { once: true }); // anonymous funnel
    setBusy(which);
    try {
      const result = await fn();
      if (result?.jwt) {
        recordSocialConsent(result.jwt); // not awaited: it must never hold up the sign-in
        onAuthenticated(result);
      }
    } catch (err) {
      console.error(`[social] ${which} sign-in failed:`, err?.message);
      Alert.alert(
        t("welcome.social.errorTitle"),
        err?.code === "GOOGLE_AUTH_REJECTED"
          ? t("welcome.social.googleDeniedBody")
          : t("welcome.social.errorBody"),
      );
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
          trackId="auth_google"
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

      <TermsLine />
    </View>
  );
}

function TermsLine() {
  const { t, i18n } = useTranslation();
  // The hosted legal pages open in Spanish unless asked for English.
  const open = (url) => {
    const target = String(i18n?.language ?? "").startsWith("en") ? `${url}?lang=en` : url;
    Linking.openURL(target).catch(() => {});
  };
  const link = (url, label) => (
    <Text
      accessibilityRole={url ? "link" : undefined}
      onPress={url ? () => open(url) : undefined}
      style={{ fontWeight: "800", color: COLORS.coral }}
    >
      {label}
    </Text>
  );

  return (
    <Text
      testID="social-terms"
      style={[TYPE.footnote, { color: COLORS.mutedBrown, textAlign: "center", lineHeight: 19 }]}
    >
      {t("welcome.social.agreePrefix")} {link(TERMS_OF_SERVICE_URL, t("welcome.social.terms"))} {t("welcome.social.and")}{" "}
      {link(PRIVACY_POLICY_URL, t("welcome.social.privacy"))}
      {t("welcome.social.agreeSuffix")}
    </Text>
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
