// ShareCardDeck (unit E4) — the branded story-card deck. Lists the templates built from REAL stats;
// each available card gets a one-tap ShareCardButton, and an unavailable one shows a clean empty
// state (an honest "unlock" hint) — never a fake number. Reuses the existing capture+share path.

import React from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useShareStats } from "@/hooks/useShareStats";
import { buildShareCards } from "@/utils/shareLinks";
import { getMilestone } from "@/utils/feedDelight";
import { getLocalPostDateString } from "@/utils/dateUtils";
import { ShareCardButton } from "./ShareCardButton";
import { COLORS } from "@/constants/colors";

function statLine(t, card) {
  if (!card.available) return t(`share.deckEmpty.${card.template}`, { defaultValue: t("share.deckEmptyGeneric") });
  if (card.template === "streak") return t("share.streakSub", { count: card.value });
  if (card.template === "week_in_walks") return t("share.walksSub", { count: card.value });
  if (card.template === "milestone") return t("share.deckMilestoneReady");
  if (card.template === "pet_of_the_day") return t("share.deckPotdReady");
  if (card.template === "care_recap") return t("share.deckRecapReady", { percent: card.value });
  return "";
}

export function ShareCardDeck({ visible, onClose, petId, petDates }) {
  const { t } = useTranslation();
  const { data: stats } = useShareStats(petId);
  const milestone = getMilestone(petDates || {}, getLocalPostDateString());
  const cards = buildShareCards({ stats, milestone });
  const pet = stats?.pet || null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t("share.deckTitle")}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <X size={22} color={COLORS.warmBrown} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {cards.map((card) => (
              <View key={card.template} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{t(`share.deck.${card.template}`)}</Text>
                  <Text style={[styles.cardSub, !card.available && styles.cardSubMuted]}>
                    {statLine(t, card)}
                  </Text>
                </View>
                {card.available ? (
                  <ShareCardButton card={card} pet={pet} label={t("share.shareCta")} />
                ) : (
                  <View style={styles.lockPill}>
                    <Text style={styles.lockText}>{t("share.locked")}</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "85%",
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "900", color: COLORS.warmBrown },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: COLORS.warmBrown },
  cardSub: { marginTop: 3, fontSize: 13, color: COLORS.terracotta, fontWeight: "600" },
  cardSubMuted: { color: COLORS.mutedBrown, fontWeight: "500" },
  lockPill: { backgroundColor: COLORS.sand, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  lockText: { color: COLORS.mutedBrown, fontWeight: "700", fontSize: 12 },
});

export default ShareCardDeck;
