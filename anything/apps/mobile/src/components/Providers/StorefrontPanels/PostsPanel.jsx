import React from "react";
import { View, Text, Image } from "react-native";
import { Card } from "@/components/ui";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Section } from "./primitives";

// Posts section (moved verbatim from app/service/provider.jsx). Presentational: takes the
// already-fetched storefront feed (newest first). Each post carries a Report/Block menu
// (Guideline 1.2) — hidden on the staff author's own post (is_own). Renders nothing when empty.
export default function PostsPanel({ posts = [] }) {
  if (posts.length === 0) return null;
  return (
    <Section title="Posts">
      {posts.map((post) => (
        <Card
          key={post.id}
          testID="storefront-post"
          level="sm"
          radius={RADIUS.md}
          style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
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
                // The body row above is always rendered now (it carries the moderation menu
                // even when there is no body), so this margin is unconditional — SPACING.sm + 2
                // is the same 10pt as before.
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
        </Card>
      ))}
    </Section>
  );
}
