import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { X, Check, AlertCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  getTrackingSourceDisplay,
  getTrackingSourceIcon,
} from "@/utils/healthKitIntegration";

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
  honey: "#FFB74D",
};

export default function PostWalkFeedbackModal({
  visible,
  onClose,
  walkData,
  onComplete,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  const [step, setStep] = useState("choice"); // "choice" | "detailed" | "confirmation"
  const [energyAfter, setEnergyAfter] = useState("normal");
  const [pace, setPace] = useState(walkData?.pace || "normal");
  const [pottyPee, setPottyPee] = useState(0);
  const [pottyPoo, setPottyPoo] = useState(0);
  const [limping, setLimping] = useState(false);
  const [unusualBehavior, setUnusualBehavior] = useState(false);
  const [detailedNotes, setDetailedNotes] = useState("");

  const trackingSource = walkData?.source || "manual";
  const trackingSourceDisplay = getTrackingSourceDisplay(trackingSource);
  const trackingSourceIcon = getTrackingSourceIcon(trackingSource);

  const logWalkMutation = useMutation({
    mutationFn: async (walkLog) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/walk-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          startTime: walkLog.startTime,
          durationMinutes: walkLog.durationMinutes,
          distance: walkLog.distance || null,
          distanceUnit: "miles",
          pace: walkLog.pace,
          energyAfter: walkLog.energyAfter,
          pottyEvents: walkLog.pottyEvents,
          routeOrLocation: walkLog.route || null,
          notes: walkLog.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log walk");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "walk-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      setStep("confirmation");
      setTimeout(() => {
        onComplete();
        resetForm();
      }, 1500);
    },
    onError: (error) => {
      console.error("[PostWalkFeedback] Error:", error);
      Alert.alert(t("common.error"), t("walkFeedback.saveError"));
    },
  });

  const resetForm = () => {
    setStep("choice");
    setEnergyAfter("normal");
    setPace(walkData?.pace || "normal");
    setPottyPee(0);
    setPottyPoo(0);
    setLimping(false);
    setUnusualBehavior(false);
    setDetailedNotes("");
  };

  const handleNormalWalk = () => {
    const normalWalkLog = {
      startTime: walkData.startTime,
      durationMinutes: walkData.durationMinutes,
      distance: walkData.distance || null,
      pace: walkData.pace || "normal",
      energyAfter: "normal",
      pottyEvents: { pee: 0, poo: 0 },
      route: walkData.notes || null,
      notes: walkData.notes || "Normal walk",
      source: trackingSource,
      sourceDevice: walkData.sourceDevice || null,
      steps: walkData.steps || null,
      averageSpeed: walkData.averageSpeed || null,
    };
    logWalkMutation.mutate(normalWalkLog);
  };

  const handleDetailedSubmit = () => {
    const detailedWalkLog = {
      startTime: walkData.startTime,
      durationMinutes: walkData.durationMinutes,
      distance: walkData.distance || null,
      pace,
      energyAfter,
      pottyEvents: { pee: pottyPee, poo: pottyPoo },
      route: walkData.notes || null,
      notes: buildDetailedNotes(),
      source: trackingSource,
      sourceDevice: walkData.sourceDevice || null,
      steps: walkData.steps || null,
      averageSpeed: walkData.averageSpeed || null,
    };
    logWalkMutation.mutate(detailedWalkLog);
  };

  const buildDetailedNotes = () => {
    const notes = [];
    if (limping) notes.push("Limping or stiffness observed");
    if (unusualBehavior) notes.push("Unusual behavior noted");
    if (detailedNotes.trim()) notes.push(detailedNotes.trim());
    if (walkData.notes) notes.push(walkData.notes);
    return notes.join(". ");
  };

  const petName = currentPet?.name || t("walkFeedback.yourDog");

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
            >
              {t("walkFeedback.headerTitle")}
            </Text>
            <Text style={{ fontSize: 13, color: C.mutedBrown }}>
              {walkData?.walk?.name || t("walkItem.walk")} ·{" "}
              {t("walkFeedback.minutes", { count: walkData?.durationMinutes || 0 })}
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
          >
            <X size={18} color={C.warmBrown} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {/* Confirmation Screen */}
          {step === "confirmation" && (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: C.sage + "20",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Check size={40} color={C.sage} />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: C.warmBrown,
                  marginBottom: 8,
                }}
              >
                {t("walkFeedback.logged")}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: C.mutedBrown,
                  textAlign: "center",
                }}
              >
                {t("walkFeedback.greatJob", { name: petName })}
              </Text>

              {/* Tracking source */}
              <View
                style={{
                  backgroundColor: C.sand,
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderWidth: 1,
                  borderColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: C.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  {trackingSourceIcon} {trackingSourceDisplay}
                </Text>
              </View>
            </View>
          )}

          {/* Choice Screen */}
          {step === "choice" && !logWalkMutation.isPending && (
            <View style={{ gap: 16 }}>
              <TouchableOpacity
                onPress={handleNormalWalk}
                style={{
                  backgroundColor: C.sage,
                  borderRadius: 18,
                  padding: 20,
                  alignItems: "center",
                  shadowColor: C.sage,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <Text style={{ fontSize: 32, marginBottom: 12 }}>✅</Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: "#FFF",
                    marginBottom: 6,
                  }}
                >
                  {t("walkFeedback.normal")}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#FFF",
                    opacity: 0.9,
                    textAlign: "center",
                  }}
                >
                  {t("walkFeedback.normalHint")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("detailed")}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 20,
                  alignItems: "center",
                  borderWidth: 1.5,
                  borderColor: C.honey + "60",
                }}
              >
                <AlertCircle
                  size={32}
                  color={C.honey}
                  style={{ marginBottom: 12 }}
                />
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: C.warmBrown,
                    marginBottom: 6,
                  }}
                >
                  {t("walkFeedback.different")}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: C.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  {t("walkFeedback.differentHint")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Detailed Form */}
          {step === "detailed" && (
            <View style={{ gap: 20 }}>
              {/* Energy After */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("walkFeedback.energyAfter")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["low", "normal", "high"].map((level) => (
                    <TouchableOpacity
                      key={level}
                      onPress={() => setEnergyAfter(level)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor:
                          energyAfter === level ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: energyAfter === level ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: energyAfter === level ? "700" : "600",
                          color: energyAfter === level ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {t(`walkFeedback.level.${level}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Pace */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("walkFeedback.pace")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["relaxed", "normal", "active"].map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setPace(p)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: pace === p ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: pace === p ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: pace === p ? "700" : "600",
                          color: pace === p ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {t(`walkFeedback.paceOpt.${p}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Potty Events */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("walkFeedback.pottyEvents")}
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
                        marginBottom: 6,
                      }}
                    >
                      {t("walkFeedback.poo")}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {[0, 1, 2, 3].map((count) => (
                        <TouchableOpacity
                          key={count}
                          onPress={() => setPottyPoo(count)}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor:
                              pottyPoo === count ? "#8D6E63" : C.sand,
                            borderWidth: 1.5,
                            borderColor:
                              pottyPoo === count ? "#8D6E63" : C.peach,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: pottyPoo === count ? "700" : "600",
                              color: pottyPoo === count ? "#FFF" : C.warmBrown,
                            }}
                          >
                            {count}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
                        marginBottom: 6,
                      }}
                    >
                      {t("walkFeedback.pee")}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {[0, 1, 2, 3].map((count) => (
                        <TouchableOpacity
                          key={count}
                          onPress={() => setPottyPee(count)}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor:
                              pottyPee === count ? "#42A5F5" : C.sand,
                            borderWidth: 1.5,
                            borderColor:
                              pottyPee === count ? "#42A5F5" : C.peach,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: pottyPee === count ? "700" : "600",
                              color: pottyPee === count ? "#FFF" : C.warmBrown,
                            }}
                          >
                            {count}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              {/* Mobility Issues */}
              <View
                style={{
                  backgroundColor: C.sand,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <TouchableOpacity
                  onPress={() => setLimping(!limping)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                    }}
                  >
                    {t("walkFeedback.limping")}
                  </Text>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: limping ? C.coral : C.card,
                      borderWidth: 1.5,
                      borderColor: limping ? C.coral : C.peach,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {limping && <Check size={14} color="#FFF" />}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setUnusualBehavior(!unusualBehavior)}
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
                    {t("walkFeedback.unusualBehavior")}
                  </Text>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: unusualBehavior ? C.coral : C.card,
                      borderWidth: 1.5,
                      borderColor: unusualBehavior ? C.coral : C.peach,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {unusualBehavior && <Check size={14} color="#FFF" />}
                  </View>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  {t("walkFeedback.additionalNotes")}
                </Text>
                <TextInput
                  value={detailedNotes}
                  onChangeText={setDetailedNotes}
                  placeholder={t("walkFeedback.notesPlaceholder")}
                  placeholderTextColor={C.mutedBrown + "80"}
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    textAlignVertical: "top",
                    minHeight: 80,
                  }}
                />
              </View>

              {/* Info Box */}
              {(limping || unusualBehavior) && (
                <View
                  style={{
                    backgroundColor: C.honey + "15",
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: C.honey + "30",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.warmBrown,
                      lineHeight: 18,
                      textAlign: "center",
                    }}
                  >
                    {t("walkFeedback.monitorHint")}
                  </Text>
                </View>
              )}

              {/* Submit */}
              <View style={{ gap: 12 }}>
                <TouchableOpacity
                  onPress={handleDetailedSubmit}
                  disabled={logWalkMutation.isPending}
                  style={{
                    backgroundColor: logWalkMutation.isPending
                      ? C.mutedBrown
                      : C.coral,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    shadowColor: C.coral,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 4,
                    opacity: logWalkMutation.isPending ? 0.6 : 1,
                  }}
                >
                  {logWalkMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "#FFF",
                      }}
                    >
                      {t("walkFeedback.save")}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setStep("choice")}
                  style={{ alignItems: "center", paddingVertical: 8 }}
                >
                  <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                    ← {t("common.back")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Loading State */}
          {step === "choice" && logWalkMutation.isPending && (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <ActivityIndicator size="large" color={C.sage} />
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: C.mutedBrown,
                  marginTop: 16,
                }}
              >
                {t("walkFeedback.saving")}
              </Text>
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
