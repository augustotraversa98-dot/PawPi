import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { X, Check, AlertCircle, AlertTriangle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

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

export default function PeeTrackerModal({ visible, onClose }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: currentPet } = useCurrentPet();
  const queryClient = useQueryClient();

  const [step, setStep] = useState("quickChoice"); // quickChoice, detailedForm, confirmation
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningIsUrgent, setWarningIsUrgent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [volume, setVolume] = useState("normal");
  const [color, setColor] = useState("yellow");
  const [accident, setAccident] = useState(false);
  const [difficulty, setDifficulty] = useState(false);
  const [pain, setPain] = useState(false);
  const [blood, setBlood] = useState(false);
  const [increasedThirst, setIncreasedThirst] = useState(false);
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setStep("quickChoice");
    setShowConfirmation(false);
    setShowWarning(false);
    setWarningIsUrgent(false);
    setIsSaving(false);
    setVolume("normal");
    setColor("yellow");
    setAccident(false);
    setDifficulty(false);
    setPain(false);
    setBlood(false);
    setIncreasedThirst(false);
    setNotes("");
  };

  const savePeeLog = async (logData) => {
    if (!currentPet?.id) {
      console.error("[PeeTracker] No current pet found");
      alert(t("trackers.pee.couldNotSaveNoPet"));
      return false;
    }

    try {
      setIsSaving(true);

      console.log("[PeeTracker] Saving pee log:", {
        petId: currentPet.id,
        petName: currentPet.name,
        payload: logData,
      });

      const response = await fetch("/api/health/pee-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          frequency: logData.frequency || "normal",
          volume: logData.volume,
          color: logData.color,
          accidentInHouse: logData.accident || false,
          difficultyPeeing: logData.difficulty || false,
          painOrCrying: logData.pain || false,
          bloodVisible: logData.blood || false,
          increasedThirst: logData.increasedThirst || false,
          notes: logData.notes || "",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[PeeTracker] Save failed:", errorData);
        throw new Error(errorData.error || "Failed to save pee log");
      }

      const result = await response.json();
      console.log("[PeeTracker] Pee log saved successfully:", result);

      // Refetch timeline and pee logs
      await queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      await queryClient.invalidateQueries({ queryKey: ["health", "pee-logs"] });

      return true;
    } catch (error) {
      console.error("[PeeTracker] Error saving pee log:", error);
      alert(t("trackers.pee.couldNotSave"));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const checkForConcerns = (logData) => {
    const hasConcerns =
      logData.difficulty ||
      logData.pain ||
      logData.blood ||
      logData.color === "red/pink";
    const isUrgent = logData.difficulty || logData.pain;
    return { hasConcerns, isUrgent };
  };

  const handleQuickLog = async () => {
    const success = await savePeeLog({
      frequency: "normal",
      volume: "normal",
      color: "yellow",
      accident: false,
      difficulty: false,
      pain: false,
      blood: false,
      increasedThirst: false,
      notes: "",
    });

    if (success) {
      setShowConfirmation(true);
      setTimeout(() => {
        resetForm();
        onClose();
      }, 1500);
    }
  };

  const handleDetailedSubmit = async () => {
    const logData = {
      volume,
      color,
      accident,
      difficulty,
      pain,
      blood,
      increasedThirst,
      notes,
    };

    const { hasConcerns, isUrgent } = checkForConcerns(logData);

    const success = await savePeeLog(logData);

    if (success) {
      if (hasConcerns) {
        setWarningIsUrgent(isUrgent);
        setShowWarning(true);
      } else {
        setShowConfirmation(true);
        setTimeout(() => {
          resetForm();
          onClose();
        }, 1500);
      }
    }
  };

  const handleWarningAcknowledge = () => {
    setShowConfirmation(true);
    setShowWarning(false);
    setTimeout(() => {
      resetForm();
      onClose();
    }, 1500);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
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
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
            >
              {t("trackers.pee.title")}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
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

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Loading State */}
            {isSaving && (
              <View style={{ alignItems: "center", paddingVertical: 60 }}>
                <ActivityIndicator size="large" color={C.coral} />
                <Text
                  style={{
                    fontSize: 14,
                    color: C.mutedBrown,
                    marginTop: 16,
                  }}
                >
                  {t("trackers.pee.saving")}
                </Text>
              </View>
            )}

            {/* Confirmation Screen */}
            {showConfirmation && (
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
                  {t("trackers.pee.logged")}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: C.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  {t("trackers.pee.confirmedBody")}
                </Text>
              </View>
            )}

            {/* Warning Screen */}
            {showWarning && (
              <View style={{ paddingVertical: 40 }}>
                <View
                  style={{
                    alignItems: "center",
                    marginBottom: 24,
                  }}
                >
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: warningIsUrgent
                        ? "#FF573320"
                        : "#FFB74D20",
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: 20,
                    }}
                  >
                    {warningIsUrgent ? (
                      <AlertTriangle size={40} color="#FF5733" />
                    ) : (
                      <AlertCircle size={40} color="#FFB74D" />
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 8,
                      textAlign: "center",
                    }}
                  >
                    {warningIsUrgent
                      ? t("trackers.pee.worthVetAttention")
                      : t("trackers.pee.worthNoting")}
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: warningIsUrgent ? "#FFF0F0" : "#FFF4E6",
                    borderRadius: 18,
                    padding: 20,
                    borderWidth: 1.5,
                    borderColor: warningIsUrgent ? "#FFCCCC" : "#FFE4C4",
                    marginBottom: 24,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: C.warmBrown,
                      lineHeight: 21,
                      textAlign: "center",
                    }}
                  >
                    {t("trackers.pee.warningBody")}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleWarningAcknowledge}
                  style={{
                    backgroundColor: warningIsUrgent ? "#FF5733" : C.coral,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    shadowColor: warningIsUrgent ? "#FF5733" : C.coral,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                  <Text
                    style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}
                  >
                    {t("trackers.pee.gotItThanks")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 1: Quick Choice */}
            {!showConfirmation && !showWarning && step === "quickChoice" && (
              <View style={{ gap: 16 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 4,
                  }}
                >
                  {t("trackers.pee.quickPrompt")}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: C.mutedBrown,
                    marginBottom: 12,
                  }}
                >
                  {t("trackers.pee.quickHint")}
                </Text>

                <TouchableOpacity
                  onPress={handleQuickLog}
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
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: "#FFF",
                      marginBottom: 6,
                    }}
                  >
                    {t("trackers.pee.sameAsUsual")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#FFF",
                      opacity: 0.9,
                      textAlign: "center",
                    }}
                  >
                    {t("trackers.pee.sameAsUsualDesc")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setStep("detailedForm")}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 18,
                    padding: 20,
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {t("trackers.pee.somethingChanged")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: C.mutedBrown,
                      textAlign: "center",
                    }}
                  >
                    {t("trackers.pee.somethingChangedDesc")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 2: Detailed Form */}
            {!showConfirmation && !showWarning && step === "detailedForm" && (
              <View style={{ gap: 20 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: -8,
                  }}
                >
                  {t("trackers.pee.details")}
                </Text>

                {/* Volume */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.pee.volume")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["small", "normal", "large"].map((v) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setVolume(v)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: volume === v ? C.sage : C.sand,
                          borderWidth: 1.5,
                          borderColor: volume === v ? C.sage : C.peach,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: volume === v ? "700" : "600",
                            color: volume === v ? "#FFF" : C.warmBrown,
                            textTransform: "capitalize",
                          }}
                        >
                          {v}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Color */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.pee.colorLabel")}
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {["pale", "yellow", "dark", "red/pink", "other"].map(
                      (c) => (
                        <TouchableOpacity
                          key={c}
                          onPress={() => setColor(c)}
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 16,
                            borderRadius: 12,
                            backgroundColor: color === c ? C.sage : C.sand,
                            borderWidth: 1.5,
                            borderColor: color === c ? C.sage : C.peach,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: color === c ? "700" : "600",
                              color: color === c ? "#FFF" : C.warmBrown,
                              textTransform: "capitalize",
                            }}
                          >
                            {c}
                          </Text>
                        </TouchableOpacity>
                      ),
                    )}
                  </View>
                </View>

                {/* Accident in house */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.pee.accidentLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setAccident(false)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: !accident ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: !accident ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: !accident ? "700" : "600",
                          color: !accident ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.noLabel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setAccident(true)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: accident ? "#FFB74D" : C.sand,
                        borderWidth: 1.5,
                        borderColor: accident ? "#FFB74D" : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: accident ? "700" : "600",
                          color: accident ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.yesLabel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Difficulty peeing */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.pee.difficultyLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setDifficulty(false)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: !difficulty ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: !difficulty ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: !difficulty ? "700" : "600",
                          color: !difficulty ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.noLabel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDifficulty(true)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: difficulty ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: difficulty ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: difficulty ? "700" : "600",
                          color: difficulty ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.yesLabel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Pain or crying */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.pee.painLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setPain(false)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: !pain ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: !pain ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: !pain ? "700" : "600",
                          color: !pain ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.noLabel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPain(true)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: pain ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: pain ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: pain ? "700" : "600",
                          color: pain ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.yesLabel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Blood visible */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.pee.bloodLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setBlood(false)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: !blood ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: !blood ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: !blood ? "700" : "600",
                          color: !blood ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.noLabel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setBlood(true)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: blood ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: blood ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: blood ? "700" : "600",
                          color: blood ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.yesLabel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Increased thirst */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.pee.increasedThirstLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setIncreasedThirst(false)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: !increasedThirst ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: !increasedThirst ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: !increasedThirst ? "700" : "600",
                          color: !increasedThirst ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.noLabel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setIncreasedThirst(true)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: increasedThirst ? "#64B5F6" : C.sand,
                        borderWidth: 1.5,
                        borderColor: increasedThirst ? "#64B5F6" : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: increasedThirst ? "700" : "600",
                          color: increasedThirst ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.yesLabel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
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
                    {t("trackers.pee.notesLabel")}
                  </Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={t("trackers.anythingDifferentPlaceholder")}
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
                      minHeight: 80,
                      textAlignVertical: "top",
                    }}
                  />
                </View>

                {/* Submit */}
                <TouchableOpacity
                  onPress={handleDetailedSubmit}
                  style={{
                    backgroundColor: C.coral,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    marginTop: 8,
                    shadowColor: C.coral,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                  <Text
                    style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}
                  >
                    {t("trackers.pee.submit")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setStep("quickChoice")}
                  style={{ alignItems: "center", paddingVertical: 8 }}
                >
                  <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                    {t("trackers.pee.back")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
