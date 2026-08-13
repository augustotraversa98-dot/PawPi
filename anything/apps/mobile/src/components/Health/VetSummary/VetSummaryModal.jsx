import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  Share2,
  AlertCircle,
  Stethoscope,
} from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useVetSummary } from "@/hooks/useVetSummary";
import { getLocalPostDateString } from "@/utils/dateUtils";
import { RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import {
  detectHealthFlags,
  buildRecap,
  DISCLAIMER,
} from "@/utils/healthInsights";
import { summaryToText } from "@/utils/vetSummaryText";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  green: "#2E8F62",
  amber: "#B8860B",
  peach: "#FFD9B3",
  sand: "#F8EBDD",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

const RANGES = [
  { key: "7days", label: "7 days", days: 7 },
  { key: "30days", label: "30 days", days: 30 },
  { key: "90days", label: "90 days", days: 90 },
];

// Subtract N days from a YYYY-MM-DD (UTC math on a date-only value is exact).
function minusDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

function Stat({ label, value }) {
  return (
    <View style={{ minWidth: "30%", marginBottom: 10 }}>
      <Text style={{ fontSize: 22, fontWeight: "900", color: C.warmBrown }}>{value}</Text>
      <Text style={{ fontSize: 12, color: C.mutedBrown }}>{label}</Text>
    </View>
  );
}

export default function VetSummaryModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const [rangeKey, setRangeKey] = useState("7days");
  const [questions, setQuestions] = useState(["", "", ""]);

  const today = getLocalPostDateString();
  const days = RANGES.find((r) => r.key === rangeKey)?.days || 7;
  const from = minusDays(today, days);

  const { data: summary, isLoading, error } = useVetSummary(petId, from, today, visible);

  const flags = useMemo(() => (summary ? detectHealthFlags(summary) : []), [summary]);
  const recap = useMemo(() => (summary ? buildRecap(summary, flags) : ""), [summary, flags]);

  const onShare = async () => {
    if (!summary) return;
    try {
      await Share.share({ message: summaryToText(summary, flags, questions) });
    } catch (e) {
      // graceful no-op
    }
  };

  const setQuestion = (i, v) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? v : q)));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
        {/* Header */}
        <View style={styles.header}>
          <Stethoscope size={20} color={C.coral} />
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: C.warmBrown, marginLeft: 8 }}>
            Vet Summary{currentPet?.name ? ` · ${currentPet.name}` : ""}
          </Text>
          <PressableScale testID="vetsummary-close" onPress={onClose}>
            <X size={22} color={C.warmBrown} />
          </PressableScale>
        </View>

        {/* Range selector */}
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingTop: 14 }}>
          {RANGES.map((r) => (
            <PressableScale
              key={r.key}
              testID={`range-${r.key}`}
              onPress={() => setRangeKey(r.key)}
              style={{
                paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.chip,
                backgroundColor: rangeKey === r.key ? C.coral : C.sand,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: rangeKey === r.key ? "#FFF" : C.warmBrown }}>
                {r.label}
              </Text>
            </PressableScale>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          {isLoading && <ActivityIndicator color={C.coral} style={{ marginTop: 30 }} />}
          {error && (
            <Text testID="vetsummary-error" style={{ color: C.mutedBrown, marginTop: 20 }}>
              Couldn't load the summary. Pull the latest logs and try again.
            </Text>
          )}

          {!isLoading && summary && (
            <>
              {/* Recap */}
              <View style={styles.recapCard} testID="vetsummary-recap">
                <Text style={{ fontSize: 14, color: C.warmBrown, lineHeight: 21 }}>{recap}</Text>
              </View>

              {/* Flags */}
              {flags.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>WORTH DISCUSSING WITH YOUR VET</Text>
                  {flags.map((f) => (
                    <View key={f.key} testID={`flag-${f.key}`} style={styles.flagCard}>
                      <AlertCircle size={18} color={f.severity === "notable" ? C.coral : C.amber} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: C.warmBrown }}>{f.title}</Text>
                        <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 2 }}>{f.detail}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Stats */}
              <Text style={styles.sectionLabel}>LOGS IN THIS PERIOD</Text>
              <View style={[styles.recapCard, { flexDirection: "row", flexWrap: "wrap" }]}>
                <Stat label="food logs" value={summary.food?.count || 0} />
                <Stat label="stool" value={summary.poo?.count || 0} />
                <Stat label="urination" value={summary.pee?.count || 0} />
                <Stat label="vomit episodes" value={summary.vomit?.episodes || 0} />
                <Stat label="walks" value={summary.walks?.count || 0} />
                <Stat label="photo checks" value={summary.photoChecks?.count || 0} />
              </View>

              {/* Walk pattern — frequency (per week) + recent per-walk durations, so a vet sees
                  the cadence, not just a total (ticket 2.102). Degrades if items/perWeek absent. */}
              {summary.walks?.count > 0 && (
                <View style={styles.recapCard} testID="walk-pattern">
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.warmBrown }}>Walk pattern</Text>
                  <Text style={{ fontSize: 14, color: C.mutedBrown, marginTop: 4 }}>
                    {`≈${summary.walks.perWeek ?? 0} walks/week`}
                    {summary.walks.items?.length
                      ? ` · recent: ${summary.walks.items
                          .slice(0, 4)
                          .map((w) => w.duration_minutes)
                          .join(", ")} min`
                      : ""}
                  </Text>
                </View>
              )}

              {/* Weight */}
              {summary.weight?.series?.length > 0 && (
                <View style={styles.recapCard}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.warmBrown }}>Weight</Text>
                  <Text style={{ fontSize: 14, color: C.mutedBrown, marginTop: 4 }}>
                    {summary.weight.series[0].weight}
                    {summary.weight.series[0].unit} →{" "}
                    {summary.weight.series[summary.weight.series.length - 1].weight}
                    {summary.weight.series[summary.weight.series.length - 1].unit} over {summary.weight.series.length} weigh-ins
                  </Text>
                </View>
              )}

              {/* Medications */}
              {(summary.meds || []).length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>MEDICATIONS</Text>
                  {summary.meds.map((m) => (
                    <View key={m.name} style={styles.flagCard}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                        {m.name}{m.dose ? ` · ${m.dose}` : ""}
                      </Text>
                      <Text style={{ fontSize: 13, color: m.missed ? C.coral : C.green, fontWeight: "700" }}>
                        {m.given}/{m.total} given
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* Conditions / allergies */}
              {((summary.conditions || []).length > 0 || (summary.allergies || []).length > 0) && (
                <>
                  <Text style={styles.sectionLabel}>CONDITIONS & ALLERGIES</Text>
                  <View style={styles.recapCard}>
                    {summary.conditions?.map((c, i) => (
                      <Text key={`c${i}`} style={{ fontSize: 14, color: C.warmBrown, marginBottom: 4 }}>
                        • {c.condition}{c.status ? ` (${c.status})` : ""}
                      </Text>
                    ))}
                    {summary.allergies?.map((a, i) => (
                      <Text key={`a${i}`} style={{ fontSize: 14, color: C.warmBrown, marginBottom: 4 }}>
                        • Allergy: {a.allergen}{a.severity ? ` (${a.severity})` : ""}
                      </Text>
                    ))}
                  </View>
                </>
              )}

              {/* Questions for the vet */}
              <Text style={styles.sectionLabel}>QUESTIONS FOR THE VET</Text>
              {questions.map((q, i) => (
                <TextInput
                  key={i}
                  testID={`question-${i}`}
                  value={q}
                  onChangeText={(v) => setQuestion(i, v)}
                  placeholder={`Question ${i + 1}`}
                  placeholderTextColor={C.mutedBrown + "90"}
                  style={styles.input}
                />
              ))}

              {/* Disclaimer */}
              <View style={styles.disclaimer}>
                <Text style={{ fontSize: 12, color: C.mutedBrown, lineHeight: 17 }}>{DISCLAIMER}</Text>
              </View>

              {/* Share */}
              <PressableScale testID="vetsummary-share" onPress={onShare} style={styles.shareBtn}>
                <Share2 size={18} color="#FFF" />
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>Share with vet</Text>
              </PressableScale>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = {
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.peach,
  },
  recapCard: {
    backgroundColor: C.card,
    borderRadius: RADIUS.card,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.peach,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.mutedBrown,
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 10,
  },
  flagCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: RADIUS.control,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.peach,
  },
  input: {
    backgroundColor: C.card,
    borderRadius: RADIUS.control,
    padding: 14,
    fontSize: 14,
    color: C.warmBrown,
    borderWidth: 1,
    borderColor: C.peach,
    marginBottom: 8,
  },
  disclaimer: {
    backgroundColor: C.sand,
    borderRadius: RADIUS.control,
    padding: 14,
    marginTop: 16,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.coral,
    borderRadius: RADIUS.control,
    paddingVertical: 16,
    marginTop: 20,
  },
};
