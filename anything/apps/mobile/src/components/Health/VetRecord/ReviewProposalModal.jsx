import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { X, Sparkles, Check } from "lucide-react-native";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { getLocalPostDateString } from "@/utils/dateUtils";

// AI-2 (night-run 2026-08-18d): the REVIEW SHEET. After a document is read by Claude vision
// (AI-1), we show the PROPOSED records grouped by type. Each is pre-filled + editable; the owner
// includes or skips each and taps "Add" — NOTHING is written until they confirm. On confirm we
// create each accepted record through the EXISTING VR-B add routes (owner-OR-Editor gate + 0120
// attribution apply server-side), append a "Digitized from uploaded document" source marker, and
// invalidate the Medical-history queries so the new rows appear. The uploaded file stays in
// Documents (downloadable) regardless. EN+ES.

// Each group maps a proposal key to its owner add route, the fields to show (in order), the
// query key to refresh, and which field carries the source marker. Field values arrive already
// in the exact shape the route accepts (AI-1 normalized them to route params).
const GROUPS = [
  {
    key: "vaccinations",
    endpoint: "/api/pet-vaccinations",
    invalidate: "pet-vaccinations",
    markerField: "notes",
    fields: [
      ["name", "fName"],
      ["dateGiven", "fDateGiven"],
      ["expiresOn", "fExpiresOn"],
      ["clinicName", "fClinic"],
      ["notes", "fNotes"],
    ],
  },
  {
    key: "medications",
    endpoint: "/api/health/medications",
    invalidate: "pet-medications",
    markerField: "notes",
    fields: [
      ["name", "fName"],
      ["dose", "fDose"],
      ["frequency", "fFrequency"],
      ["prescribedBy", "fPrescribedBy"],
      ["startDate", "fStartDate"],
      ["notes", "fNotes"],
    ],
  },
  {
    key: "surgeries",
    endpoint: "/api/vet-record/surgeries",
    invalidate: "vet-record-surgeries",
    markerField: "notes",
    requiredDate: "surgeryDate",
    fields: [
      ["procedure", "fProcedure"],
      ["surgeryDate", "fDate"],
      ["surgeon", "fSurgeon"],
      ["clinic", "fClinic"],
      ["notes", "fNotes"],
    ],
  },
  {
    key: "labResults",
    endpoint: "/api/vet-record/lab-results",
    invalidate: "vet-record-lab-results",
    markerField: "notes",
    requiredDate: "testDate",
    fields: [
      ["testName", "fTestName"],
      ["testDate", "fDate"],
      ["results", "fResults"],
      ["orderedBy", "fOrderedBy"],
      ["notes", "fNotes"],
    ],
  },
  {
    key: "allergies",
    endpoint: "/api/vet-record/allergies",
    invalidate: "vet-record-allergies",
    markerField: "notes",
    fields: [
      ["allergen", "fAllergen"],
      ["severity", "fSeverity"],
      ["reaction", "fReaction"],
      ["diagnosedDate", "fDiagnosedDate"],
      ["notes", "fNotes"],
    ],
  },
  {
    key: "conditions",
    endpoint: "/api/vet-record/conditions",
    invalidate: "vet-record-conditions",
    markerField: "notes",
    fields: [
      ["condition", "fCondition"],
      ["status", "fStatus"],
      ["diagnosedDate", "fDiagnosedDate"],
      ["notes", "fNotes"],
    ],
  },
  {
    key: "visitNotes",
    endpoint: "/api/vet-record/notes",
    invalidate: "vet-record-notes",
    markerField: "note",
    requiredDate: "noteDate",
    fields: [
      ["vetName", "fVetName"],
      ["noteDate", "fDate"],
      ["note", "fNote"],
    ],
  },
];

const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g]));

// Flatten the proposal into an editable, ordered item list (one entry per proposed row).
function flatten(records = {}) {
  const items = [];
  for (const g of GROUPS) {
    const rows = Array.isArray(records[g.key]) ? records[g.key] : [];
    rows.forEach((row, i) => {
      const values = {};
      g.fields.forEach(([k]) => {
        values[k] = row?.[k] == null ? "" : String(row[k]);
      });
      items.push({ id: `${g.key}-${i}`, groupKey: g.key, included: true, values });
    });
  }
  return items;
}

