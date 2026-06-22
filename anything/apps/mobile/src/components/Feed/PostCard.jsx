import React, { memo } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Alert } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { PawPrint, Megaphone, Lock } from "lucide-react-native";
import {
  COLORS,
  TAG_COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";
import { useReduceTransparency } from "@/hooks/useAccessibilityPrefs";
import { useTogglePaw } from "@/hooks/useFeedPosts";
import { DailyShareButton } from "./DailyShareButton";
import { PawablePhoto } from "./PawablePhoto";
import { isBirthdayToday } from "@/utils/feedDelight";
import { formatRelativeTime } from "@/utils/relativeTime";
import { getLocalPostDateString } from "@/utils/dateUtils";

// Locked-photo obscuring (2.77 BeReal tease). The photo stays at full opacity; a
// plain expo-blur BlurView + a light CREAM wash do the obscuring so it reads as a
// clearly-present pet photo you just can't make out — warm, not glassy, and NOT
// an empty/dim card. Under Reduce Transparency the blur can't render, so we fall
// back to a near-opaque muted wash that keeps the content obscured (identity,
// which lives in the header outside the photo, stays fully visible either way).
const LOCKED_PHOTO_BLUR = 45;
const LOCKED_PHOTO_WASH = "rgba(255, 247, 239, 0.4)"; // cream @ 40% — recognizable-but-not-clear
const LOCKED_PHOTO_SOLID = "rgba(216, 197, 181, 0.97)"; // muted sand, near-opaque fallback

export const PostCard = memo(function PostCard({
  post,
  liked,
  locked,
  streak = 0,
  onToggleLike,
  onOpenBarks,
  onOpenDetail,
  onOpenProfile,
  // While locked, tapping anywhere on the card nudges the viewer to post (opens
  // the composer) instead of doing nothing.
  onLockedPress,
}) {
  const togglePawMutation = useTogglePaw(post.id);
  const reduceTransparency = useReduceTransparency();

  const handlePawPress = async () => {
    if (locked) return;

    try {
      await togglePawMutation.mutateAsync({ isPawed: liked });
      // Success - mutation handles optimistic update
    } catch (error) {
      console.error("Error toggling paw:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    }
  };

  // Double-tap the photo to Paw (ticket 2.64): idempotent — paw only when not
  // already pawed; an already-pawed post just replays the animation (never
  // un-paws). Optimistic via the same mutation as the button, so they stay in
  // sync; on error the optimistic update is reverted by the mutation.
  const handleDoubleTapPaw = () => {
    if (locked || liked) return;
    togglePawMutation.mutateAsync({ isPawed: false }).catch((error) => {
      console.error("Error pawing:", error);
    });
  };

  const tagStyle = TAG_COLORS[post.tag] || {
    bg: COLORS.peach,
    text: COLORS.terracotta,
  };

  // Use database fields with fallback to old fields for compatibility
  const dogName = post.pet_name || post.dogName;
  const petHandle = post.pet_handle;
  const ownerName = post.username || post.ownerName;
  const avatar = post.pet_avatar || post.avatar;
  const photo = post.image_url || post.photo;
  const pawsCount = post.paw_count ?? post.paws ?? 0;
  const barksCount = post.bark_count ?? post.barks ?? 0;
  const tag = post.is_daily_update ? "Daily moment" : post.tag || "Moment";

  // Birthday / adoption-day highlight (ticket 2.37): a 🎂 by the name + a thicker
  // signature-orange frame on the card. Computed from the pet's own date fields
  // against the viewer's local day — never fabricated when no date is set.
  const isBirthday = isBirthdayToday(
    { birthday: post.pet_birthday, adoption_date: post.pet_adoption_date },
    getLocalPostDateString(),
  );

  return (
    <Card
      level="md"
      radius={RADIUS.card}
      borderColor={isBirthday ? COLORS.coral : MATERIALS.hairline}
      style={{
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.lg,
        overflow: "hidden",
        borderWidth: isBirthday ? 2.5 : 1,
      }}
    >
      {/* Header — identity stays fully visible while locked; tapping it nudges
          the viewer to post rather than opening the (hidden) profile. */}
      <TouchableOpacity
        onPress={locked ? onLockedPress : onOpenProfile}
        activeOpacity={0.8}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: SPACING.lg,
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              borderWidth: 2.5,
              borderColor: COLORS.coral,
              borderRadius: 24,
              marginRight: 10,
            }}
          >
            <Image
              source={{ uri: avatar }}
              style={{ width: 42, height: 42, borderRadius: 21 }}
            />
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
                {dogName}
              </Text>
              {isBirthday ? (
                <Text accessibilityLabel="Birthday" style={{ fontSize: 15 }}>
                  🎂
                </Text>
              ) : null}
              {streak > 0 ? (
                <Text accessibilityLabel={`${streak} day streak`} style={{ fontSize: 13 }}>
                  🔥{streak}
                </Text>
              ) : null}
            </View>
            {petHandle ? (
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                @{petHandle}
              </Text>
            ) : null}
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
              by {ownerName}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View
            style={{
              backgroundColor: tagStyle.bg,
              paddingHorizontal: SPACING.md,
              paddingVertical: SPACING.xs,
              borderRadius: RADIUS.chip,
            }}
          >
            <Text style={[TYPE.caption, { color: tagStyle.text }]}>
              {tag}
            </Text>
          </View>
          <Text style={[TYPE.caption, { color: COLORS.mutedBrown }]}>
            {formatRelativeTime(post.created_at) || post.timestamp || "just now"}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Photo. Unlocked: single tap opens the pet's profile, double tap gives a
          Paw (2.64). Locked: the photo is blurred (you can tell WHO posted from
          the header, but not WHAT) and tapping it opens the composer. */}
      {locked ? (
        <Pressable
          testID="feed-post-photo"
          onPress={onLockedPress}
          style={{ width: "100%", height: 340 }}
        >
          <Image
            source={{ uri: photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          {reduceTransparency ? (
            // Reduce Transparency: blur can't render — a near-opaque muted wash
            // keeps the photo obscured.
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: LOCKED_PHOTO_SOLID }]}
            />
          ) : (
            <>
              <BlurView
                intensity={LOCKED_PHOTO_BLUR}
                tint="light"
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              {/* Light cream wash so the tease reads warm (not glassy) and stays
                  obscured even where the platform blur is weak. */}
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: LOCKED_PHOTO_WASH }]}
              />
            </>
          )}
          {/* Centered lock badge — a warm "post to reveal" cue. */}
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: COLORS.cream,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: COLORS.peach,
              }}
            >
              <Lock size={22} color={COLORS.terracotta} />
            </View>
          </View>
        </Pressable>
      ) : (
        <PawablePhoto
          testID="feed-post-photo"
          photoUri={photo}
          disabled={false}
          onSingleTap={onOpenProfile}
          onDoubleTap={handleDoubleTapPaw}
          style={{ width: "100%", height: 340 }}
        />
      )}

      {/* Caption + Actions. The caption is CONTENT, so it's obscured while locked
          (replaced by a muted placeholder bar — you can tell there's a caption,
          but not read it); the action row stays disabled as before. Tapping this
          region while locked opens the composer. */}
      <Pressable
        style={{ padding: SPACING.lg }}
        onPress={locked ? onLockedPress : undefined}
      >
        {locked ? (
          <View
            testID="feed-post-caption-locked"
            style={{
              height: 13,
              width: "65%",
              borderRadius: 7,
              backgroundColor: MATERIALS.surfaceSunken,
              marginBottom: SPACING.lg,
            }}
          />
        ) : (
          post.caption && (
            <TouchableOpacity
              testID="feed-post-caption"
              onPress={onOpenDetail}
              activeOpacity={0.8}
            >
              <Text
                style={[TYPE.callout, { color: COLORS.warmBrown, marginBottom: SPACING.lg }]}
                numberOfLines={2}
              >
                <Text style={{ fontWeight: "800" }}>{dogName} </Text>
                {post.caption}
              </Text>
            </TouchableOpacity>
          )
        )}

        {/* Action Row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingTop: locked || post.caption ? SPACING.md : 0,
            borderTopWidth: locked || post.caption ? 1 : 0,
            borderTopColor: MATERIALS.hairline,
            gap: SPACING.xl,
          }}
        >
          <PressableScale
            onPress={handlePawPress}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            disabled={locked || togglePawMutation.isPending}
          >
            <PawPrint
              size={22}
              color={liked && !locked ? COLORS.coral : COLORS.mutedBrown}
              fill={liked && !locked ? COLORS.coral : "none"}
            />
            <Text
              style={[
                TYPE.subhead,
                { color: liked && !locked ? COLORS.coral : COLORS.mutedBrown },
              ]}
            >
              {pawsCount} paws
            </Text>
          </PressableScale>

          <PressableScale
            onPress={locked ? undefined : onOpenBarks}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            disabled={locked}
          >
            <Megaphone size={20} color={COLORS.mutedBrown} />
            <Text style={[TYPE.subhead, { color: COLORS.mutedBrown }]}>
              {barksCount} barks
            </Text>
          </PressableScale>

          <View style={{ flex: 1 }} />

          {/* Share a branded story frame of this daily photo (ticket 2.28). Optional;
              the daily-post flow + BeReal lock are untouched. */}
          <DailyShareButton petName={dogName} photoUri={photo} locked={locked} />
        </View>
      </Pressable>
    </Card>
  );
});
