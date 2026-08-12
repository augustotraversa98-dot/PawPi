import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { PawPrint } from "lucide-react-native";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { PostCard } from "./PostCard";
import { BusinessPostCard } from "./BusinessPostCard";
import { ProviderFeedCard } from "./ProviderFeedCard";
import { AdoptionFeedCard } from "./AdoptionFeedCard";
import { interleaveSuggestions } from "@/utils/feed/interleaveSuggestions";

export function UnlockedFeed({
  posts,
  likedPosts,
  onToggleLike,
  onOpenBarks,
  onOpenDetail,
  onOpenProfile,
  suggestions,
  onOpenProvider,
  onOpenAdoption,
  onOpenBusinessPost,
  streakByPetId = {},
}) {
  // Phase 2 ticket 2.13 — interleave provider/adoption "suggestion" cards between pet posts at a
  // controlled cadence + cap (see interleaveSuggestions). Posts keep their order/identity; the
  // BeReal lock upstream is unaffected (this only runs in the UNLOCKED feed).
  const items = useMemo(
    () => interleaveSuggestions(posts, suggestions),
    [posts, suggestions],
  );

  // "Suggested for you" divider (ticket 2.58): the feed comes Following-first then
  // Suggested (each pet post carries feed_group from the API). Show the divider before
  // the FIRST suggested pet post — but only when there's followed content above it, so
  // it's a real boundary and never a dangling label over an empty Following section.
  const { dividerBeforeId } = useMemo(() => {
    const hasFollowing = items.some(
      (it) => !it.kind && it.feed_group === "following",
    );
    const firstSuggested = items.find(
      (it) => !it.kind && it.feed_group === "suggested",
    );
    return {
      dividerBeforeId:
        hasFollowing && firstSuggested ? firstSuggested.id : null,
    };
  }, [items]);

  const SuggestedDivider = () => (
    <View
      testID="suggested-divider"
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: SPACING.xl,
        paddingTop: 6,
        paddingBottom: SPACING.md,
        gap: 6,
      }}
    >
      <PawPrint size={14} color={COLORS.terracotta} />
      <Text style={[TYPE.overline, { color: COLORS.mutedBrown }]}>
        SUGGESTED FOR YOU
      </Text>
    </View>
  );

  return (
    <>
      {/* Pet friends label */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          gap: 6,
        }}
      >
        <PawPrint size={14} color={COLORS.terracotta} />
        <Text style={[TYPE.overline, { color: COLORS.mutedBrown }]}>
          PET FRIENDS' MOMENTS
        </Text>
      </View>

      {items.map((item) => {
        // Items render at full opacity with NO entrance animation — content
        // visibility must never depend on a layout animation completing (see
        // src/constants/motion.js). Motion here is limited to PostCard's
        // PressableScale press + the 2.64 double-tap paw, which can't hide rows.
        //
        // Suggestion cards carry a `kind` discriminator; pet posts never do, so they can never
        // be confused (no fake pet posts).
        if (item.kind === "provider") {
          return (
            <ProviderFeedCard
              key={`provider-${item.id}`}
              provider={item}
              onPress={() => onOpenProvider?.(item)}
            />
          );
        }
        if (item.kind === "adoption") {
          return (
            <AdoptionFeedCard
              key={`adoption-${item.id}`}
              listing={item}
              onPress={() => onOpenAdoption?.(item)}
            />
          );
        }
        // Business "daily moment" from a followed provider — its own card + detail route.
        // Keyed distinctly so its id space never collides with a pet post's.
        if (item.item_type === "provider_post") {
          return (
            <BusinessPostCard
              key={`business-${item.id}`}
              post={item}
              onPress={() => onOpenBusinessPost?.(item)}
            />
          );
        }
        return (
          <React.Fragment key={item.id}>
            {item.id === dividerBeforeId && <SuggestedDivider />}
            <PostCard
              post={item}
              liked={!!likedPosts[item.id]}
              locked={false}
              streak={streakByPetId[item.pet_id] || 0}
              onToggleLike={() => onToggleLike(item.id)}
              onOpenBarks={() => onOpenBarks(item)}
              onOpenDetail={() => onOpenDetail(item)}
              onOpenProfile={() => onOpenProfile(item)}
            />
          </React.Fragment>
        );
      })}

      {posts.length === 0 && (
        <View style={{ alignItems: "center", padding: 50 }}>
          <Text style={{ fontSize: 40 }}>🐾</Text>
          <Text style={[TYPE.headline, { color: COLORS.mutedBrown, marginTop: SPACING.md }]}>
            No pet moments yet!
          </Text>
          <Text
            style={[
              TYPE.subhead,
              { color: COLORS.mutedBrown, marginTop: 4, textAlign: "center", fontWeight: "500" },
            ]}
          >
            Be the first to share today's moment.
          </Text>
        </View>
      )}
    </>
  );
}
