// ShareableStatCard (unit E4) — a story-sized (9:16, captured at 1080×1920) PawPi-branded card for
// the share deck. One component, several templates (streak / week-in-walks / milestone /
// pet-of-the-day / care-recap stub). REAL stats only — an unavailable stat renders a clean empty
// state, never a fake number. Carries the @handle + a deep link (handle only, never location).
// Rendered OFF-SCREEN and snapshotted with react-native-view-shot (same path as ShareableDailyCard).

import React, { forwardRef } from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { PawPrint } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { petHandleLabel, petShareUrl } from "@/utils/shareLinks";

const ShareableStatCard = forwardRef(function ShareableStatCard(
  { card, pet, onReady, onError },
  ref,
) {
  const { t } = useTranslation();
  const name = pet?.name || "My pup";
  const avatar = pet?.avatar_url || null;
  const handleLabel = petHandleLabel(pet?.handle);
  const link = petShareUrl(pet?.handle);

  // Big headline + subline per template. Empty (unavailable) → an honest invite, no fabricated stat.
  let big = "🐾";
  let sub = t("share.tagline", { name });
  if (!card?.available) {
    big = "🐾";
    sub = t(`share.empty.${card?.template || "generic"}`, { name, defaultValue: t("share.emptyGeneric", { name }) });
  } else if (card.template === "streak") {
    big = `🔥 ${card.value}`;
    sub = t("share.streakSub", { count: card.value });
  } else if (card.template === "week_in_walks") {
    big = String(card.value);
    sub = t("share.walksSub", { count: card.value });
  } else if (card.template === "milestone") {
    const m = card.milestone || {};
    big = m.type === "birthday" ? "🎂" : "🎉";
    sub =
      m.years > 0
        ? t(m.type === "birthday" ? "share.milestoneBirthdayYears" : "share.milestoneGotchaYears", { name, count: m.years })
        : t(m.type === "birthday" ? "share.milestoneBirthday" : "share.milestoneGotcha", { name });
  } else if (card.template === "pet_of_the_day") {
    big = "⭐️";
    sub = t("share.potdSub", { name });
  } else if (card.template === "care_recap") {
    big = `${card.value}%`;
    sub = t("share.recapSub", { name, percent: card.value });
  }

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={!avatar && onReady ? () => onReady() : undefined}
      style={{ width: 360, height: 640, backgroundColor: COLORS.coral, padding: 20, justifyContent: "space-between" }}
    >
      {/* Brand header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8 }}>
        <PawPrint size={22} color="#FFF" fill="#FFF" />
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFF", letterSpacing: 0.5 }}>PawPi</Text>
      </View>

      {/* Hero photo */}
      <View style={{ flex: 1, marginVertical: 12, borderRadius: 28, overflow: "hidden", backgroundColor: COLORS.cream, borderWidth: 6, borderColor: "#FFF" }}>
        {avatar ? (
          <Image
            testID="stat-card-image"
            source={{ uri: avatar }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            onLoad={onReady}
            onError={onError}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <PawPrint size={64} color={COLORS.peach} />
          </View>
        )}
      </View>

      {/* Stat + tagline */}
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 44, fontWeight: "900", color: "#FFF", textAlign: "center" }}>{big}</Text>
        <Text style={{ fontSize: 18, fontWeight: "800", color: "#FFF", textAlign: "center", marginTop: 4 }}>{sub}</Text>
      </View>

      {/* Handle + deep link (handle only, never location) */}
      <View style={{ alignItems: "center", paddingBottom: 8 }}>
        {handleLabel ? (
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}>{handleLabel}</Text>
        ) : null}
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#FFF", opacity: 0.9, marginTop: 2 }}>{link}</Text>
      </View>
    </View>
  );
});

export default ShareableStatCard;
