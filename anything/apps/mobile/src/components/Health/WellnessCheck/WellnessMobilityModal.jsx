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
import { X, Activity, Info } from "lucide-react-native";
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

export default function WellnessMobilityModal({
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
  const [limping, setLimping] = useState(false);
  const [stiffness, setStiffness] = useState(false);
  const [difficultyJumping, setDifficultyJumping] = useState(false);
  const [difficultyStanding, setDifficultyStanding] = useState(false);
  const [energyDuringMovement, setEnergyDuringMovement] = useState("normal");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setLimping(false);
    setStiffness(false);
    setDifficultyJumping(false);
    setDifficultyStanding(false);
    setEnergyDuringMovement("normal");
    setNotes("");
  };

  const saveMobilityCheck = async () => {
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
          checkType: "mobility",
          valuesJson: {
            limping,
            stiffness,
            difficultyJumping,
            difficultyStanding,
            energyDuringMovement,
          },
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save mobility check");
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
      console.error("[WellnessMobilityModal] Error:", error);
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
                <Activity size={22} color={C.coral} />
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: C.warmBrown,
                  }}
                >
                  Mobility Check
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
                      marginBottom: 16,
                    }}
                  >
                    Movement observations
                  </Text>

                  {/* Limping */}
                  <TouchableOpacity
                    onPress={() => setLimping(!limping)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: C.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: C.warmBrown,
                      }}
                    >
                      Limping or favoring a leg?
                    </Text>
                    <View
                      style={{
                        width: 50,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: limping ? C.sage : C.mutedBrown + "40",
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
                          alignSelf: limping ? "flex-end" : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Stiffness */}
                  <TouchableOpacity
                    onPress={() => setStiffness(!stiffness)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: C.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: C.warmBrown,
                      }}
                    >
                      Stiffness or slow to rise?
                    </Text>
                    <View
                      style={{
                        width: 50,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: stiffness
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
                          alignSelf: stiffness ? "flex-end" : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Difficulty jumping */}
                  <TouchableOpacity
                    onPress={() => setDifficultyJumping(!difficultyJumping)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: C.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: C.warmBrown,
                      }}
                    >
                      Difficulty jumping or stairs?
                    </Text>
                    <View
                      style={{
                        width: 50,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: difficultyJumping
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
                          alignSelf: difficultyJumping
                            ? "flex-end"
                            : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Difficulty standing */}
                  <TouchableOpacity
                    onPress={() => setDifficultyStanding(!difficultyStanding)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: C.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: C.warmBrown,
                      }}
                    >
                      Difficulty standing up?
                    </Text>
                    <View
                      style={{
                        width: 50,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: difficultyStanding
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
                          alignSelf: difficultyStanding
                            ? "flex-end"
                            : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Energy during movement */}
                  <View style={{ marginTop: 16 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: C.warmBrown,
                        marginBottom: 10,
                      }}
                    >
                      Energy during movement
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {["low", "normal", "high"].map((level) => (
                        <TouchableOpacity
                          key={level}
                          onPress={() => setEnergyDuringMovement(level)}
                          style={{
                            flex: 1,
                            paddingVertical: 12,
                            borderRadius: 12,
                            backgroundColor:
                              energyDuringMovement === level ? C.coral : C.sand,
                            borderWidth: 1.5,
                            borderColor:
                              energyDuringMovement === level
                                ? C.coral
                                : C.peach,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight:
                                energyDuringMovement === level ? "700" : "600",
                              color:
                                energyDuringMovement === level
                                  ? "#FFF"
                                  : C.warmBrown,
                              textTransform: "capitalize",
                            }}
                          >
                            {level}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
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
                    Mobility changes help track your pet's comfort and movement
                    over time. This does not diagnose or replace veterinary
                    care.
                  </Text>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                  onPress={saveMobilityCheck}
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
