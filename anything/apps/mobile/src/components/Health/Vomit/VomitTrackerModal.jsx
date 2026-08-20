import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import {
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  Camera,
  Trash2,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useQueryClient } from "@tanstack/react-query";
import useUpload from "@/utils/useUpload";
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

export default function VomitTrackerModal({ visible, onClose }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [upload, { loading: uploading }] = useUpload();
  const { data: currentPet } = useCurrentPet();
  const queryClient = useQueryClient();

  const [step, setStep] = useState("quickChoice"); // quickChoice, detailedForm, confirmation
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningIsUrgent, setWarningIsUrgent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [episodes, setEpisodes] = useState(1);
  const [appearance, setAppearance] = useState("foam");
  const [relationToFood, setRelationToFood] = useState("unknown");
  const [appetiteAfter, setAppetiteAfter] = useState("normal");
  const [energy, setEnergy] = useState("normal");
  const [diarrheaPresent, setDiarrheaPresent] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setStep("quickChoice");
    setShowConfirmation(false);
    setShowWarning(false);
    setWarningIsUrgent(false);
    setIsSaving(false);
    setEpisodes(1);
    setAppearance("foam");
    setRelationToFood("unknown");
    setAppetiteAfter("normal");
    setEnergy("normal");
    setDiarrheaPresent(false);
    setPhotoUrl(null);
    setNotes("");
  };

  const checkForConcerns = (logData) => {
    const hasUrgentConcerns =
      logData.appearance === "blood" ||
      logData.energy === "very low" ||
      logData.appetiteAfter === "refused food" ||
      logData.episodes >= 3;

    const hasConcerns =
      hasUrgentConcerns ||
      logData.energy === "low" ||
      logData.diarrheaPresent ||
      logData.episodes >= 2;

    return { hasUrgentConcerns, hasConcerns };
  };

  const saveVomitLog = async (logData) => {
    if (!currentPet?.id) {
      console.error("[VomitTracker] No current pet found");
      alert(t("trackers.vomit.couldNotSaveNoPet"));
      return false;
    }

    try {
      setIsSaving(true);

      console.log("[VomitTracker] Saving vomit log:", {
        petId: currentPet.id,
        petName: currentPet.name,
        payload: logData,
      });

      const response = await fetch("/api/health/vomit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          numberOfEpisodes: logData.episodes || 1,
          appearance: logData.appearance,
          relationToFood: logData.relationToFood,
          appetiteAfter: logData.appetiteAfter,
          energy: logData.energy,
          diarrheaPresent: logData.diarrheaPresent || false,
          photoUrl: logData.photoUrl || null,
          notes: logData.notes || "",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[VomitTracker] Save failed:", errorData);
        throw new Error(errorData.error || "Failed to save vomit log");
      }

      const result = await response.json();
      console.log("[VomitTracker] Vomit log saved successfully:", result);

      // Refetch timeline and vomit logs
      await queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      await queryClient.invalidateQueries({
        queryKey: ["health", "vomit-logs"],
      });

      return true;
    } catch (error) {
      console.error("[VomitTracker] Error saving vomit log:", error);
      alert(t("trackers.vomit.couldNotSave"));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickLog = async () => {
    const success = await saveVomitLog({
      episodes: 1,
      appearance: "foam",
      relationToFood: "unknown",
      appetiteAfter: "normal",
      energy: "normal",
      diarrheaPresent: false,
      photoUrl: null,
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

  // Pick from camera or gallery, then upload via the same native-safe path as
  // the avatar flow. Photo is optional — a failure here never blocks saving.
  const pickAndUpload = async (fromCamera) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert(
          fromCamera
            ? t("trackers.vomit.cameraPermRequired")
            : t("trackers.vomit.libraryPermRequired"),
        );
        return;
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.8,
          });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const uploadResult = await upload({
        reactNativeAsset: {
          uri: result.assets[0].uri,
          name: `vomit_${Date.now()}.jpg`,
          mimeType: "image/jpeg",
        },
      });

      if (uploadResult.error) {
        alert(t("trackers.vomit.photoUploadFailed"));
        return;
      }

      setPhotoUrl(uploadResult.url);
      console.log("[VomitTracker] Photo uploaded:", uploadResult.url);
    } catch (error) {
      console.error("[VomitTracker] Photo upload failed:", error);
      alert(t("trackers.vomit.photoUploadFailed"));
    }
  };

  const handlePhotoUpload = () => {
    Alert.alert(t("trackers.photo.addTitle"), t("trackers.photo.chooseSource"), [
      { text: t("trackers.photo.takePhoto"), onPress: () => pickAndUpload(true) },
      { text: t("trackers.photo.chooseLibrary"), onPress: () => pickAndUpload(false) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  const handleRemovePhoto = () => {
    setPhotoUrl(null);
  };

  const handleDetailedSubmit = async () => {
    const logData = {
      episodes,
      appearance,
      relationToFood,
      appetiteAfter,
      energy,
      diarrheaPresent,
      photoUrl,
      notes,
    };

    const { hasUrgentConcerns, hasConcerns } = checkForConcerns(logData);

    const success = await saveVomitLog(logData);

    if (success) {
      if (hasUrgentConcerns || hasConcerns) {
        setWarningIsUrgent(hasUrgentConcerns);
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
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
            {t("trackers.vomit.title")}
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

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 20,
          }}
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
                {t("trackers.vomit.saving")}
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
                {t("trackers.vomit.logged")}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: C.mutedBrown,
                  textAlign: "center",
                }}
              >
                {t("trackers.vomit.confirmedBody")}
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
                    ? t("trackers.vomit.needsVetAttention")
                    : t("trackers.vomit.worthMonitoring")}
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
                  {t("trackers.vomit.warningBody")}
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
                  {t("trackers.vomit.gotItThanks")}
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
                {t("trackers.vomit.quickPrompt")}
              </Text>
              <Text
                style={{ fontSize: 14, color: C.mutedBrown, marginBottom: 12 }}
              >
                {t("trackers.vomit.quickHint")}
              </Text>

              <TouchableOpacity
                onPress={handleQuickLog}
                style={{
                  backgroundColor: "#FFB74D",
                  borderRadius: 18,
                  padding: 20,
                  alignItems: "center",
                  shadowColor: "#FFB74D",
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
                  {t("trackers.vomit.onceCta")}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#FFF",
                    opacity: 0.9,
                    textAlign: "center",
                  }}
                >
                  {t("trackers.vomit.onceDesc")}
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
                  {t("trackers.vomit.somethingChanged")}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: C.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  {t("trackers.vomit.somethingChangedDesc")}
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
                {t("trackers.vomit.details")}
              </Text>

              {/* Number of episodes */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.vomit.episodesLabel")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[1, 2, 3, "4+"].map((num) => {
                    const value = num === "4+" ? 4 : num;
                    return (
                      <TouchableOpacity
                        key={num}
                        onPress={() => setEpisodes(value)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor:
                            episodes >= value ? "#FFB74D" : C.sand,
                          borderWidth: 1.5,
                          borderColor: episodes >= value ? "#FFB74D" : C.peach,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: episodes >= value ? "700" : "600",
                            color: episodes >= value ? "#FFF" : C.warmBrown,
                          }}
                        >
                          {num}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Appearance */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.vomit.appearanceLabel")}
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {[
                    "food",
                    "foam",
                    "bile/yellow",
                    "clear liquid",
                    "blood",
                    "other",
                  ].map((a) => (
                    <TouchableOpacity
                      key={a}
                      onPress={() => setAppearance(a)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 12,
                        backgroundColor:
                          appearance === a
                            ? a === "blood"
                              ? "#FF5733"
                              : "#FFB74D"
                            : C.sand,
                        borderWidth: 1.5,
                        borderColor:
                          appearance === a
                            ? a === "blood"
                              ? "#FF5733"
                              : "#FFB74D"
                            : C.peach,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: appearance === a ? "700" : "600",
                          color: appearance === a ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {a}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Relation to food */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.vomit.relationLabel")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["before meal", "after meal", "unknown"].map((r) => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setRelationToFood(r)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor:
                          relationToFood === r ? "#FFB74D" : C.sand,
                        borderWidth: 1.5,
                        borderColor: relationToFood === r ? "#FFB74D" : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: relationToFood === r ? "700" : "600",
                          color: relationToFood === r ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Appetite after vomiting */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.vomit.appetiteLabel")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["normal", "reduced", "refused food"].map((a) => (
                    <TouchableOpacity
                      key={a}
                      onPress={() => setAppetiteAfter(a)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor:
                          appetiteAfter === a
                            ? a === "refused food"
                              ? C.coral
                              : "#FFB74D"
                            : C.sand,
                        borderWidth: 1.5,
                        borderColor:
                          appetiteAfter === a
                            ? a === "refused food"
                              ? C.coral
                              : "#FFB74D"
                            : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: appetiteAfter === a ? "700" : "600",
                          color: appetiteAfter === a ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {a}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Energy */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.vomit.energyLabel")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["normal", "low", "very low"].map((e) => (
                    <TouchableOpacity
                      key={e}
                      onPress={() => setEnergy(e)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor:
                          energy === e
                            ? e === "very low"
                              ? "#FF5733"
                              : e === "low"
                                ? "#FFB74D"
                                : C.sage
                            : C.sand,
                        borderWidth: 1.5,
                        borderColor:
                          energy === e
                            ? e === "very low"
                              ? "#FF5733"
                              : e === "low"
                                ? "#FFB74D"
                                : C.sage
                            : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: energy === e ? "700" : "600",
                          color: energy === e ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {e}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Diarrhea also present */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.vomit.diarrheaLabel")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setDiarrheaPresent(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: !diarrheaPresent ? C.sage : C.sand,
                      borderWidth: 1.5,
                      borderColor: !diarrheaPresent ? C.sage : C.peach,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: !diarrheaPresent ? "700" : "600",
                        color: !diarrheaPresent ? "#FFF" : C.warmBrown,
                      }}
                    >
                      {t("trackers.shared.noLabel")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDiarrheaPresent(true)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: diarrheaPresent ? C.coral : C.sand,
                      borderWidth: 1.5,
                      borderColor: diarrheaPresent ? C.coral : C.peach,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: diarrheaPresent ? "700" : "600",
                        color: diarrheaPresent ? "#FFF" : C.warmBrown,
                      }}
                    >
                      {t("trackers.shared.yesLabel")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Photo upload */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  {t("trackers.vomit.photoLabel")}
                </Text>
                {photoUrl ? (
                  <View style={{ position: "relative" }}>
                    <Image
                      source={{ uri: photoUrl }}
                      style={{
                        width: "100%",
                        height: 200,
                        borderRadius: 12,
                        backgroundColor: C.sand,
                      }}
                      resizeMode="cover"
                    />
                    <TouchableOpacity
                      onPress={handleRemovePhoto}
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        backgroundColor: C.coral,
                        borderRadius: 20,
                        width: 36,
                        height: 36,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Trash2 size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handlePhotoUpload}
                    disabled={uploading}
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 20,
                      alignItems: "center",
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                      borderColor: C.peach,
                    }}
                  >
                    <Camera size={32} color={C.mutedBrown} />
                    <Text
                      style={{
                        fontSize: 14,
                        color: C.mutedBrown,
                        marginTop: 8,
                      }}
                    >
                      {uploading ? t("trackers.vomit.uploadingPhoto") : t("trackers.vomit.addPhoto")}
                    </Text>
                  </TouchableOpacity>
                )}
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
                  {t("trackers.vomit.notesLabel")}
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={t("trackers.vomit.notesPlaceholder")}
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
                  {t("trackers.vomit.submit")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("quickChoice")}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                  {t("trackers.vomit.back")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
