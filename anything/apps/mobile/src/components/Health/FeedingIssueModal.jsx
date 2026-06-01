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
import { X, Camera } from "lucide-react-native";
import { useCurrentPet } from "@/hooks/useCurrentPet";
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
      let message = `${reminder.title} logged with notes`;
      if (appetite === "low" || vomiting) {
        message +=
          ". Based on your logs, this may be worth monitoring if it continues.";
      }

      Alert.alert("✅ Logged", message);
      resetForm();
      onSaved();
    },
    onError: (error) => {
      console.error("[FeedingIssueModal] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
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

  const mealName = reminder?.title || "this meal";
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
              What was different with this meal?
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown }}>
              {mealName} • {scheduledTime} • {petName}
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
              Appetite
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {["low", "normal", "high"].map((level) => (
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
                      textTransform: "capitalize",
                    }}
                  >
                    {level}
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
              Finished meal
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {["yes", "partially", "no"].map((option) => (
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
                      textTransform: "capitalize",
                    }}
                  >
                    {option}
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
              Vomiting or reaction
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { value: false, label: "No" },
                { value: true, label: "Yes" },
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
              Anything worth noting?
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g., Only ate half, seemed uninterested, ate slowly..."
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
                Based on your logs, this may be worth monitoring if it
                continues. Contact your vet if you notice other symptoms.
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
              {logIssueMutation.isPending ? "Saving..." : "Save"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingAnimatedView>
    </Modal>
  );
}
