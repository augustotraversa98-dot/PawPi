import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Store, PawPrint, MessageCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
} from "@/constants/theme";
import { Card } from "@/components/ui";
import { FeedVideo } from "./FeedVideo";
import { formatRelativeTime } from "@/utils/relativeTime";

// A BUSINESS "daily moment" in the feed (business daily moments + video). Surfaces posts from
// providers the viewer FOLLOWS (provider_follows), mixed by recency with pet posts. Mirrors
// PostCard's structure — an author header (business logo + name + @handle + · time), full-width
// media (an image OR the inline FeedVideo player for a video post), a caption, and a paw/comment
// engagement row — but is visually marked as a business (a Store eyebrow + logo tile) so it can
// never be mistaken for a pet's daily moment. Tapping anywhere opens the existing provider-post
// detail (where paws + comments already work); the card itself is display-only.
export const BusinessPostCard = memo(function BusinessPostCard({ post, onPress }) {
  const { t } = useTranslation();

  const provider = post.provider ?? {};
  const name = provider.name || post.provider_name || "";
  const handle = provider.slug || post.provider_slug || "";
  const logo = provider.logo_url || post.provider_logo_url || null;

  const isVideo = post.media_type === "video";
  const videoUri = post.video_url || null;
  const posterUri = post.video_thumbnail_url || null;
  const photo =
    Array.isArray(post.image_urls) && post.image_urls.length > 0
      ? post.image_urls[0]
      : null;

  const pawsCount = Number(post.paw_count ?? 0);
  const commentCount = Number(post.comment_count ?? 0);
  const hasMedia = isVideo || !!photo;

  return (
    <Card
      level="md"
      radius={RADIUS.card}
      borderColor={COLORS.peach}
      style={{
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.lg,
        overflow: "hidden",
        borderWidth: 1,
      }}
    >
      {/* Author header — the BUSINESS (logo + name + @handle + · time). */}
      <TouchableOpacity
        testID="business-post-card"
        onPress={onPress}
        activeOpacity={0.85}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: SPACING.lg,
          gap: 10,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: COLORS.card,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderWidth: 1.5,
            borderColor: COLORS.peach,
          }}
        >
          {logo ? (
            <Image source={{ uri: logo }} style={{ width: 42, height: 42 }} contentFit="cover" />
          ) : (
            <Store size={20} color={COLORS.terracotta} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Store size={12} color={COLORS.terracotta} />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 0.7,
                color: COLORS.terracotta,
              }}
            >
              {t("feed.businessEyebrow")}
            </Text>
          </View>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]} numberOfLines={1}>
            {handle ? `@${handle} · ` : ""}
            {formatRelativeTime(post.created_at) || t("feed.justNow")}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Media — a video moment (inline player) or the first image. Tapping opens the detail. */}
      {isVideo ? (
        <FeedVideo
          testID="business-post-video"
          videoUri={videoUri}
          posterUri={posterUri}
          onDoubleTap={onPress}
          style={{ width: "100%", height: 320 }}
        />
      ) : photo ? (
        <TouchableOpacity testID="business-post-photo" onPress={onPress} activeOpacity={0.95}>
          <Image
            source={{ uri: photo }}
            style={{ width: "100%", height: 320, backgroundColor: COLORS.sand }}
            contentFit="cover"
          />
        </TouchableOpacity>
      ) : null}

      {/* Caption (business name bold + body) + engagement row → detail. */}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={{ padding: SPACING.lg }}
      >
        {post.body ? (
          <Text
            style={[TYPE.callout, { color: COLORS.warmBrown, marginBottom: SPACING.lg }]}
            numberOfLines={2}
          >
            <Text style={{ fontWeight: "800" }}>{name} </Text>
            {post.body}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.xl,
            paddingTop: post.body || hasMedia ? SPACING.md : 0,
            borderTopWidth: post.body || hasMedia ? 1 : 0,
            borderTopColor: MATERIALS.hairline,
          }}
        >
          <View style={styles.stat}>
            <PawPrint size={20} color={COLORS.mutedBrown} />
            <Text style={[TYPE.subhead, { color: COLORS.mutedBrown }]}>
              {pawsCount} {t("storefront.social.paws")}
            </Text>
          </View>
          <View style={styles.stat}>
            <MessageCircle size={18} color={COLORS.mutedBrown} />
            <Text style={[TYPE.subhead, { color: COLORS.mutedBrown }]}>
              {commentCount === 1
                ? t("storefront.comments.countOne", { count: commentCount })
                : t("storefront.comments.countOther", { count: commentCount })}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Card>
  );
});

const styles = StyleSheet.create({
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
});

export default BusinessPostCard;
