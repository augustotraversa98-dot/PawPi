import React from "react";
import { View, Text } from "react-native";
import { Camera, Lock } from "lucide-react-native";
import { COLORS, SPACING } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { PostCard } from "./PostCard";

// LockedFeedOverlay — the "post to unlock" tease.
//
// The feed query already returns the full following+suggested feed regardless of
// whether the viewer has posted, so we render ALL of it while locked — a
// SCROLLABLE, blurred BACKGROUND where each card shows clear identity (avatar /
// pet name / @handle / "by owner") but a BLURRED photo and an obscured caption
// (PostCard owns that blur + the Reduce-Transparency fallback). The incentive to
// post is being able to see WHO posted but not WHAT.
//
// Over that blurred feed sits ONE floating lock card (`LockedFloatingCard`),
// rendered as a sibling of the ScrollView in (tabs)/index.jsx so it stays PINNED
// while the feed scrolls behind it. There is no full-screen scrim (the old
// absoluteFill scrim read as opaque and blocked scrolling) and no post cap.
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

// The single floating lock card pinned over the blurred feed. It is positioned
// by its caller (a sibling of the ScrollView in (tabs)/index.jsx), so it stays
// put while the feed scrolls behind it. `top` lets the caller tuck it just below
// the daily-prompt card. The post count is folded into the subtext for a bit of
// social proof (no new data exposure — it comes straight from the fetched feed).
export function LockedFloatingCard({ count = 0, petName, onPostPress, top = 0 }) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        paddingHorizontal: SPACING.lg,
        alignItems: "center",
      }}
    >
      <View style={{ ...WARM_CARD, padding: 26, alignItems: "center", width: "100%" }}>
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
          {count > 0
            ? `${count} pet ${count === 1 ? "friend" : "friends"} shared today — post ${petName}'s moment to see their day.`
            : `Post ${petName}'s daily moment to see what your pet friends are up to.`}
        </Text>
        <UnlockCTA onPostPress={onPostPress} centered />
      </View>
    </View>
  );
}

// The "be the first" empty locked state — brand-new account or no friends have
// posted yet today. Friendly message + CTA, no scrim, never crashes with zero
// posts. There's nothing behind it, so no floating overlay is used here.
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

// The static blurred BACKDROP behind the floating lock card. The locked feed
// doesn't scroll, so the off-screen posts are unreachable — we render only the
// first few (enough to fill the screen behind the card) instead of the whole
// feed. The floating lock card is rendered separately (see LockedFloatingCard).
// With zero posts there's nothing to blur, so we show the "be the first" empty
// state and the caller skips the floating overlay.
const BACKDROP_POSTS = 3;

export function LockedFeedOverlay({ posts, petName, onPostPress }) {
  const list = Array.isArray(posts) ? posts : [];

  if (list.length === 0) {
    return <EmptyLockedState petName={petName} onPostPress={onPostPress} />;
  }

  return (
    <View>
      {list.slice(0, BACKDROP_POSTS).map((post) => (
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
