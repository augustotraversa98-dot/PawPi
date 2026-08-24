import React from "react";
import { View, Text } from "react-native";
import { Camera } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { PostCard } from "./PostCard";

// LockedFeedOverlay — the "post to unlock" FOMO feed (feed polish #4).
//
// The feed query already returns the full following+suggested feed regardless of
// whether the viewer has posted. While locked we render ALL of it as a normal,
// SCROLLABLE list where each card shows clear identity (avatar / pet name /
// @handle / "by owner") but a BLURRED photo and an obscured caption (PostCard
// owns that blur + the Reduce-Transparency fallback). Each card carries a
// rotating, name-aware CTA ("Post today's moment to see what {petName} is up
// to") — so scrolling reveals WHO posted and drives the urge to post to see
// WHAT. The old frozen "single lock message over a 3-post backdrop" is gone: a
// frozen wall read as buggy, and one repeated message had no pull.
//
// VISUAL: the locked-state chrome is the pre-glass "warm solid" look — solid
// cream cards with a soft terracotta shadow + peach hairline border.

// Solid warm card (pre-glass aesthetic): opaque card surface, soft terracotta
// shadow, peach border. Used by the zero-post "be the first" empty state.
const WARM_CARD = {
  backgroundColor: COLORS.card,
  borderRadius: RADIUS.card,
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
  borderRadius: RADIUS.control,
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

// The "be the first" empty locked state — brand-new account or no friends have
// posted yet today. Friendly message + CTA; never crashes with zero posts.
function EmptyLockedState({ petName, onPostPress }) {
  const { t } = useTranslation();
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
        {t("feed.lockedEmptyTitle")}
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
        {t("feed.lockedEmptyBody", { petName })}
      </Text>
      <UnlockCTA onPostPress={onPostPress} centered />
    </View>
  );
}

function UnlockCTA({ onPostPress, centered }) {
  const { t } = useTranslation();
  return (
    <PressableScale
      onPress={onPostPress}
      accessibilityRole="button"
      style={[WARM_BUTTON, centered && { alignSelf: "center" }]}
    >
      <Camera size={18} color="#FFF" />
      <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 15 }}>
        {t("feed.lockedPostToday")}
      </Text>
    </PressableScale>
  );
}

export function LockedFeedOverlay({ posts, petName, onPostPress }) {
  const list = Array.isArray(posts) ? posts : [];

  if (list.length === 0) {
    return <EmptyLockedState petName={petName} onPostPress={onPostPress} />;
  }

  // Render the WHOLE feed, locked — the enclosing ScrollView scrolls it (feed
  // polish #4). Each card gets its position so its FOMO CTA rotates through the
  // name-aware variants instead of repeating one line down the list.
  return (
    <View>
      {list.map((post, index) => (
        <PostCard
          key={post.id}
          post={post}
          liked={false}
          locked
          lockedCtaIndex={index}
          onLockedPress={onPostPress}
        />
      ))}
    </View>
  );
}
