import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import { X, Smile, Info } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentPet } from "@/hooks/useCurrentPet";
import { useQueryClient } from "@tanstack/react-query";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";

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

const MOOD_OPTIONS = [
  { key: "happy", label: "Happy", emoji: "😊" },
  { key: "normal", label: "Normal", emoji: "😐" },
  { key: "anxious", label: "Anxious", emoji: "😰" },
  { key: "tired", label: "Tired", emoji: "😴" },
  { key: "restless", label: "Restless", emoji: "😬" },
  { key: "other", label: "Other", emoji: "❓" },
];

export default function WellnessMoodEnergyModal({
  visible,
  onClose,
  reminderId,
  onComplete,
}) {
  const insets = useSafeAreaInsets();
  const { data: currentPet } = useCurrentPet();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [mood, setMood] = useState("normal");
  const [energy, setEnergy] = useState("normal");
  const [appetiteChange, setAppetiteChange] = useState(false);
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setMood("normal");
    setEnergy("normal");
    setAppetiteChange(false);
    setNotes("");
  };

  const saveMoodEnergyCheck = async () => {
    if (!currentPet?.id) {
      alert("No pet selected");
      return;
    }

    try {
      setIsSaving(true);

      const response = await fetch("/api/health/wellness-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          checkType: "mood_energy",
          valuesJson: {
            mood,
            energy,
            appetiteChange,
          },
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save mood/energy check");
      }

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      await queryClient.invalidateQueries({
        queryKey: ["health", "wellness-logs"],
      });

      // Mark reminder complete if provided
      if (reminderId && onComplete) {
        onComplete(reminderId);
      }

      resetForm();
      onClose();
    } catch (error) {
      console.error("[WellnessMoodEnergyModal] Error:", error);
      alert("Could not save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardSafeFormModal>
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Smile size={22} color={C.coral} />
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: C.warmBrown,
                  }}
                >
                  Mood & Energy
                </Text>
              </View>
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

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isSaving && (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={C.coral} />
                <Text
                  style={{ fontSize: 14, color: C.mutedBrown, marginTop: 16 }}
                >
                  Saving...
                </Text>
              </View>
            )}

            {!isSaving && (
              <View>
                {/* Mood */}
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
                    How is {currentPet?.name || "your pet"}'s mood?
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                  >
                    {MOOD_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => setMood(option.key)}
                        style={{
                          backgroundColor:
                            mood === option.key ? C.coral + "30" : C.sand,
                          borderRadius: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          borderWidth: 1.5,
                          borderColor: mood === option.key ? C.coral : C.peach,
                          minWidth: "30%",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 24, marginBottom: 4 }}>
                          {option.emoji}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: mood === option.key ? "700" : "600",
                            color: C.warmBrown,
                          }}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Energy */}
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
                    Energy level
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["low", "normal", "high"].map((level) => (
                      <TouchableOpacity
                        key={level}
                        onPress={() => setEnergy(level)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: energy === level ? C.coral : C.sand,
                          borderWidth: 1.5,
                          borderColor: energy === level ? C.coral : C.peach,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: energy === level ? "700" : "600",
                            color: energy === level ? "#FFF" : C.warmBrown,
                            textTransform: "capitalize",
                          }}
                        >
                          {level}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Appetite change */}
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
                  <TouchableOpacity
                    onPress={() => setAppetiteChange(!appetiteChange)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: C.warmBrown,
                      }}
                    >
                      Notice any appetite change?
                    </Text>
                    <View
                      style={{
                        width: 50,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: appetiteChange
                          ? C.sage
                          : C.mutedBrown + "40",
                        justifyContent: "center",
                        paddingHorizontal: 3,
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: "#FFF",
                          alignSelf: appetiteChange ? "flex-end" : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Notes */}
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
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 8,
                    }}
                  >
                    Notes (optional)
                  </Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Any observations..."
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

                {/* Info */}
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
                    Mood and energy changes help track your pet's wellbeing over
                    time. This does not diagnose or replace veterinary care.
                  </Text>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                  onPress={saveMoodEnergyCheck}
                  disabled={isSaving}
                  style={{
                    backgroundColor: isSaving ? C.mutedBrown : C.coral,
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
                    style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}
                  >
                    Save check
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardSafeFormModal>
    </Modal>
  );
}
