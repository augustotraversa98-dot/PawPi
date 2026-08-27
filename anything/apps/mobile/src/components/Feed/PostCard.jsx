import React, { memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { MotiView } from "moti";
import { PawPrint, Megaphone, Lock, Camera } from "lucide-react-native";
import {
  COLORS,
  TAG_COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";
import {
  useReduceTransparency,
  useReducedMotion,
} from "@/hooks/useAccessibilityPrefs";
import { useTogglePaw } from "@/hooks/useFeedPosts";
import { DailyShareButton } from "./DailyShareButton";
import { PawablePhoto } from "./PawablePhoto";
import { FeedVideo } from "./FeedVideo";
import { getMilestone } from "@/utils/feedDelight";
import { MilestoneRibbon } from "./MilestoneRibbon";
import { Confetti } from "./Confetti";
import { useTranslation } from "react-i18next";
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

// Rotating, name-aware FOMO CTAs for a LOCKED card (feed polish #4). Each locked
// card shows one — varied by position so the wall of teases never reads as a
// single repeated line — nudging the viewer to post their own daily moment. All
// four ship EN + ES; {{petName}} is the poster's pet.
const LOCKED_CTA_KEYS = [
  "feed.lockedCard1",
  "feed.lockedCard2",
  "feed.lockedCard3",
  "feed.lockedCard4",
];

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
  // Position of this card in the locked feed — picks which rotating FOMO CTA to
  // show (feed polish #4). Ignored when unlocked.
  lockedCtaIndex = 0,
}) {
  const togglePawMutation = useTogglePaw(post.id);
  const reduceTransparency = useReduceTransparency();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  // Full card CONTENT width, derived from the device (feed polish #1) — the card
  // has a SPACING.lg gutter on each side.
  const contentWidth = Math.round(windowWidth - SPACING.lg * 2);
  // The media renders as a rounded TILE inside the card: a small horizontal inset
  // on each side makes the rounding visible against the card gutters. All media
  // (photo/video/locked) sizes to this width so they clip to the same container.
  const mediaWidth = contentWidth - SPACING.sm * 2;

  const handlePawPress = async () => {
    if (locked) return;

    try {
      await togglePawMutation.mutateAsync({ isPawed: liked });
      // Success - mutation handles optimistic update
    } catch (error) {
      console.error("Error toggling paw:", error);
      Alert.alert(t("feed.errorSaveTitle"), t("feed.errorSaveBody"));
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
  // Daily video moments (step 4): a video post renders its poster + inline player
  // instead of a photo. image_url is null for video posts, so derive media type
  // explicitly rather than from the (absent) photo.
  const isVideo = post.media_type === "video";
  const videoUri = post.video_url;
  const posterUri = post.video_thumbnail_url;
  // What the LOCKED branch obscures: the video poster for a video post, the photo
  // otherwise. When there's nothing to blur (no poster/photo), fall back to the
  // near-opaque solid wash — a blur over an empty image reads as a broken card.
  const lockedMediaUri = isVideo ? posterUri : photo;
  const useSolidFallback = reduceTransparency || !lockedMediaUri;
  const pawsCount = post.paw_count ?? post.paws ?? 0;
  const barksCount = post.bark_count ?? post.barks ?? 0;
  const tag = post.is_daily_update ? "Daily moment" : post.tag || "Moment";

  const { t } = useTranslation();
  // Name-aware copy for the locked variant. The headline names the pet; the
  // subline rotates the FOMO/reciprocity line by card position (feed polish #4)
  // so a wall of teases never reads as one repeated line.
  const lockedHeadline = t("feed.lockedHeadline", { petName: dogName });
  const lockedCtaMessage = t(
    LOCKED_CTA_KEYS[(lockedCtaIndex || 0) % LOCKED_CTA_KEYS.length],
    { petName: dogName },
  );
  const lockedPostCta = t("feed.lockedPostCta");

  // Primary CTA press: a light haptic + open the composer. Lazy-require keeps a
  // missing native module from ever crashing the render/test.
  const handleLockedCtaPress = () => {
    try {
      const Haptics = require("expo-haptics");
      Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light);
    } catch {}
    onLockedPress?.();
  };
  // Birthday / adoption-day highlight (2.37) → milestone moment (E3): a 🎂 by the name + a thicker
  // signature-orange frame, and on a milestone day an animated ribbon + confetti + a "Share this"
  // CTA. Computed from the pet's own date fields against the viewer's local day — never fabricated.
  const milestone = getMilestone(
    { birthday: post.pet_birthday, adoption_date: post.pet_adoption_date },
    getLocalPostDateString(),
  );
  const isBirthday = !!milestone;
  const showMilestone = isBirthday && !locked;

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
            {formatRelativeTime(post.created_at, { t })}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Photo. Unlocked: single tap opens the pet's profile, double tap gives a
          Paw (2.64). Locked: the photo is blurred (you can tell WHO posted from
          the header, but not WHAT) and tapping it opens the composer.
          The media is a rounded TILE: overflow-hidden + a modest radius + a small
          horizontal inset so every overlay (blur/wash, CTA cluster, milestone
          ribbon/confetti, double-tap Paw) clips to the same rounded container. */}
      <View
        style={{
          position: "relative",
          marginHorizontal: SPACING.sm,
          borderRadius: RADIUS.md,
          overflow: "hidden",
        }}
      >
      {locked ? (
        <Pressable
          testID="feed-post-photo"
          onPress={onLockedPress}
          style={{ width: mediaWidth, height: mediaWidth }}
        >
          <Image
            testID="feed-post-locked-media"
            source={{ uri: lockedMediaUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          {useSolidFallback ? (
            // Reduce Transparency (blur can't render) OR no poster/photo to blur:
            // a near-opaque muted wash keeps the media obscured with nothing glassy.
            <View
              testID="feed-post-locked-solid"
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: LOCKED_PHOTO_SOLID }]}
            />
          ) : (
            <>
              <BlurView
                testID="feed-post-locked-blur"
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
          {/* "Post to reveal" CTA cluster over the blur — an invitation, not a
              wall. Sits on a soft cream scrim so it stays legible over any blurred
              photo AND under Reduce Transparency (the scrim is opaque cream, no
              glass). box-none lets taps outside the button fall through to the
              card's own onLockedPress. */}
          <View
            pointerEvents="box-none"
            style={[
              StyleSheet.absoluteFill,
              { justifyContent: "center", alignItems: "center", padding: SPACING.lg },
            ]}
          >
            <View
              style={{
                alignItems: "center",
                maxWidth: "90%",
                paddingHorizontal: SPACING.lg,
                paddingVertical: SPACING.lg,
                borderRadius: RADIUS.lg,
                backgroundColor: "rgba(255, 247, 239, 0.86)", // cream scrim
                borderWidth: 1,
                borderColor: MATERIALS.hairline,
                ...ELEVATION.sm,
              }}
            >
              {/* Friendly camera in a coral circle, with a small lock accent so it
                  reads "post to reveal" — not "blocked". */}
              <View style={{ marginBottom: SPACING.sm }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: COLORS.coral,
                    justifyContent: "center",
                    alignItems: "center",
                    ...ELEVATION.sm,
                  }}
                >
                  <Camera size={26} color={COLORS.cream} />
                </View>
                <View
                  style={{
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: COLORS.cream,
                    borderWidth: 1,
                    borderColor: COLORS.peach,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Lock size={12} color={COLORS.terracotta} />
                </View>
              </View>

              <Text
                style={[TYPE.headline, { color: COLORS.warmBrown, textAlign: "center" }]}
              >
                {lockedHeadline}
              </Text>
              <Text
                style={[
                  TYPE.footnote,
                  {
                    color: COLORS.mutedBrown,
                    textAlign: "center",
                    marginTop: SPACING.xs,
                    marginBottom: SPACING.md,
                  },
                ]}
              >
                {lockedCtaMessage}
              </Text>

              {/* Gentle pulse to draw the eye — disabled under Reduce Motion. */}
              <MotiView
                from={{ scale: 1 }}
                animate={{ scale: reduceMotion ? 1 : 1.04 }}
                transition={{
                  type: "timing",
                  duration: 1100,
                  loop: !reduceMotion,
                  repeatReverse: true,
                }}
              >
                <PressableScale
                  testID="feed-post-locked-cta"
                  onPress={handleLockedCtaPress}
                  accessibilityRole="button"
                  accessibilityLabel={lockedPostCta}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACING.sm,
                    backgroundColor: COLORS.coral,
                    paddingVertical: SPACING.sm + 2,
                    paddingHorizontal: SPACING.lg,
                    borderRadius: RADIUS.chip,
                    ...ELEVATION.md,
                  }}
                >
                  <Camera size={18} color={COLORS.cream} />
                  <Text style={[TYPE.subhead, { color: COLORS.cream, fontWeight: "800" }]}>
                    {lockedPostCta}
                  </Text>
                </PressableScale>
              </MotiView>
            </View>
          </View>
        </Pressable>
      ) : isVideo ? (
        // Unlocked video: poster + inline player. Single tap plays/pauses (with
        // sound), double tap still gives a Paw. (No scroll-based autoplay.)
        <FeedVideo
          testID="feed-post-video"
          videoUri={videoUri}
          posterUri={posterUri}
          onDoubleTap={handleDoubleTapPaw}
          style={{ width: mediaWidth, height: mediaWidth }}
        />
      ) : (
        <PawablePhoto
          testID="feed-post-photo"
          photoUri={photo}
          disabled={false}
          onSingleTap={onOpenProfile}
          onDoubleTap={handleDoubleTapPaw}
          responsiveWidth={mediaWidth}
        />
      )}
        {/* Milestone moment (E3): celebratory ribbon + one-shot confetti over the photo */}
        {showMilestone ? (
          <>
            <Confetti />
            <MilestoneRibbon type={milestone.type} years={milestone.years} petName={dogName} />
          </>
        ) : null}
      </View>

      {/* Milestone "Share this" CTA (E3) — stubs to the existing share frame until E4 */}
      {showMilestone ? (
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
          <DailyShareButton
            petName={dogName}
            photoUri={photo}
            locked={locked}
            label={t("milestones.shareCta")}
          />
        </View>
      ) : null}

      {/* Caption + Actions. The caption is CONTENT, so it's obscured while locked
          (replaced by a muted placeholder bar — you can tell there's a caption,
          but not read it); the action row stays disabled as before. Tapping this
          region while locked opens the composer. */}
      <Pressable
        style={{ padding: SPACING.lg }}
        onPress={locked ? onLockedPress : undefined}
      >
        {locked ? (
          // Locked: the caption is CONTENT, so it's replaced by an obscured
          // placeholder bar — you can tell there's a caption, but not read it.
          // The name-aware FOMO CTA now lives over the blurred media above.
          <View
            testID="feed-post-caption-locked"
            style={{
              height: 13,
              width: "65%",
              borderRadius: RADIUS.chip,
              backgroundColor: MATERIALS.surfaceSunken,
            }}
          />
        ) : (
          <>
            {post.caption && (
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
            )}

            {/* Action Row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingTop: post.caption ? SPACING.md : 0,
                borderTopWidth: post.caption ? 1 : 0,
                borderTopColor: MATERIALS.hairline,
                gap: SPACING.xl,
              }}
            >
              <PressableScale
                onPress={handlePawPress}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                disabled={togglePawMutation.isPending}
              >
                <PawPrint
                  size={22}
                  color={liked ? COLORS.coral : COLORS.mutedBrown}
                  fill={liked ? COLORS.coral : "none"}
                />
                <Text
                  style={[
                    TYPE.subhead,
                    { color: liked ? COLORS.coral : COLORS.mutedBrown },
                  ]}
                >
                  {pawsCount} paws
                </Text>
              </PressableScale>

              <PressableScale
                onPress={onOpenBarks}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
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
          </>
        )}
      </Pressable>
    </Card>
  );
});
