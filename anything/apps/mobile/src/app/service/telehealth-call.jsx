import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";

// In-app telehealth call screen — the video consult itself, embedded via a WebView
// (Daily's own Prebuilt call UI at joinUrl, Option A: no native SDK, no rebuild). Reached from
// "Join video consult" for BOTH the pet-owner and vet/staff sides — both land here, not an
// external browser (Linking.openURL).
export default function TelehealthCallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { joinUrl } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // (AUDIT A-33) 15 s fallback: if the WebView never fires onLoadEnd (a stalled
  // connection), don't spin forever — surface the "could not load" screen so the
  // user can leave and retry instead of staring at a black loading overlay.
  useEffect(() => {
    if (!loading || error) return;
    const id = setTimeout(() => setError(true), 15000);
    return () => clearTimeout(id);
  }, [loading, error]);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/service/telehealth");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {!joinUrl || error ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: SPACING.xl,
            paddingTop: insets.top,
          }}
        >
          <Text style={[TYPE.headline, { color: "#FFF", textAlign: "center" }]}>
            {t("telehealth.couldNotLoadCall")}
          </Text>
        </View>
      ) : (
        <WebView
          source={{ uri: joinUrl }}
          style={{ flex: 1 }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          onLoadEnd={() => setLoading(false)}
          onError={() => setError(true)}
        />
      )}

      {loading && !error ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000",
          }}
        >
          <ActivityIndicator color={COLORS.coral} size="large" />
        </View>
      ) : null}

      <PressableScale
        onPress={leave}
        accessibilityRole="button"
        accessibilityLabel={t("telehealth.leaveCall")}
        style={{
          position: "absolute",
          top: insets.top + SPACING.sm,
          right: SPACING.lg,
          width: 40,
          height: 40,
          borderRadius: RADIUS.chip,
          backgroundColor: "rgba(0,0,0,0.55)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={22} color="#FFF" />
      </PressableScale>
    </View>
  );
}
