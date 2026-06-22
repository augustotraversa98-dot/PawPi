import React from "react";
import { View, Text } from "react-native";
import { Camera, PawPrint } from "lucide-react-native";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";
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

// The social-proof header — "N pet friends shared today" + an inline CTA. Count
// comes straight from the already-fetched posts list (no new data exposure).
function SocialProofHeader({ count, petName, onPostPress }) {
  return (
    <Card
      level="md"
      radius={RADIUS.card}
      borderColor={MATERIALS.hairline}
      style={{
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.lg,
        padding: SPACING.xl,
        borderWidth: 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: SPACING.sm }}>
        <PawPrint size={16} color={COLORS.terracotta} />
        <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
          {count} pet {count === 1 ? "friend" : "friends"} shared today
        </Text>
      </View>
      <Text
        style={[
          TYPE.subhead,
          { color: COLORS.mutedBrown, fontWeight: "500", lineHeight: 19, marginBottom: SPACING.lg },
        ]}
      >
        Post {petName}'s daily moment to see their day.
      </Text>
      <UnlockCTA onPostPress={onPostPress} />
    </Card>
  );
}

// The "be the first" empty locked state — brand-new account or no friends have
// posted yet today. Friendly message + CTA, no scrim, never crashes with zero
// posts.
function EmptyLockedState({ petName, onPostPress }) {
  return (
    <Card
      level="md"
      radius={RADIUS.card}
      borderColor={MATERIALS.hairline}
      style={{
        marginHorizontal: SPACING.lg,
        marginTop: SPACING.lg,
        padding: SPACING.xxl,
        alignItems: "center",
        borderWidth: 1,
      }}
    >
      <Text style={{ fontSize: 40, marginBottom: SPACING.sm }}>🐾</Text>
      <Text
        style={[TYPE.title2, { color: COLORS.warmBrown, textAlign: "center", marginBottom: SPACING.sm }]}
      >
        No pet friends have posted yet
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
        Be the first! Post {petName}'s daily moment to start today's feed.
      </Text>
      <UnlockCTA onPostPress={onPostPress} />
    </Card>
  );
}

function UnlockCTA({ onPostPress }) {
  return (
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
        alignSelf: "flex-start",
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
