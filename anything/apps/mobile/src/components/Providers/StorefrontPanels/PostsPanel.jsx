import React from "react";
import { View, Text, Image } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react-native";
import { Card, PressableScale } from "@/components/ui";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { stashProviderPost } from "@/utils/providerPostHandoff";
import { Section } from "./primitives";

// Posts section. Presentational: takes the already-fetched storefront feed (newest first). Each
// post carries a Report/Block menu (Guideline 1.2) — hidden on the staff author's own post
// (is_own). Renders nothing when empty.
//
// Phase C: each card is now TAPPABLE → the provider-post detail screen (post + comments). The
// post object is passed along so the detail renders instantly (guests can read without an auth'd
// refetch). A comment-count affordance invites the tap. `providerId` is required to build the
// detail route + comment API URL; when absent the card stays non-tappable.
export default function PostsPanel({ posts = [], providerId }) {
  const router = useRouter();
  const { t } = useTranslation();
  if (posts.length === 0) return null;

  const openPost = (post) => {
    if (providerId == null) return;
    // Pass ONLY URL-safe primitives through navigation; hand the rich post (body + signed image
    // URLs) off in memory so the deep-link URL stays clean and resolves to the detail screen
    // instead of falling back to the /service root (ticket 2.88).
    stashProviderPost(String(providerId), String(post.id), post);
    router.push({
      pathname: "/service/provider-post",
      params: { providerId: String(providerId), postId: String(post.id) },
    });
  };

  return (
    <Section title="Posts">
      {posts.map((post) => {
        const count = Number(post.comment_count ?? 0);
        return (
          <PressableScale
            key={post.id}
            onPress={() => openPost(post)}
            style={{ marginBottom: SPACING.sm + 2 }}
          >
            <Card
              testID="storefront-post"
              level="sm"
              radius={RADIUS.md}
              style={{ padding: SPACING.md + 2 }}
            >
              {/* Body + Report/Block menu (Guideline 1.2) — the menu hides Report on the staff
                  author's own post (is_own); non-owners can Report + Block. */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm }}>
                {post.body ? (
                  <Text
                    style={[
                      TYPE.callout,
                      { flex: 1, color: COLORS.warmBrown, lineHeight: 20 },
                    ]}
                  >
                    {post.body}
                  </Text>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <ModerationMenu
                  targetType="provider_post"
                  targetId={post.id}
                  authorUserId={post.author_user_id}
                  isOwn={!!post.is_own}
                  iconSize={18}
                />
              </View>
              {Array.isArray(post.image_urls) && post.image_urls.length > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: SPACING.sm,
                    marginTop: SPACING.sm + 2,
                  }}
                >
                  {post.image_urls.map((uri, i) => (
                    <Image
                      key={`${post.id}-img-${i}`}
                      testID="storefront-post-image"
                      source={{ uri }}
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: RADIUS.control,
                        backgroundColor: COLORS.sand,
                      }}
                    />
                  ))}
                </View>
              ) : null}
              {/* Comment-count affordance (invites the tap into the detail screen). */}
              <View
                testID="storefront-post-comment-count"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: SPACING.sm + 2,
                }}
              >
                <MessageCircle size={15} color={COLORS.mutedBrown} />
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                  {count === 1
                    ? t("storefront.comments.countOne", { count })
                    : t("storefront.comments.countOther", { count })}
                </Text>
              </View>
            </Card>
          </PressableScale>
        );
      })}
    </Section>
  );
}
