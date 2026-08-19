import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
  X,
  Scale,
  Camera,
  Calendar,
  ChevronDown,
  Info,
  History,
  Trash2,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useQueryClient, useQuery } from "@tanstack/react-query";

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

// Body shape constants
const BODY_SHAPES = [
  { key: "very_thin", emoji: "🦴", color: "#FF5733" },
  { key: "thin", emoji: "🐕", color: "#FFB74D" },
  { key: "ideal", emoji: "✅", color: "#66BB6A" },
  { key: "overweight", emoji: "🍖", color: "#FFB74D" },
  { key: "obese", emoji: "🎈", color: "#FF5733" },
];

const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getBodyShapeEmoji = (key) => {
  const shape = BODY_SHAPES.find((s) => s.key === key);
  return shape?.emoji || "✅";
};

const getBodyShapeLabel = (key, t) => {
  const shape = BODY_SHAPES.find((s) => s.key === key);
  return shape ? t(`trackers.weight.shape.${shape.key}`) : t("trackers.weight.shape.unknown");
};

export default function WeightModal({ visible, onClose }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: currentPet } = useCurrentPet();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("add"); // add, history
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [weight, setWeight] = useState("");
  const [bodyShape, setBodyShape] = useState("ideal");
  const [notes, setNotes] = useState("");
  const [showVetFields, setShowVetFields] = useState(false);
  const [bodyConditionScore, setBodyConditionScore] = useState("");
  const [muscleConditionScore, setMuscleConditionScore] = useState("normal");
  const [targetWeight, setTargetWeight] = useState("");
  const [vetNotes, setVetNotes] = useState("");

  // Fetch weight history
  const { data: weightHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["health", "weight-logs", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { logs: [] };

      const response = await fetch(
        `/api/health/weight-logs?petId=${currentPet.id}&limit=20`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch weight logs");
      }
      const data = await response.json();
      return data;
    },
    enabled: !!currentPet?.id && activeTab === "history",
    staleTime: 1000 * 30,
  });

  const saveWeightLog = async () => {
    if (!weight) {
      alert(t("trackers.weight.modal.enterWeight"));
      return;
    }

    if (!currentPet?.id) {
      console.error("[WeightTracker] No current pet found");
      alert(t("trackers.weight.modal.selectPetError"));
      return;
    }

    try {
      setIsSaving(true);

      console.log("[WeightTracker] Saving weight log:", {
        petId: currentPet.id,
        petName: currentPet.name,
        weight: parseFloat(weight),
        bodyShape,
      });

      const response = await fetch("/api/health/weight-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          weight: parseFloat(weight),
          weightUnit: "lbs",
          bodyShapeEstimate: bodyShape,
          photoUrl: null,
          notes: notes || "",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[WeightTracker] Save failed:", errorData);
        throw new Error(errorData.error || "Failed to save weight log");
      }

      const result = await response.json();
      console.log("[WeightTracker] Weight log saved successfully:", result);

      // Refetch timeline and weight logs
      await queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      await queryClient.invalidateQueries({
        queryKey: ["health", "weight-logs"],
      });

      resetForm();
      setActiveTab("history");
    } catch (error) {
      console.error("[WeightTracker] Error saving weight log:", error);
      alert(t("trackers.weight.modal.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setWeight("");
    setBodyShape("ideal");
    setNotes("");
    setBodyConditionScore("");
    setMuscleConditionScore("normal");
    setTargetWeight("");
    setVetNotes("");
    setShowVetFields(false);
  };

  const handleDelete = (entryId) => {
    Alert.alert(t("trackers.weight.modal.deleteTitle"), t("trackers.weight.modal.deleteBody"), [
      { text: t("trackers.weight.modal.cancel"), style: "cancel" },
      {
        text: t("trackers.weight.modal.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            const res = await fetch(
              `/api/health/weight-logs?id=${encodeURIComponent(entryId)}`,
              { method: "DELETE" },
            );
            if (!res.ok) throw new Error("Failed to delete entry");
            await queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
            await queryClient.invalidateQueries({
              queryKey: ["health", "weight-logs"],
            });
          } catch (e) {
            Alert.alert(t("trackers.weight.modal.deleteError"), e.message || t("trackers.weight.modal.pleaseTryAgain"));
          }
        },
      },
    ]);
  };

  const weightEntries = weightHistory?.logs || [];

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
        <View
          style={{
            flex: 1,
            backgroundColor: C.cream,
            paddingTop: insets.top,
          }}
        >
          {/* Header */}
          <View
            style={{
              backgroundColor: C.card,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: C.warmBrown,
                }}
              >
                {t("trackers.weight.title")}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: C.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
                disabled={isSaving}
              >
                <X size={18} color={C.warmBrown} />
              </TouchableOpacity>
            </View>
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
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: activeTab === "add" ? C.coral : C.sand,
                alignItems: "center",
              }}
              disabled={isSaving}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: activeTab === "add" ? "#FFF" : C.warmBrown,
                }}
              >
                {t("trackers.weight.modal.addEntry")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("history")}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: activeTab === "history" ? C.coral : C.sand,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <History
                size={16}
                color={activeTab === "history" ? "#FFF" : C.warmBrown}
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: activeTab === "history" ? "#FFF" : C.warmBrown,
                }}
              >
                {t("trackers.weight.modal.history")}
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
              <View>
                {isSaving && (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <ActivityIndicator size="large" color={C.coral} />
                    <Text
                      style={{
                        fontSize: 14,
                        color: C.mutedBrown,
                        marginTop: 16,
                      }}
                    >
                      {t("trackers.weight.modal.saving")}
                    </Text>
                  </View>
                )}

                {!isSaving && (
                  <>
                    {/* Owner-Friendly Fields */}
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
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: C.warmBrown,
                          marginBottom: 14,
                        }}
                      >
                        {t("trackers.weight.modal.weightInfo")}
                      </Text>

                      {/* Weight Input */}
                      <View style={{ marginBottom: 16 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: C.mutedBrown,
                            marginBottom: 8,
                          }}
                        >
                          {t("trackers.weight.modal.currentLbs")}
                        </Text>
                        <TextInput
                          value={weight}
                          onChangeText={setWeight}
                          placeholder={t("trackers.weight.modal.weightPlaceholder")}
                          keyboardType="decimal-pad"
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

                      {/* Body Shape Visual Estimate */}
                      <View style={{ marginBottom: 16 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: C.mutedBrown,
                            marginBottom: 8,
                          }}
                        >
                          {t("trackers.weight.modal.bodyShapeLabel")}
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 10 }}
                        >
                          {BODY_SHAPES.map((shape) => (
                            <TouchableOpacity
                              key={shape.key}
                              onPress={() => setBodyShape(shape.key)}
                              style={{
                                backgroundColor:
                                  bodyShape === shape.key
                                    ? shape.color + "30"
                                    : C.sand,
                                borderRadius: 12,
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderWidth: 1.5,
                                borderColor:
                                  bodyShape === shape.key
                                    ? shape.color
                                    : C.peach,
                                minWidth: 100,
                                alignItems: "center",
                              }}
                            >
                              <Text style={{ fontSize: 22, marginBottom: 4 }}>
                                {shape.emoji}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "700",
                                  color: C.warmBrown,
                                  textAlign: "center",
                                }}
                              >
                                {t(`trackers.weight.shape.${shape.key}`)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <Text
                          style={{
                            fontSize: 11,
                            color: C.mutedBrown,
                            marginTop: 8,
                            fontStyle: "italic",
                          }}
                        >
                          {t(`trackers.weight.shape.desc_${bodyShape}`)}
                        </Text>
                      </View>

                      {/* Notes */}
                      <View style={{ marginBottom: 16 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: C.mutedBrown,
                            marginBottom: 8,
                          }}
                        >
                          {t("trackers.weight.modal.notes")}
                        </Text>
                        <TextInput
                          value={notes}
                          onChangeText={setNotes}
                          placeholder={t("trackers.weight.modal.notesPlaceholder")}
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

                      {/* Photo Upload Placeholder */}
                      <TouchableOpacity
                        style={{
                          backgroundColor: C.sand,
                          borderRadius: 12,
                          paddingVertical: 14,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          borderWidth: 1,
                          borderColor: C.peach,
                          borderStyle: "dashed",
                        }}
                      >
                        <Camera size={18} color={C.mutedBrown} />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: C.mutedBrown,
                          }}
                        >
                          {t("trackers.weight.modal.addPhotoSoon")}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Info Banner */}
                    <View
                      style={{
                        backgroundColor: C.sand,
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 20,
                        borderWidth: 1,
                        borderColor: C.peach,
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <Info
                        size={16}
                        color={C.mutedBrown}
                        style={{ marginTop: 1 }}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: C.mutedBrown,
                          lineHeight: 17,
                          flex: 1,
                        }}
                      >
                        {t("trackers.weight.footerInfo")}
                      </Text>
                    </View>

                    {/* Save Button */}
                    <TouchableOpacity
                      onPress={saveWeightLog}
                      disabled={isSaving || !weight}
                      style={{
                        backgroundColor:
                          isSaving || !weight ? C.mutedBrown : C.coral,
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
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "800",
                          color: "#FFF",
                        }}
                      >
                        {t("trackers.weight.modal.saveEntry")}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              /* History Tab */
              <View>
                {isLoadingHistory ? (
                  <View style={{ alignItems: "center", paddingVertical: 60 }}>
                    <ActivityIndicator size="large" color={C.coral} />
                  </View>
                ) : weightEntries.length > 0 ? (
                  <View style={{ gap: 12 }}>
                    {weightEntries.map((entry) => (
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
                        {/* Header */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 12,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 24,
                                fontWeight: "800",
                                color: C.warmBrown,
                                marginBottom: 2,
                              }}
                            >
                              {entry.weight} {entry.weight_unit}
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <Calendar size={12} color={C.mutedBrown} />
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: C.mutedBrown,
                                }}
                              >
                                {formatDate(entry.logged_at)}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDelete(entry.id)}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              backgroundColor: "#FFEBEE",
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <Trash2 size={16} color="#E57373" />
                          </TouchableOpacity>
                        </View>

                        {/* Body Shape */}
                        {entry.body_shape_estimate && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 10,
                            }}
                          >
                            <Text style={{ fontSize: 18 }}>
                              {getBodyShapeEmoji(entry.body_shape_estimate)}
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "600",
                                color: C.mutedBrown,
                              }}
                            >
                              {getBodyShapeLabel(entry.body_shape_estimate, t)}
                            </Text>
                          </View>
                        )}

                        {/* Notes */}
                        {entry.notes && (
                          <View
                            style={{
                              backgroundColor: C.sand,
                              borderRadius: 10,
                              padding: 10,
                              marginBottom: 10,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                lineHeight: 17,
                              }}
                            >
                              {entry.notes}
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
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
                    <Scale size={40} color={C.mutedBrown} opacity={0.3} />
                    <Text
                      style={{
                        fontSize: 14,
                        color: C.mutedBrown,
                        textAlign: "center",
                        marginTop: 14,
                      }}
                    >
                      {t("trackers.weight.modal.emptyNoEntries")}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