export function ReviewProposalModal({ visible, proposal, petId, onClose, onApplied }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const initial = useMemo(() => flatten(proposal?.records), [proposal]);
  const [items, setItems] = useState(initial);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const rv = (k, opts) => t(`health.vetRecord.review.${k}`, opts);

  const includedCount = items.filter((i) => i.included).length;

  const setValue = (id, key, val) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, values: { ...it.values, [key]: val } } : it,
      ),
    );
  const toggle = (id) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, included: !it.included } : it)),
    );

  const applyOne = async (item) => {
    const g = GROUP_BY_KEY[item.groupKey];
    const body = { petId };
    g.fields.forEach(([k]) => {
      const v = (item.values[k] ?? "").toString().trim();
      body[k] = v.length ? v : null;
    });
    // Routes that need a date (surgery/lab/note) reject a null — fall back to today so a proposal
    // with a missing date still applies rather than 400ing.
    if (g.requiredDate && !body[g.requiredDate]) {
      body[g.requiredDate] = getLocalPostDateString();
    }
    // Source marker so the row reads as digitized-from-a-document, without clobbering owner notes.
    const marker = rv("sourceMarker");
    const existing = body[g.markerField];
    body[g.markerField] = existing ? `${existing} · ${marker}` : marker;

    const res = await fetch(g.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "apply-failed");
    }
  };

  const handleApply = async () => {
    const chosen = items.filter((i) => i.included);
    if (!chosen.length || applying || !petId) return;
    setApplying(true);
    const touched = new Set();
    let failed = 0;
    for (const item of chosen) {
      try {
        await applyOne(item);
        touched.add(GROUP_BY_KEY[item.groupKey].invalidate);
      } catch {
        failed += 1;
      }
    }
    // Refresh every touched history query + the summary counts so the new rows appear.
    touched.add("vet-record-summary");
    touched.forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key, petId] }),
    );
    setApplying(false);
    if (failed > 0) {
      Alert.alert(t("health.vetRecord.errorTitle"), rv("applyError"));
    }
    onApplied?.();
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: MATERIALS.surface,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: MATERIALS.hairline,
          }}
        >
          <TouchableOpacity onPress={onClose} accessibilityLabel={t("health.vetRecord.close")}>
            <X size={22} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
            {rv("title")}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        >
          <Text style={[TYPE.body, { color: COLORS.mutedBrown, marginBottom: 12 }]}>
            {rv("subtitle")}
          </Text>

          {/* AI transparency line */}
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
              backgroundColor: MATERIALS.surfaceSunken,
              borderRadius: 14,
              padding: 12,
              marginBottom: SPACING.xl,
              borderWidth: 1,
              borderColor: MATERIALS.hairline,
            }}
          >
            <Sparkles size={16} color={COLORS.coral} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, color: COLORS.mutedBrown, lineHeight: 17 }}>
              {rv("aiDisclosure")}
            </Text>
          </View>

          {GROUPS.map((g) => {
            const groupItems = items.filter((it) => it.groupKey === g.key);
            if (!groupItems.length) return null;
            return (
              <View key={g.key} style={{ marginBottom: SPACING.xl }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "800",
                    color: COLORS.warmBrown,
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {rv(`group${g.key.charAt(0).toUpperCase()}${g.key.slice(1)}`)}
                </Text>

                {groupItems.map((item) => (
                  <View
                    key={item.id}
                    testID={`proposed-${item.id}`}
                    style={{
                      backgroundColor: "#FFF",
                      borderRadius: RADIUS.control,
                      padding: 14,
                      marginBottom: 12,
                      borderWidth: 1.5,
                      borderColor: item.included ? COLORS.coral : MATERIALS.hairline,
                      opacity: item.included ? 1 : 0.6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "flex-end",
                        marginBottom: 6,
                      }}
                    >
                      <TouchableOpacity
                        testID={`toggle-${item.id}`}
                        onPress={() => toggle(item.id)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingVertical: 4,
                          paddingHorizontal: 10,
                          borderRadius: 14,
                          backgroundColor: item.included
                            ? COLORS.coral + "18"
                            : MATERIALS.surfaceSunken,
                        }}
                      >
                        {item.included ? (
                          <Check size={14} color={COLORS.coral} />
                        ) : null}
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: item.included ? COLORS.coral : COLORS.mutedBrown,
                          }}
                        >
                          {item.included ? rv("include") : rv("skip")}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {g.fields.map(([key, labelKey]) => (
                      <View key={key} style={{ marginBottom: 10 }}>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: COLORS.mutedBrown,
                            marginBottom: 4,
                          }}
                        >
                          {rv(labelKey)}
                        </Text>
                        <TextInput
                          value={item.values[key]}
                          onChangeText={(txt) => setValue(item.id, key, txt)}
                          editable={item.included}
                          placeholder={rv(labelKey)}
                          placeholderTextColor={COLORS.mutedBrown}
                          style={{
                            backgroundColor: MATERIALS.surfaceSunken,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            fontSize: 14,
                            color: COLORS.warmBrown,
                          }}
                        />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
        </KeyboardAwareScrollView>

        {/* Footer actions */}
        <View
          style={{
            padding: 16,
            paddingBottom: insets.bottom + 12,
            borderTopWidth: 1,
            borderTopColor: MATERIALS.hairline,
            backgroundColor: MATERIALS.surface,
            gap: 10,
          }}
        >
          <TouchableOpacity
            testID="apply-records"
            onPress={handleApply}
            disabled={includedCount === 0 || applying}
            style={{
              backgroundColor: includedCount > 0 ? COLORS.coral : MATERIALS.surfaceSunken,
              borderRadius: RADIUS.control,
              height: 52,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            {applying ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text
                style={[
                  TYPE.headline,
                  {
                    fontWeight: "800",
                    color: includedCount > 0 ? "#FFF" : COLORS.mutedBrown,
                  },
                ]}
              >
                {includedCount > 0
                  ? rv("addCount", { count: includedCount })
                  : rv("addNone")}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} disabled={applying} style={{ alignItems: "center", paddingVertical: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.mutedBrown }}>
              {rv("notNow")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default ReviewProposalModal;
