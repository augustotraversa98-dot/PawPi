import React, { useMemo } from "react";
import { View, Text } from "react-native";
import Animated from "react-native-reanimated";
import { PawPrint } from "lucide-react-native";
import { COLORS, TYPE, SPACING, listEntering } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useAccessibilityPrefs";
import { PostCard } from "./PostCard";
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

  const reduceMotion = useReducedMotion();

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

      {items.map((item, index) => {
        // Each item springs in on mount (cross-fades under Reduce Motion) — the
        // staggered list-enter motion from the design system.
        const entering = listEntering(reduceMotion, index);

        // Suggestion cards carry a `kind` discriminator; pet posts never do, so they can never
        // be confused (no fake pet posts).
        if (item.kind === "provider") {
          return (
            <Animated.View key={`provider-${item.id}`} entering={entering}>
              <ProviderFeedCard
                provider={item}
                onPress={() => onOpenProvider?.(item)}
              />
            </Animated.View>
          );
        }
        if (item.kind === "adoption") {
          return (
            <Animated.View key={`adoption-${item.id}`} entering={entering}>
              <AdoptionFeedCard
                listing={item}
                onPress={() => onOpenAdoption?.(item)}
              />
            </Animated.View>
          );
        }
        return (
          <React.Fragment key={item.id}>
            {item.id === dividerBeforeId && <SuggestedDivider />}
            <Animated.View entering={entering}>
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
            </Animated.View>
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
