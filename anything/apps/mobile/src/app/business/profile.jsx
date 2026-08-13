import React, { useCallback } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ExternalLink, MessageCircle, Globe } from "lucide-react-native";
import { COLORS, TYPE, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import BusinessHeader from "@/components/Business/BusinessHeader";
import BusinessStatRow from "@/components/Providers/StorefrontPanels/BusinessStatRow";
import { MomentsGrid } from "@/components/social/MomentsGrid";
import { useActiveProvider } from "@/hooks/useActiveProvider";
import { useProviderProfile } from "@/hooks/useProviders";
import { stashProviderPost } from "@/utils/providerPostHandoff";

// Business mode v2 → Profile tab. The business's PUBLIC storefront/profile as followers see it,
// reusing the existing storefront-by-slug read (useProviderProfile) + the SAME shared components
// the storefront renders: BusinessStatRow (Followers · Posts · Paws · Barks, ticket 2.93) and the
// MomentsGrid (recent moments). "View public profile" deep-links to the full storefront screen;
// deep editing (services/products/hours) stays on the web dashboard ("Manage on web").
export default function BusinessProfile() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const { activeProvider } = useActiveProvider();
  const slug = activeProvider?.slug;
  const providerId = activeProvider?.id;

  const { data, isLoading, isError, refetch } = useProviderProfile(slug);
  const provider = data?.provider ?? activeProvider;
  const stats = data?.stats;
  const posts = data?.posts ?? [];

  // Map provider posts → the shared moments grid shape (image OR video poster; comment badge).
  const moments = posts.map((post) => {
    const images = Array.isArray(post?.image_urls) ? post.image_urls : [];
    const imageUri = post?.media_type === "video" ? post?.video_thumbnail_url : images[0];
    return {
      id: post.id,
      imageUri: imageUri || undefined,
      body: post.body,
      badge: {
        icon: <MessageCircle size={12} color="#FFF" />,
        count: Number(post?.comment_count ?? 0),
      },
      _post: post,
    };
  });

  const openPublicProfile = useCallback(() => {
    if (!slug) return;
    router.push({ pathname: "/service/provider", params: { slug: String(slug) } });
  }, [router, slug]);

  // Open a moment in the shared provider-post detail (paws + comments live there), mirroring the
  // Today tab's in-memory handoff + URL-safe params.
  const openMoment = useCallback(
    (moment) => {
      const post = moment?._post;
      if (post?.id == null || providerId == null) return;
      stashProviderPost(String(providerId), String(post.id), {
        ...post,
        business: {
          name: provider?.name ?? "",
          slug: provider?.slug ?? "",
          logo_url: provider?.logo_url ?? null,
        },
      });
      router.push({
        pathname: "/service/provider-post",
        params: { providerId: String(providerId), postId: String(post.id) },
      });
    },
    [providerId, provider, router],
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <BusinessHeader
        businessName={provider?.name || t("business.home.fallbackName")}
        logoUri={provider?.logo_url}
        title={t("business.profile.title")}
        subtitle={t("business.profile.subtitle")}
      />

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <View style={{ alignItems: "center", paddingVertical: SPACING.huge }}>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown, marginBottom: SPACING.md }]}>
            {t("business.profile.loadError")}
          </Text>
          <PressableScale
            onPress={() => refetch()}
            accessibilityRole="button"
            testID="business-profile-retry"
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.xl,
              paddingVertical: SPACING.sm,
            }}
          >
            <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "700" }]}>
              {t("business.profile.retry")}
            </Text>
          </PressableScale>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
          {/* The same stat strip the storefront shows (tapping-through handled by the storefront). */}
          <BusinessStatRow providerId={providerId} stats={stats} />

          <View style={{ padding: SPACING.xl }}>
            {provider?.bio ? (
              <Text style={[TYPE.callout, { color: COLORS.warmBrown, marginBottom: SPACING.lg }]}>
                {provider.bio}
              </Text>
            ) : null}

            {/* Primary action: open the full public storefront as a follower sees it. */}
            <PressableScale
              onPress={openPublicProfile}
              accessibilityRole="button"
              testID="business-profile-view-public"
              disabled={!slug}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.card,
                paddingVertical: SPACING.md,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.sm,
                opacity: slug ? 1 : 0.5,
              }}
            >
              <ExternalLink size={18} color="#FFF" />
              <Text style={[TYPE.headline, { color: "#FFF" }]}>
                {t("business.profile.viewPublic")}
              </Text>
            </PressableScale>

            {/* Recent moments — the same 3-up gallery the storefront uses. */}
            <Text style={[TYPE.title2, { color: COLORS.warmBrown, marginTop: SPACING.xxl, marginBottom: SPACING.md }]}>
              {t("business.profile.recentTitle")}
            </Text>
            <MomentsGrid
              moments={moments}
              onOpen={openMoment}
              tileTestID="business-profile-moment"
              empty={
                <View
                  style={{
                    backgroundColor: COLORS.card,
                    borderRadius: RADIUS.card,
                    padding: SPACING.xl,
                    borderWidth: 1,
                    borderColor: COLORS.peach,
                  }}
                >
                  <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginBottom: 4 }]}>
                    {t("business.profile.emptyTitle")}
                  </Text>
                  <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
                    {t("business.profile.emptyBody")}
                  </Text>
                </View>
              }
            />

            {/* Manage-on-web note. */}
            <View
              style={{
                marginTop: SPACING.xxl,
                backgroundColor: COLORS.card,
                borderRadius: RADIUS.card,
                padding: SPACING.lg,
                borderWidth: 1,
                borderColor: COLORS.peach,
                flexDirection: "row",
                gap: SPACING.md,
              }}
            >
              <Globe size={20} color={COLORS.sageDark} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.callout, { color: COLORS.warmBrown, fontWeight: "800", marginBottom: 2 }]}>
                  {t("business.profile.manageTitle")}
                </Text>
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                  {t("business.profile.manageBody")}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
