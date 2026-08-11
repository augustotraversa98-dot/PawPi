import React from "react";
import { Text, ActivityIndicator, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { UserPlus, Check } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { useAuth } from "@/utils/auth/useAuth";
import { useProviderFollow, useToggleProviderFollow } from "@/hooks/useProviders";

// Follow / Following toggle for a business (ticket 2.92). A signed-in pet owner taps to
// follow/unfollow (optimistic via useToggleProviderFollow; reverts on error). A guest sees the
// button but is prompted to sign in. Shows the provider's follower count beside it. Everything
// degrades cleanly server-side while provider_follows (0083) is unapplied → 0 followers / not
// following, and the tap is accepted as a no-op (never crashes the provider screen).
export default function ProviderFollowButton({ providerId }) {
  const { t } = useTranslation();
  const { isAuthenticated, signIn } = useAuth();
  const { data } = useProviderFollow(providerId);
  const toggle = useToggleProviderFollow(providerId);

  const following = !!data?.following;

  const onPress = () => {
    if (!isAuthenticated) {
      Alert.alert(t("storefront.follow.signInPrompt"), undefined, [
        { text: t("storefront.follow.signInCta"), onPress: signIn },
        { text: "", style: "cancel" },
      ]);
      return;
    }
    if (toggle.isPending) return;
    toggle.mutate(
      { following },
      {
        onError: () => Alert.alert(t("storefront.follow.toggleError")),
      },
    );
  };

  // The follower COUNT is intentionally not shown here anymore (ticket 2.93) — it lives in the
  // Posts-tab stat row. This is just the toggle; the caller places it beside the Message action.
  return (
    <PressableScale
      testID="provider-follow-button"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: following }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm + 2,
        borderRadius: RADIUS.chip,
        borderWidth: 1.5,
        borderColor: following ? COLORS.peach : COLORS.coral,
        backgroundColor: following ? COLORS.card : COLORS.coral,
      }}
    >
      {toggle.isPending ? (
        <ActivityIndicator size="small" color={following ? COLORS.coral : "#FFF"} />
      ) : following ? (
        <Check size={16} color={COLORS.coral} />
      ) : (
        <UserPlus size={16} color="#FFF" />
      )}
      <Text
        style={[
          TYPE.footnote,
          { fontWeight: "800", color: following ? COLORS.coral : "#FFF" },
        ]}
      >
        {following ? t("storefront.follow.following") : t("storefront.follow.follow")}
      </Text>
    </PressableScale>
  );
}
