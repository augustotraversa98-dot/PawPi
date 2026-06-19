import React, { memo } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { PawPrint, Megaphone } from "lucide-react-native";
import {
  COLORS,
  TAG_COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";
import { useTogglePaw } from "@/hooks/useFeedPosts";
import { DailyShareButton } from "./DailyShareButton";
import { PawablePhoto } from "./PawablePhoto";
import { isBirthdayToday } from "@/utils/feedDelight";
import { formatRelativeTime } from "@/utils/relativeTime";
import { getLocalPostDateString } from "@/utils/dateUtils";

export const PostCard = memo(function PostCard({
  post,
  liked,
  locked,
  streak = 0,
  onToggleLike,
  onOpenBarks,
  onOpenDetail,
  onOpenProfile,
}) {
  const togglePawMutation = useTogglePaw(post.id);

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
      {/* Header */}
      <TouchableOpacity
        onPress={locked ? undefined : onOpenProfile}
        activeOpacity={locked ? 1 : 0.8}
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

      {/* Photo — single tap opens the pet's profile, double tap gives a Paw (2.64) */}
      <PawablePhoto
        testID="feed-post-photo"
        photoUri={photo}
        disabled={locked}
        onSingleTap={onOpenProfile}
        onDoubleTap={handleDoubleTapPaw}
        style={{ width: "100%", height: 340 }}
      />

      {/* Caption + Actions */}
      <View style={{ padding: SPACING.lg }}>
        {post.caption && (
          <TouchableOpacity
            testID="feed-post-caption"
            onPress={locked ? undefined : onOpenDetail}
            activeOpacity={locked ? 1 : 0.8}
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
      </View>
    </Card>
  );
});
