import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Camera, Lock } from "lucide-react-native";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
  BLUR,
} from "@/constants/theme";
import { GlassSurface, Card, PressableScale } from "@/components/ui";
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

      {/* Lock overlay — a frosted-glass scrim (2.77) over the dimmed preview;
          falls back to a solid cream wash under Reduce Transparency. */}
      <GlassSurface
        intensity={BLUR.regular}
        glassColor={MATERIALS.glassTint}
        style={StyleSheet.absoluteFill}
        contentStyle={{
          flex: 1,
          justifyContent: "flex-start",
          alignItems: "center",
          paddingTop: 60,
          paddingHorizontal: SPACING.xxl,
        }}
        pointerEvents="box-none"
      >
        <Card
          level="lg"
          radius={RADIUS.sheet}
          borderColor={MATERIALS.hairline}
          style={{ padding: SPACING.xxl, alignItems: "center", width: "100%", borderWidth: 1.5 }}
        >
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: SPACING.md,
              borderWidth: 1,
              borderColor: MATERIALS.hairline,
            }}
          >
            <Lock size={26} color={COLORS.terracotta} />
          </View>
          <Text
            style={[
              TYPE.title2,
              { color: COLORS.warmBrown, textAlign: "center", marginBottom: SPACING.sm },
            ]}
          >
            Share today's pet moment to unlock the feed
          </Text>
          <Text
            style={[
              TYPE.subhead,
              {
                color: COLORS.mutedBrown,
                textAlign: "center",
                fontWeight: "500",
                lineHeight: 19,
                marginBottom: SPACING.xl,
              },
            ]}
          >
            Post {petName}'s daily update to see what your pet friends are up to.
          </Text>
          <PressableScale
            onPress={onPostPress}
            accessibilityRole="button"
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.md,
              paddingHorizontal: SPACING.xxl,
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              shadowColor: COLORS.coral,
              ...ELEVATION.sm,
            }}
          >
            <Camera size={18} color="#FFF" />
            <Text style={[TYPE.body, { color: "#FFF", fontWeight: "800" }]}>
              Post today's photo
            </Text>
          </PressableScale>
        </Card>
      </GlassSurface>
    </View>
  );
}
