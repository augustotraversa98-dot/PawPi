// PackStreaksCard — shared "pack" streaks with a dog friend (unit E7).
//
// Shows active pack flames (🔥 count + partner) with a friendly "boop" nudge when the friend hasn't
// closed their ring yet, pending invites to accept, and a way to start a new pack by a friend's
// @handle. Copy celebrates the run — a broken streak surfaces the best run, never blame.

import React, { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import {
  usePackStreaks,
  useRequestPackStreak,
  useAcceptPackStreak,
  useBoopPackStreak,
} from "@/hooks/usePackStreaks";
import { COLORS } from "@/constants/colors";

export function PackStreaksCard({ petId }) {
  const { t } = useTranslation();
  const { data: packs = [] } = usePackStreaks(petId);
  const request = useRequestPackStreak(petId);
  const accept = useAcceptPackStreak(petId);
  const boop = useBoopPackStreak(petId);
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState(null);

  const active = packs.filter((p) => p.status === "active");
  // Pending invites I can accept (I'm the receiver → is_requester false).
  const invites = packs.filter((p) => p.status === "pending" && !p.is_requester);
  const outgoing = packs.filter((p) => p.status === "pending" && p.is_requester);

  const doRequest = async () => {
    const h = handle.trim();
    if (!h) return;
    setNote(null);
    try {
      await request.request(h);
      setHandle("");
    } catch (e) {
      setNote(t("packStreaks.requestFailed"));
    }
  };

  const doBoop = async (id) => {
    setNote(null);
    try {
      const res = await boop.boop(id);
      setNote(res?.result === "sent" ? t("packStreaks.booped") : t("packStreaks.boopSkip"));
    } catch {
      setNote(t("packStreaks.boopSkip"));
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{t("packStreaks.title")}</Text>
      <Text style={styles.subtitle}>{t("packStreaks.subtitle")}</Text>

      {active.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.flame}>
              🔥 {t("packStreaks.days", { count: p.current_count })} · {p.partner_pet_name}
            </Text>
            {p.longest_count > p.current_count ? (
              <Text style={styles.best}>
                {t("packStreaks.bestRun", { count: p.longest_count, name: p.partner_pet_name })}
              </Text>
            ) : null}
          </View>
          {p.boop_available ? (
            <Pressable
              style={styles.boop}
              onPress={() => doBoop(p.id)}
              accessibilityRole="button"
              accessibilityLabel={t("packStreaks.boop")}
            >
              <Text style={styles.boopText}>👉 {t("packStreaks.boop")}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {invites.map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={[styles.flame, { flex: 1 }]}>
            {t("packStreaks.invite", { name: p.partner_pet_name })}
          </Text>
          <Pressable
            style={styles.accept}
            onPress={() => accept.accept(p.id)}
            accessibilityRole="button"
          >
            <Text style={styles.acceptText}>{t("packStreaks.accept")}</Text>
          </Pressable>
        </View>
      ))}

      {outgoing.map((p) => (
        <Text key={p.id} style={styles.pending}>
          {t("packStreaks.pending", { name: p.partner_pet_name })}
        </Text>
      ))}

      {active.length === 0 && invites.length === 0 ? (
        <Text style={styles.empty}>{t("packStreaks.empty")}</Text>
      ) : null}

      {/* Start a new pack by a friend's @handle */}
      <View style={styles.addRow}>
        <TextInput
          value={handle}
          onChangeText={setHandle}
          placeholder={t("packStreaks.handlePlaceholder")}
          placeholderTextColor={COLORS.mutedBrown}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel={t("packStreaks.handlePlaceholder")}
        />
        <Pressable
          style={styles.startBtn}
          onPress={doRequest}
          disabled={request.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.startText}>{t("packStreaks.start")}</Text>
        </Pressable>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.warmBrown },
  subtitle: { marginTop: 2, fontSize: 12, color: COLORS.mutedBrown, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 10 },
  flame: { fontSize: 14, fontWeight: "700", color: COLORS.warmBrown },
  best: { marginTop: 2, fontSize: 12, color: COLORS.terracotta, fontWeight: "600" },
  boop: { backgroundColor: "#FFE7D6", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  boopText: { fontSize: 13, fontWeight: "800", color: COLORS.terracotta },
  accept: { backgroundColor: COLORS.coral, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  acceptText: { fontSize: 13, fontWeight: "800", color: "#FFF" },
  pending: { marginTop: 10, fontSize: 13, color: COLORS.mutedBrown },
  empty: { marginTop: 8, fontSize: 13, color: COLORS.mutedBrown, lineHeight: 18 },
  addRow: { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 8 },
  input: {
    flex: 1, backgroundColor: COLORS.sand, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    color: COLORS.warmBrown, fontSize: 14,
  },
  startBtn: { backgroundColor: COLORS.coral, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  startText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  note: { marginTop: 8, fontSize: 12, color: COLORS.terracotta, fontWeight: "600" },
});

export default PackStreaksCard;
