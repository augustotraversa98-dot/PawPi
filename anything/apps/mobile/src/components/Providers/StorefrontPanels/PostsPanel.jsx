import React from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MessageCircle, Grid3X3 } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { MomentsGrid } from "@/components/social/MomentsGrid";
import { stashProviderPost } from "@/utils/providerPostHandoff";

// Business Posts section (ticket 2.93) — the SAME moments-style image grid the pet social
// profile uses, so a business profile reads like a pet's: image tiles (not a flat text+thumb
// list), each tappable into the post detail (`provider-post.jsx`) for full-size images + the
// comment flow (guest reads, signed-in owner comments — unchanged).
//
// Each post → one tile: its FIRST uploaded image is the cover; a text-only post shows a text
// tile so nothing is lost. A comment-count badge (Barks/comments) sits on the tile. Tapping
// hands the rich post off in memory + opens the detail route with clean, URL-safe params
// (ticket 2.88's fix — never a JSON blob in the URL). `providerId` is required to route +
// build the comment API URL; when absent the tiles stay inert.
export default function PostsPanel({ posts = [], providerId, business = null }) {
  const router = useRouter();
  const { t } = useTranslation();

  const openPost = (post) => {
    if (providerId == null) return;
    // Attach the business identity (name/slug/logo) so the detail can render a business author row
    // (like the pet post detail). Only spread it when provided so a bare `posts` render (tests /
    // cold path) stashes the post unchanged.
    stashProviderPost(
      String(providerId),
      String(post.id),
      business ? { ...post, business } : post,
    );
    router.push({
      pathname: "/service/provider-post",
      params: { providerId: String(providerId), postId: String(post.id) },
    });
  };

  const moments = posts.map((post) => ({
    id: post.id,
    imageUri:
      Array.isArray(post.image_urls) && post.image_urls.length > 0
        ? post.image_urls[0]
        : null,
    body: post.body,
    post,
    badge: {
      icon: <MessageCircle size={10} color="#FFF" />,
      count: Number(post.comment_count ?? 0),
    },
  }));

  return (
    <View style={{ marginBottom: SPACING.lg }}>
      {/* Section header — mirrors the pet profile's "Daily moments" header. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.sm,
          marginBottom: SPACING.md + 2,
        }}
      >
        <Grid3X3 size={18} color={COLORS.warmBrown} />
        <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}>
          {t("storefront.social.postsTitle")}
        </Text>
      </View>

      <MomentsGrid
        moments={moments}
        onOpen={(m) => openPost(m.post)}
        tileTestID="storefront-post"
        empty={
          <View
            style={{
              alignItems: "center",
              paddingVertical: SPACING.huge,
              backgroundColor: MATERIALS.surface,
              borderRadius: RADIUS.card,
              borderWidth: 1,
              borderColor: COLORS.peach,
              borderStyle: "dashed",
            }}
          >
            <Text style={{ fontSize: 34 }}>📸</Text>
            <Text
              style={[
                TYPE.body,
                { color: COLORS.mutedBrown, fontWeight: "600", marginTop: SPACING.md },
              ]}
            >
              {t("storefront.social.emptyTitle")}
            </Text>
            <Text
              style={[
                TYPE.subhead,
                {
                  color: COLORS.mutedBrown,
                  marginTop: SPACING.xs,
                  textAlign: "center",
                  paddingHorizontal: SPACING.xl,
                },
              ]}
            >
              {t("storefront.social.emptyBody")}
            </Text>
          </View>
        }
      />
    </View>
  );
}
