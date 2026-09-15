// DayCard — a pet's daily moments for one day, as ONE card with a horizontal carousel of per-author
// slides (unit E13 PR2). Reserved for GENUINE multi-caregiver days (2+ slides); a lone daily moment
// is rendered by UnlockedFeed through the canonical PostCard instead (FF3 parity fix). Each slide is
// attributed to its author ("Posted by Tats"). A new caregiver's contribution re-surfaces the card
// (bump) — driven by the endpoint's latest_contribution_at on the feed side.
//
// Parity with PostCard (FF3 fix): 4:5 portrait media (not 1:1), @handle + 🔥 streak in the header,
// a "Daily moment" tag chip, the active slide's timestamp, and a REAL paw state — the paw is filled
// (coral) only when the active slide's own post is actually pawed, next to that post's own paw_count,
// so the old "red paw but 0" mismatch is gone. Reuses the shared theme tokens + formatRelativeTime
// rather than re-inventing them; the paw toggle itself still lives in the post detail (v1 display-only).

import React, { useState } from "react";
import { View, Text, ScrollView, Dimensions, Pressable } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { PawPrint, MessageCircle } from "lucide-react-native";
import { COLORS, TAG_COLORS } from "@/constants/theme";
import { formatRelativeTime } from "@/utils/relativeTime";

const C = {
  card: "#FFFCF8",
  peach: "#FFD9B3",
  coral: COLORS.coral, // #FF6F61
  warmBrown: COLORS.warmBrown, // #3B241B
  mutedBrown: "#7A6254",
};

// Daily moments always carry the "Daily moment" tag (same as a PostCard daily update).
const DAILY_TAG = "Daily moment";

export function DayCard({ dayCard, likedByPostId, streak = 0, onOpenDetail }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const width = Dimensions.get("window").width - 40;
  // 4:5 portrait, matching PostCard's media frame (was a hardcoded 1:1 square).
  const mediaHeight = Math.round((width * 5) / 4);
  const slides = dayCard?.slides || [];
  if (slides.length === 0) return null;

  const onScroll = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== active) setActive(i);
  };

  const current = slides[active] || slides[0];
  // The active slide's underlying feed post carries the real like data + @handle.
  const curPost = current?._post || {};
  const petHandle = curPost.pet_handle || dayCard?.pet?.handle || null;
  const curLiked = !!(likedByPostId && curPost.id != null && likedByPostId[curPost.id]);
  // Consistent count: show the ACTIVE slide's own paw/bark totals (a liked post reads ≥1),
  // not a hardcoded-filled paw beside a day-level aggregate.
  const pawCount = curPost.paw_count ?? current?.paw_count ?? 0;
  const barkCount = curPost.bark_count ?? current?.bark_count ?? 0;
  const tagStyle = TAG_COLORS[DAILY_TAG] || { bg: C.peach, text: "#B75D32" };
  const timeAgo = formatRelativeTime(current?.created_at, { t });

  return (
    <View testID="day-card" style={styles.card}>
      {/* Header: pet identity (name + @handle + 🔥 streak) with a "Daily moment" tag + timestamp,
          mirroring PostCard. The "N caregivers today" sub only shows for real multi-author days. */}
      <View style={styles.header}>
        <Image source={{ uri: dayCard?.pet?.avatar_url }} style={styles.petAvatar} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.petName}>{dayCard?.pet?.name}</Text>
            {streak > 0 ? (
              <Text accessibilityLabel={`${streak} day streak`} style={{ fontSize: 13 }}>
                🔥{streak}
              </Text>
            ) : null}
          </View>
          {petHandle ? (
            <Text testID="day-card-handle" style={styles.handle}>
              @{petHandle}
            </Text>
          ) : null}
          {dayCard?.author_count > 1 ? (
            <Text testID="day-card-authors" style={styles.sub}>
              {t("dayCard.authors", { count: dayCard.author_count })}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View style={[styles.tag, { backgroundColor: tagStyle.bg }]}>
            <Text style={[styles.tagText, { color: tagStyle.text }]}>{DAILY_TAG}</Text>
          </View>
          {timeAgo ? (
            <Text testID="day-card-time" style={styles.time}>
              {timeAgo}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Carousel of attributed slides — 4:5 portrait media (parity with PostCard). */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        testID="day-card-carousel"
      >
        {slides.map((s) => (
          <View key={s.post_id} style={{ width }} testID={`day-card-slide-${s.post_id}`}>
            {s.image_url ? (
              <Image source={{ uri: s.image_url }} style={{ width, height: mediaHeight }} contentFit="cover" />
            ) : (
              <View style={{ width, height: mediaHeight, backgroundColor: C.peach }} />
            )}
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      {slides.length > 1 ? (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View key={s.post_id} style={[styles.dot, i === active && styles.dotActive]} />
          ))}
        </View>
      ) : null}

      {/* Per-slide author attribution + caption. Tapping opens the shown slide's real post
          (paws/barks/comments live there) when a handler is provided. */}
      <Pressable
        style={{ padding: 12 }}
        disabled={!onOpenDetail}
        onPress={() => onOpenDetail?.(current._post)}
        testID="day-card-open"
      >
        <Text testID="day-card-author" style={styles.author}>
          {t("dayCard.postedBy", { name: current.author?.username || t("dayCard.someone") })}
        </Text>
        {current.caption ? <Text style={styles.caption}>{current.caption}</Text> : null}

        {/* Reactions reflect the ACTIVE slide's real like data — paw is filled only when
            that post is actually pawed (no more hardcoded coral fill on a 0 count). */}
        <View style={styles.reactions}>
          <View style={styles.reaction}>
            <PawPrint
              size={16}
              color={curLiked ? C.coral : C.mutedBrown}
              fill={curLiked ? C.coral : "none"}
            />
            <Text style={styles.reactionText}>{pawCount}</Text>
          </View>
          <View style={styles.reaction}>
            <MessageCircle size={16} color={C.mutedBrown} />
            <Text style={styles.reactionText}>{barkCount}</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = {
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.peach,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  petAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.peach },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  petName: { fontSize: 15, fontWeight: "800", color: C.warmBrown },
  handle: { fontSize: 12, color: C.mutedBrown },
  sub: { fontSize: 12, color: C.coral, fontWeight: "700" },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: "700" },
  time: { fontSize: 11, color: C.mutedBrown },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.peach },
  dotActive: { backgroundColor: C.coral, width: 8, height: 8, borderRadius: 4 },
  author: { fontSize: 13, fontWeight: "700", color: C.warmBrown },
  caption: { fontSize: 13, color: C.mutedBrown, marginTop: 2 },
  reactions: { flexDirection: "row", gap: 16, marginTop: 10 },
  reaction: { flexDirection: "row", alignItems: "center", gap: 4 },
  reactionText: { fontSize: 13, color: C.mutedBrown, fontWeight: "600" },
};
