import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { X, History, Calendar, ClipboardCheck } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  getWellnessSchema,
  initialFormValues,
  validateWellnessForm,
  buildWellnessLogPayload,
} from "@/utils/wellnessLog";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Single config-driven log-entry modal for every wellness check type. Fields come
// from WELLNESS_FIELD_SCHEMA via the reminder's checkType; save routes through
// buildWellnessLogPayload (weight → weight-logs, everything else → wellness-logs).
export default function WellnessLogModal({ visible, reminder, onClose, onSaved }) {
  const insets = useSafeAreaInsets();
  const { data: currentPet } = useCurrentPet();
  const queryClient = useQueryClient();

  const checkType = reminder?.checkType;
  const schema = useMemo(() => getWellnessSchema(checkType), [checkType]);
  const isWeight = schema.kind === "weight";

  const [activeTab, setActiveTab] = useState("add");
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(() => initialFormValues(checkType));

  // History (also the source of the default weight unit). Hits the right endpoint
  // for the check type; only fetched while the modal is open for a real pet.
  const petId = currentPet?.id;
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: isWeight
      ? ["health", "weight-logs", petId]
      : ["health", "wellness-logs", petId, checkType],
    queryFn: async () => {
      const url = isWeight
        ? `/api/health/weight-logs?petId=${petId}&limit=20`
        : `/api/health/wellness-logs?petId=${petId}&checkType=${checkType}&limit=20`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!visible && !!petId && !!checkType,
    staleTime: 1000 * 30,
  });
  const entries = historyData?.logs || [];

  // Reset the form whenever the modal opens for a (different) reminder. Seed the
  // weight unit from the most recent weight log if one exists.
  useEffect(() => {
    if (!visible) return;
    const lastUnit = isWeight ? entries[0]?.weight_unit : undefined;
    setForm(initialFormValues(checkType, { lastUnit }));
    setActiveTab("add");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reminder?.id]);

  const setValue = (value) => setForm((f) => ({ ...f, value }));
  const setUnit = (unit) => setForm((f) => ({ ...f, unit }));
  const setNote = (note) => setForm((f) => ({ ...f, note }));

  const handleSave = async () => {
    if (!reminder || !petId) {
      Alert.alert("Could not save", "Please select a pet first.");
      return;
    }
    const error = validateWellnessForm(checkType, form);
    if (error) {
      Alert.alert("Almost there", error);
      return;
    }

    try {
      setIsSaving(true);
      const { endpoint, body } = buildWellnessLogPayload(reminder, form);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      }

      await queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      await queryClient.invalidateQueries({
        queryKey: isWeight
          ? ["health", "weight-logs"]
          : ["health", "wellness-logs"],
      });

      // Complete ONLY this reminder instance, then show the entry in history.
      onSaved?.(reminder.id);
      setActiveTab("history");
    } catch (err) {
      console.error("[WellnessLogModal] save failed", err);
      Alert.alert("Could not save", "We couldn't save this entry. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const title = reminder?.title || schema.label || "Wellness check";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
          {/* Header */}
          <View
            style={{
              backgroundColor: C.card,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <ClipboardCheck size={22} color={C.coral} />
              <Text
                style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown, flex: 1 }}
                numberOfLines={1}
              >
                {title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSaving}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X size={18} color={C.warmBrown} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: C.card,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 8,
              gap: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => setActiveTab("add")}
              disabled={isSaving}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: activeTab === "add" ? C.coral : C.sand,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: activeTab === "add" ? "#FFF" : C.warmBrown,
                }}
              >
                Add entry
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("history")}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: activeTab === "history" ? C.coral : C.sand,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <History size={16} color={activeTab === "history" ? "#FFF" : C.warmBrown} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: activeTab === "history" ? "#FFF" : C.warmBrown,
                }}
              >
                History
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {activeTab === "add" ? (
              isSaving ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color={C.coral} />
                  <Text style={{ fontSize: 14, color: C.mutedBrown, marginTop: 16 }}>
                    Saving...
                  </Text>
                </View>
              ) : (
                <View>
                  <View
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 16,
                      padding: 18,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: C.peach,
                    }}
                  >
                    {renderFields({ schema, form, setValue, setUnit })}
                  </View>

                  {/* Note */}
                  <View
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 16,
                      padding: 18,
                      marginBottom: 20,
                      borderWidth: 1,
                      borderColor: C.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: C.mutedBrown,
                        marginBottom: 8,
                      }}
                    >
                      {schema.kind === "general" && form.value === "noticed_something"
                        ? "Note *"
                        : "Notes (optional)"}
                    </Text>
                    <TextInput
                      value={form.note}
                      onChangeText={setNote}
                      placeholder="Any observations or context..."
                      placeholderTextColor={C.mutedBrown}
                      multiline
                      numberOfLines={3}
                      style={{
                        backgroundColor: C.sand,
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 14,
                        color: C.warmBrown,
                        borderWidth: 1,
                        borderColor: C.peach,
                        minHeight: 80,
                        textAlignVertical: "top",
                      }}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleSave}
                    disabled={isSaving}
                    style={{
                      backgroundColor: C.coral,
                      borderRadius: 14,
                      paddingVertical: 16,
                      alignItems: "center",
                      shadowColor: C.coral,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 4,
                      marginBottom: Platform.OS === "ios" ? 20 : 10,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>
                      Save entry
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <HistoryList
                isWeight={isWeight}
                schema={schema}
                entries={entries}
                isLoading={isLoadingHistory}
              />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- Field renderers (config-driven) -------------------------------------------

function renderFields({ schema, form, setValue, setUnit }) {
  if (schema.kind === "weight") {
    return (
      <View>
        <Text style={fieldLabel}>Weight *</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <TextInput
            value={form.value ?? ""}
            onChangeText={setValue}
            placeholder="e.g., 12.4"
            placeholderTextColor={C.mutedBrown}
            keyboardType="decimal-pad"
            style={{
              flex: 1,
              backgroundColor: C.sand,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: C.warmBrown,
              borderWidth: 1,
              borderColor: C.peach,
            }}
          />
          <View style={{ flexDirection: "row", gap: 6 }}>
            {schema.units.map((u) => (
              <TouchableOpacity
                key={u}
                onPress={() => setUnit(u)}
                style={{
                  paddingHorizontal: 16,
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: form.unit === u ? C.coral : C.sand,
                  borderWidth: 1.5,
                  borderColor: form.unit === u ? C.coral : C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: form.unit === u ? "#FFF" : C.warmBrown,
                  }}
                >
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (schema.kind === "text") {
    return (
      <View>
        <Text style={fieldLabel}>{schema.label} *</Text>
        <TextInput
          value={form.value ?? ""}
          onChangeText={setValue}
          placeholder="Enter a value..."
          placeholderTextColor={C.mutedBrown}
          style={{
            backgroundColor: C.sand,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            color: C.warmBrown,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        />
      </View>
    );
  }

  // options + general: single-select chips.
  return (
    <View>
      <Text style={fieldLabel}>{schema.label} *</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {schema.options.map((opt) => {
          const selected = form.value === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setValue(opt.key)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: selected ? C.coral : C.sand,
                borderWidth: 1.5,
                borderColor: selected ? C.coral : C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: selected ? "700" : "600",
                  color: selected ? "#FFF" : C.warmBrown,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function HistoryList({ isWeight, schema, entries, isLoading }) {
  if (isLoading) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 60 }}>
        <ActivityIndicator size="large" color={C.coral} />
      </View>
    );
  }
  if (!entries.length) {
    return (
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 16,
          padding: 40,
          alignItems: "center",
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <ClipboardCheck size={40} color={C.mutedBrown} opacity={0.3} />
        <Text
          style={{ fontSize: 14, color: C.mutedBrown, textAlign: "center", marginTop: 14 }}
        >
          No entries yet
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {entries.map((entry) => {
        const headline = isWeight
          ? `${entry.weight} ${entry.weight_unit || ""}`.trim()
          : describeWellnessEntry(schema, entry);
        return (
          <View
            key={entry.id}
            style={{
              backgroundColor: C.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Text
              style={{ fontSize: 18, fontWeight: "800", color: C.warmBrown, marginBottom: 6 }}
            >
              {headline}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Calendar size={12} color={C.mutedBrown} />
              <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                {formatDate(entry.logged_at)}
              </Text>
            </View>
            {entry.notes ? (
              <View
                style={{
                  backgroundColor: C.sand,
                  borderRadius: 10,
                  padding: 10,
                  marginTop: 10,
                }}
              >
                <Text style={{ fontSize: 12, color: C.mutedBrown, lineHeight: 17 }}>
                  {entry.notes}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function describeWellnessEntry(schema, entry) {
  const v = entry.values_json || {};
  if (v.label) return v.label;
  const raw = v[schema.valueKey];
  if (raw == null || raw === "") return schema.label;
  const opt = (schema.options || []).find((o) => o.key === raw);
  return opt ? opt.label : String(raw);
}

const fieldLabel = {
  fontSize: 13,
  fontWeight: "600",
  color: C.mutedBrown,
  marginBottom: 10,
};
