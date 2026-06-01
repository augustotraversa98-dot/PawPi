import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Camera, Lock } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { PostCard } from "./PostCard";

export function LockedFeedOverlay({ posts, petName, onPostPress }) {
  return (
    <View>
      {/* Blurred / dimmed preview of 2 posts */}
      <View pointerEvents="none" style={{ opacity: 0.35 }}>
        {posts.slice(0, 2).map((post) => (
          <PostCard key={post.id} post={post} liked={false} locked />
        ))}
      </View>

      {/* Lock overlay */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: "flex-start",
          alignItems: "center",
          paddingTop: 60,
          paddingHorizontal: 28,
          backgroundColor: "rgba(255,247,239,0.72)",
        }}
        pointerEvents="box-none"
      >
        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 26,
            padding: 26,
            alignItems: "center",
            shadowColor: COLORS.terracotta,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.12,
            shadowRadius: 24,
            elevation: 8,
            borderWidth: 1.5,
            borderColor: COLORS.peach,
            width: "100%",
          }}
        >
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 14,
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            <Lock size={26} color={COLORS.terracotta} />
          </View>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: COLORS.warmBrown,
              textAlign: "center",
              letterSpacing: -0.3,
              marginBottom: 8,
            }}
          >
            Share today's pet moment to unlock the feed
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: COLORS.mutedBrown,
              textAlign: "center",
              lineHeight: 19,
              marginBottom: 20,
            }}
          >
            Post {petName}'s daily update to see what your pet friends are up
            to.
          </Text>
          <TouchableOpacity
            onPress={onPostPress}
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 28,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              shadowColor: COLORS.coral,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
            }}
          >
            <Camera size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 15 }}>
              Post today's photo
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
