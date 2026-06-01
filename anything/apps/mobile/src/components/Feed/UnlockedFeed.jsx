import React from "react";
import { View, Text } from "react-native";
import { PawPrint } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { PostCard } from "./PostCard";

export function UnlockedFeed({
  posts,
  likedPosts,
  onToggleLike,
  onOpenBarks,
  onOpenDetail,
  onOpenProfile,
}) {
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

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          liked={!!likedPosts[post.id]}
          locked={false}
          onToggleLike={() => onToggleLike(post.id)}
          onOpenBarks={() => onOpenBarks(post)}
          onOpenDetail={() => onOpenDetail(post)}
          onOpenProfile={() => onOpenProfile(post)}
        />
      ))}

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
