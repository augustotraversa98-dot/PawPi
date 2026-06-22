import React from "react";
import { View, Text } from "react-native";
import { Camera, PawPrint } from "lucide-react-native";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { PostCard } from "./PostCard";

// LockedFeedOverlay — the BeReal-style "post to unlock" tease (2.77 fix).
//
// The feed query already returns the full following+suggested feed regardless of
// whether the viewer has posted, so we render ALL of it while locked — a
// SCROLLABLE tease where each card shows clear identity (avatar / pet name /
// @handle / "by owner") but a BLURRED photo and an obscured caption. There is no
// full-screen scrim and no post cap: the old absoluteFill scrim read as opaque
// and blocked scrolling, so the feed felt fully locked and empty. The incentive
// to post is being able to see WHO posted but not WHAT.
//
// A sticky unlock bar lives OUTSIDE this scroll content (in (tabs)/index.jsx) so
// it stays pinned while scrolling; the inline CTA here is a second entry point.
//
// VISUAL: the locked-state chrome is the pre-glass "warm solid" look — solid
// cream cards with a soft terracotta shadow + peach hairline border, NOT the
// frosted GlassSurface used by the unlocked feed. Only the locked state reverts.

// Solid warm card (pre-glass aesthetic): opaque card surface, soft terracotta
// shadow, 1.5px peach border.
const WARM_CARD = {
  backgroundColor: COLORS.card,
  borderRadius: 26,
  shadowColor: COLORS.terracotta,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.12,
  shadowRadius: 24,
  elevation: 8,
  borderWidth: 1.5,
  borderColor: COLORS.peach,
};

// Solid coral CTA button (pre-glass aesthetic).
const WARM_BUTTON = {
  backgroundColor: COLORS.coral,
  borderRadius: 16,
  paddingVertical: 14,
  paddingHorizontal: 28,
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "flex-start",
  gap: 8,
  shadowColor: COLORS.coral,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
};

// The social-proof header — "N pet friends shared today" + an inline CTA. Count
// comes straight from the already-fetched posts list (no new data exposure).
function SocialProofHeader({ count, petName, onPostPress }) {
  return (
    <View
      style={{
        ...WARM_CARD,
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.lg,
        padding: 26,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <PawPrint size={16} color={COLORS.terracotta} />
        <Text
          style={{
            fontSize: 18,
            fontWeight: "800",
            color: COLORS.warmBrown,
            letterSpacing: -0.3,
          }}
        >
          {count} pet {count === 1 ? "friend" : "friends"} shared today
        </Text>
      </View>
      <Text
        style={{
          fontSize: 13,
          color: COLORS.mutedBrown,
          lineHeight: 19,
          marginBottom: 20,
        }}
      >
        Post {petName}'s daily moment to see their day.
      </Text>
      <UnlockCTA onPostPress={onPostPress} />
    </View>
  );
}

// The "be the first" empty locked state — brand-new account or no friends have
// posted yet today. Friendly message + CTA, no scrim, never crashes with zero
// posts.
function EmptyLockedState({ petName, onPostPress }) {
  return (
    <View
      style={{
        ...WARM_CARD,
        marginHorizontal: SPACING.lg,
        marginTop: SPACING.lg,
        padding: 26,
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 40, marginBottom: 8 }}>🐾</Text>
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
        No pet friends have posted yet
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
        Be the first! Post {petName}'s daily moment to start today's feed.
      </Text>
      <UnlockCTA onPostPress={onPostPress} centered />
    </View>
  );
}

function UnlockCTA({ onPostPress, centered }) {
  return (
    <PressableScale
      onPress={onPostPress}
      accessibilityRole="button"
      style={[WARM_BUTTON, centered && { alignSelf: "center" }]}
    >
      <Camera size={18} color="#FFF" />
      <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 15 }}>
        Post today's photo
      </Text>
    </PressableScale>
  );
}

export function LockedFeedOverlay({ posts, petName, onPostPress }) {
  const list = Array.isArray(posts) ? posts : [];

  if (list.length === 0) {
    return <EmptyLockedState petName={petName} onPostPress={onPostPress} />;
  }

  return (
    <View>
      <SocialProofHeader count={list.length} petName={petName} onPostPress={onPostPress} />
      {list.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          liked={false}
          locked
          onLockedPress={onPostPress}
        />
      ))}
    </View>
  );
}
