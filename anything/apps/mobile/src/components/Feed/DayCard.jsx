// DayCard — a pet's daily moments for one day, as ONE card with a horizontal carousel of per-author
// slides (unit E13 PR2). Each slide is attributed to its author ("Posted by Tats"). Paws/barks show at
// the day-card level (v1). A new caregiver's contribution re-surfaces the card (bump) — driven by the
// endpoint's latest_contribution_at on the feed side.

import React, { useState } from "react";
import { View, Text, ScrollView, Dimensions } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { PawPrint, MessageCircle } from "lucide-react-native";

const C = {
  card: "#FFFCF8",
  peach: "#FFD9B3",
  coral: "#FF6F61",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export function DayCard({ dayCard }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const width = Dimensions.get("window").width - 40;
  const slides = dayCard?.slides || [];
  if (slides.length === 0) return null;

  const onScroll = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== active) setActive(i);
  };

  const current = slides[active] || slides[0];

  return (
    <View testID="day-card" style={styles.card}>
      {/* Header: pet + "N caregivers today" when multiple authors */}
      <View style={styles.header}>
        <Image source={{ uri: dayCard?.pet?.avatar_url }} style={styles.petAvatar} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={styles.petName}>{dayCard?.pet?.name}</Text>
          {dayCard?.author_count > 1 ? (
            <Text testID="day-card-authors" style={styles.sub}>
              {t("dayCard.authors", { count: dayCard.author_count })}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Carousel of attributed slides */}
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
              <Image source={{ uri: s.image_url }} style={{ width, height: width }} contentFit="cover" />
            ) : (
              <View style={{ width, height: width, backgroundColor: C.peach }} />
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

      {/* Per-slide author attribution + caption */}
      <View style={{ padding: 12 }}>
        <Text testID="day-card-author" style={styles.author}>
          {t("dayCard.postedBy", { name: current.author?.username || t("dayCard.someone") })}
        </Text>
        {current.caption ? <Text style={styles.caption}>{current.caption}</Text> : null}

        {/* Day-card-level reactions */}
        <View style={styles.reactions}>
          <View style={styles.reaction}>
            <PawPrint size={16} color={C.coral} fill={C.coral} />
            <Text style={styles.reactionText}>{dayCard?.paw_count ?? 0}</Text>
          </View>
          <View style={styles.reaction}>
            <MessageCircle size={16} color={C.mutedBrown} />
            <Text style={styles.reactionText}>{dayCard?.bark_count ?? 0}</Text>
          </View>
        </View>
      </View>
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
  petName: { fontSize: 15, fontWeight: "800", color: C.warmBrown },
  sub: { fontSize: 12, color: C.coral, fontWeight: "700" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.peach },
  dotActive: { backgroundColor: C.coral, width: 8, height: 8, borderRadius: 4 },
  author: { fontSize: 13, fontWeight: "700", color: C.warmBrown },
  caption: { fontSize: 13, color: C.mutedBrown, marginTop: 2 },
  reactions: { flexDirection: "row", gap: 16, marginTop: 10 },
  reaction: { flexDirection: "row", alignItems: "center", gap: 4 },
  reactionText: { fontSize: 13, color: C.mutedBrown, fontWeight: "600" },
};
