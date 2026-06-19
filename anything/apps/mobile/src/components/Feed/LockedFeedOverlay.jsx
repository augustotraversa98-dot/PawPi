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
} from "@/constants/theme";
import { GlassSurface, Card, PressableScale } from "@/components/ui";
import { PostCard } from "./PostCard";

// How many posts to render behind the lock so the area below the lock card
// doesn't look empty (BeReal-style tease).
const PREVIEW_COUNT = 6;

// The frosted "tease" scrim. Posts render at FULL opacity behind it and the
// blur + a light cream wash do the obscuring — NOT opacity — so the content is
// always clearly present-but-blurred (the old stack of BlurView(40) + a 72%
// tint over a 0.35 preview read as opaque/empty on device). The wash alone
// (rgba ~0.5) keeps the tease working even if the platform's blur is weak —
// correctness (posts visibly there, but not readable) beats a perfect blur.
const LOCK_BLUR_INTENSITY = 16;
const LOCK_WASH = "rgba(255, 247, 239, 0.5)"; // cream @ 50%

// Floor for the tease area so the scrim + lock card are always visible — even
// with NO posts to preview (brand-new account / no friends posting yet), where
// the preview is empty and an absoluteFill scrim would otherwise collapse to a
// blank strip. With posts, the preview is taller and the container grows past it.
const MIN_TEASE_HEIGHT = 520;

export function LockedFeedOverlay({ posts, petName, onPostPress }) {
  return (
    <View style={{ minHeight: MIN_TEASE_HEIGHT }}>
      {/* Full-opacity preview of the top posts — the blur/wash obscures them,
          not opacity, so they stay clearly visible behind the lock. */}
      <View pointerEvents="none">
        {posts.slice(0, PREVIEW_COUNT).map((post) => (
          <PostCard key={post.id} post={post} liked={false} locked />
        ))}
      </View>

      {/* Lock overlay — a frosted-glass scrim (2.77) over the visible preview;
          falls back to a solid cream wash under Reduce Transparency. */}
      <GlassSurface
        intensity={LOCK_BLUR_INTENSITY}
        glassColor={LOCK_WASH}
        experimentalBlurMethod="dimezisBlurView"
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
