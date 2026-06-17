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
}) {
  // Phase 2 ticket 2.13 — interleave provider/adoption "suggestion" cards between pet posts at a
  // controlled cadence + cap (see interleaveSuggestions). Posts keep their order/identity; the
  // BeReal lock upstream is unaffected (this only runs in the UNLOCKED feed).
  const items = useMemo(
    () => interleaveSuggestions(posts, suggestions),
    [posts, suggestions],
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
          <PostCard
            key={item.id}
            post={item}
            liked={!!likedPosts[item.id]}
            locked={false}
            onToggleLike={() => onToggleLike(item.id)}
            onOpenBarks={() => onOpenBarks(item)}
            onOpenDetail={() => onOpenDetail(item)}
            onOpenProfile={() => onOpenProfile(item)}
          />
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
