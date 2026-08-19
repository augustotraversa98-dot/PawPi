import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { X, Camera } from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";

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
  honey: "#F4A460",
};

export default function FeedingIssueModal({
  visible,
  onClose,
  onSaved,
  reminder,
  petName,
}) {
  const { t } = useTranslation();
  const { data: currentPet } = useCurrentPet();
  const queryClient = useQueryClient();

  const [appetite, setAppetite] = useState("normal");
  const [finishedMeal, setFinishedMeal] = useState("yes");
  const [vomiting, setVomiting] = useState(false);
  const [notes, setNotes] = useState("");

  const logIssueMutation = useMutation({
    mutationFn: async () => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/food-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          mealType: reminder.title || "meal",
          foodName: null,
          amount: null,
          appetite,
          finishedMeal: finishedMeal === "yes",
          waterIntake: null,
          vomitingOrReaction: vomiting,
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log food");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "food-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });

      // Show feedback based on what was logged
      let message = t("health.feeding.loggedWithNotes", { title: reminder.title });
      if (appetite === "low" || vomiting) {
        message += t("health.feeding.watchAppend");
      }

      Alert.alert(`✅ ${t("health.feeding.loggedTitle")}`, message);
      resetForm();
      onSaved();
    },
    onError: (error) => {
      console.error("[FeedingIssueModal] Error:", error);
      Alert.alert(t("health.feeding.errorTitle"), t("health.feeding.errorBody"));
    },
  });

  const resetForm = () => {
    setAppetite("normal");
    setFinishedMeal("yes");
    setVomiting(false);
    setNotes("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = () => {
    logIssueMutation.mutate();
  };

  const mealName = reminder?.title || t("health.feeding.thisMeal");
  const scheduledTime = reminder?.scheduledAt
    ? new Date(reminder.scheduledAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <KeyboardAvoidingAnimatedView
        style={{ flex: 1, backgroundColor: C.cream }}
        behavior="padding"
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 20,
            paddingTop: 60,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 4,
              }}
            >
              {t("health.feeding.issueTitle")}
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown }}>
              {t("health.feeding.issueSubtitle", { meal: mealName, time: scheduledTime, pet: petName })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: C.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <X size={20} color={C.warmBrown} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Appetite */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 10,
              }}
            >
              {t("health.feeding.appetite")}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { value: "low", label: t("health.feeding.appetiteLow") },
                { value: "normal", label: t("health.feeding.appetiteNormal") },
                { value: "high", label: t("health.feeding.appetiteHigh") },
              ].map(({ value: level, label }) => (
                <TouchableOpacity
                  key={level}
                  onPress={() => setAppetite(level)}
                  style={{
                    flex: 1,
                    backgroundColor:
                      appetite === level ? C.sage + "20" : C.sand,
                    borderRadius: 12,
                    paddingVertical: 12,
                    borderWidth: 1.5,
                    borderColor: appetite === level ? C.sage : C.peach,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: appetite === level ? "700" : "600",
                      color: appetite === level ? C.sage : C.warmBrown,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Finished meal */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 10,
              }}
            >
              {t("health.feeding.finishedMeal")}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { value: "yes", label: t("health.feeding.finishedYes") },
                { value: "partially", label: t("health.feeding.finishedPartially") },
                { value: "no", label: t("health.feeding.finishedNo") },
              ].map(({ value: option, label }) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setFinishedMeal(option)}
                  style={{
                    flex: 1,
                    backgroundColor:
                      finishedMeal === option ? C.sage + "20" : C.sand,
                    borderRadius: 12,
                    paddingVertical: 12,
                    borderWidth: 1.5,
                    borderColor: finishedMeal === option ? C.sage : C.peach,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: finishedMeal === option ? "700" : "600",
                      color: finishedMeal === option ? C.sage : C.warmBrown,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Vomiting or reaction */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 10,
              }}
            >
              {t("health.feeding.vomiting")}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { value: false, label: t("health.feeding.no") },
                { value: true, label: t("health.feeding.yes") },
              ].map((option) => (
                <TouchableOpacity
                  key={option.label}
                  onPress={() => setVomiting(option.value)}
                  style={{
                    flex: 1,
                    backgroundColor:
                      vomiting === option.value
                        ? option.value
                          ? C.coral + "20"
                          : C.sage + "20"
                        : C.sand,
                    borderRadius: 12,
                    paddingVertical: 12,
                    borderWidth: 1.5,
                    borderColor:
                      vomiting === option.value
                        ? option.value
                          ? C.coral
                          : C.sage
                        : C.peach,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: vomiting === option.value ? "700" : "600",
                      color:
                        vomiting === option.value
                          ? option.value
                            ? C.coral
                            : C.sage
                          : C.warmBrown,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 10,
              }}
            >
              {t("health.feeding.notes")}
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t("health.feeding.notesPlaceholder")}
              placeholderTextColor={C.mutedBrown}
              multiline
              numberOfLines={4}
              style={{
                backgroundColor: C.sand,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: C.warmBrown,
                textAlignVertical: "top",
                minHeight: 80,
                borderWidth: 1,
                borderColor: C.peach,
              }}
            />
          </View>

          {/* Info box */}
          {(appetite === "low" || vomiting || finishedMeal === "no") && (
            <View
              style={{
                backgroundColor: "#FFF4E6",
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: "#FFE4C4",
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: C.mutedBrown,
                  lineHeight: 18,
                }}
              >
                {t("health.feeding.watchNote")}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Save Button - Fixed at bottom */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 20,
            borderTopWidth: 1,
            borderTopColor: C.peach,
            backgroundColor: C.cream,
          }}
        >
          <TouchableOpacity
            onPress={handleSave}
            disabled={logIssueMutation.isPending}
            style={{
              backgroundColor: C.sage,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              opacity: logIssueMutation.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
              {logIssueMutation.isPending ? t("health.feeding.saving") : t("health.feeding.save")}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingAnimatedView>
    </Modal>
  );
}
