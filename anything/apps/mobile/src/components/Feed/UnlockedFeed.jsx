import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { PawPrint } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
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

  const SuggestedDivider = () => (
    <View
      testID="suggested-divider"
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: 14,
        gap: 6,
      }}
    >
      <PawPrint size={14} color={COLORS.terracotta} />
      <Text
        style={{
          fontSize: 11,
          fontWeight: "800",
          color: COLORS.mutedBrown,
          letterSpacing: 0.7,
        }}
      >
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
          paddingHorizontal: 20,
          paddingBottom: 14,
          gap: 6,
        }}
      >
        <PawPrint size={14} color={COLORS.terracotta} />
        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: COLORS.mutedBrown,
            letterSpacing: 0.7,
          }}
        >
          PET FRIENDS' MOMENTS
        </Text>
      </View>

      {items.map((item) => {
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
          <Text
            style={{
              color: COLORS.mutedBrown,
              fontSize: 16,
              fontWeight: "600",
              marginTop: 12,
            }}
          >
            No pet moments yet!
          </Text>
          <Text
            style={{
              color: COLORS.mutedBrown,
              fontSize: 13,
              marginTop: 4,
              textAlign: "center",
            }}
          >
            Be the first to share today's moment.
          </Text>
        </View>
      )}
    </>
  );
}
