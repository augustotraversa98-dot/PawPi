import React, { useState } from "react";
import { COLORS } from "@/constants/theme";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  Alert,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import {
  Camera,
  Image as ImageIcon,
  X,
  Check,
  Info,
  ChevronLeft,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";

const C = {
  cream: COLORS.cream,
  card: "#FFFBF7",
  coral: COLORS.coral,
  peach: "#FFE5D9",
  terracotta: COLORS.terracotta,
  warmBrown: COLORS.warmBrown,
  mutedBrown: "#8B7355",
  sage: COLORS.sage,
  sand: "#F5EDE4",
};

const BODY_AREAS = [
  {
    id: "paws",
    labelKey: "routineCard.areas.paws",
    promptKey: "healthUi.photoAreaPrompt.paws",
    color: "#FFB74D",
  },
  {
    id: "ears",
    labelKey: "routineCard.areas.ears",
    promptKey: "healthUi.photoAreaPrompt.ears",
    color: "#9575CD",
  },
  {
    id: "eyes",
    labelKey: "routineCard.areas.eyes",
    promptKey: "healthUi.photoAreaPrompt.eyes",
    color: "#64B5F6",
  },
  {
    id: "teeth",
    labelKey: "routineCard.areas.teeth",
    promptKey: "healthUi.photoAreaPrompt.teeth",
    color: "#4DB6AC",
  },
  {
    id: "skin_fur",
    labelKey: "routineCard.areas.skin_fur",
    promptKey: "healthUi.photoAreaPrompt.skin_fur",
    color: "#FF8A65",
  },
  {
    id: "face",
    labelKey: "routineCard.areas.face",
    promptKey: "healthUi.photoAreaPrompt.face",
    color: C.coral,
  },
  {
    id: "full_body",
    labelKey: "routineCard.areas.full_body",
    promptKey: "healthUi.photoAreaPrompt.full_body",
    color: C.sage,
  },
  {
    id: "other",
    labelKey: "routineCard.areas.other",
    promptKey: "healthUi.photoAreaPrompt.other",
    color: C.terracotta,
  },
];

// `onSelectArea(bodyAreaId)` — when provided, this modal acts purely as a body-area
// PICKER and hands the chosen area to the parent (which opens PhotoCheckCaptureModal,
// the real capture + private-upload + POST path). Without it, the legacy self-contained
// capture/preview flow is used. `onSave` is the legacy stub path (kept for back-compat).
export default function PhotoCheckModal({ visible, onClose, onSave, onSelectArea }) {
  const { t } = useTranslation();
  const [step, setStep] = useState("select"); // 'select', 'capture', 'preview'
  const [selectedArea, setSelectedArea] = useState(null);
  const [imageUri, setImageUri] = useState(null);
  const [notes, setNotes] = useState("");

  const handleAreaSelect = (area) => {
    if (onSelectArea) {
      // Picker mode: reset our own step for next open and hand off the area — the
      // parent swaps to PhotoCheckCaptureModal, so capture/upload/POST happens there.
      setStep("select");
      setSelectedArea(null);
      setImageUri(null);
      setNotes("");
      onSelectArea(area.id);
      return;
    }
    setSelectedArea(area);
    setStep("capture");
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(t("common.error"), t("appAlerts.cameraPermRequired"));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
      setStep("preview");
    }
  };

  const handleChooseFromGallery = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(t("common.error"), t("appAlerts.libraryPermRequired"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
      setStep("preview");
    }
  };

  const handleSave = () => {
    if (onSave && selectedArea && imageUri) {
      onSave({
        bodyArea: selectedArea.id,
        imageUrl: imageUri,
        notes: notes,
        createdAt: new Date().toISOString(),
      });
      // Reset state
      setStep("select");
      setSelectedArea(null);
      setImageUri(null);
      setNotes("");
      onClose();
    }
  };

  const handleBack = () => {
    if (step === "preview") {
      setStep("capture");
      setImageUri(null);
    } else if (step === "capture") {
      setStep("select");
      setSelectedArea(null);
    }
  };

  const handleClose = () => {
    setStep("select");
    setSelectedArea(null);
    setImageUri(null);
    setNotes("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: C.cream }}>
        {/* Header */}
        <View
          style={{
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
            backgroundColor: C.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {step !== "select" ? (
            <TouchableOpacity accessibilityLabel={t("common.back")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={handleBack}>
              <ChevronLeft size={24} color={C.warmBrown} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: C.warmBrown,
            }}
          >
            {step === "select" && t("healthUi.photoCheckModal.title")}
            {step === "capture" && selectedArea ? t(selectedArea.labelKey) : null}
            {step === "preview" && t("healthUi.photoCheckModal.reviewPhoto")}
          </Text>
          <TouchableOpacity accessibilityLabel={t("common.close")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={handleClose}>
            <X size={24} color={C.warmBrown} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <KeyboardAwareScrollView style={{ flex: 1 }}>
          {step === "select" && (
            <View style={{ padding: 16 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: C.warmBrown,
                  marginBottom: 8,
                }}
              >
                {t("healthUi.photoCheckModal.whatDoYouWantTo")}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: C.mutedBrown,
                  marginBottom: 20,
                  lineHeight: 20,
                }}
              >
                {t("healthUi.photoCheckModal.selectABodyAreaTo")}
              </Text>

              {/* Body Area Grid */}
              <View style={{ gap: 12 }}>
                {BODY_AREAS.map((area) => (
                  <TouchableOpacity
                    key={area.id}
                    onPress={() => handleAreaSelect(area)}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 18,
                      padding: 18,
                      borderWidth: 1.5,
                      borderColor: C.peach,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 25,
                        backgroundColor: area.color + "20",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Camera size={22} color={area.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: C.warmBrown,
                          marginBottom: 3,
                        }}
                      >
                        {t(area.labelKey)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: C.mutedBrown,
                          lineHeight: 17,
                        }}
                      >
                        {t(area.promptKey)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Safety Info */}
              <View
                style={{
                  marginTop: 20,
                  backgroundColor: C.sand,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: C.peach,
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <Info size={16} color={C.mutedBrown} style={{ marginTop: 2 }} />
                <Text
                  style={{
                    fontSize: 12,
                    color: C.mutedBrown,
                    lineHeight: 18,
                    flex: 1,
                  }}
                >
                  {t("healthUi.photoCheckModal.photoCheckHelpsYouTrack")}
                </Text>
              </View>
            </View>
          )}

          {step === "capture" && (
            <View style={{ padding: 16 }}>
              <View
                style={{
                  backgroundColor: C.sand,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 24,
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
                  {selectedArea ? t(selectedArea.promptKey) : null}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: C.mutedBrown,
                    lineHeight: 18,
                  }}
                >
                  {t("healthUi.photoCheckModal.tip")}
                </Text>
              </View>

              {/* Photo Options */}
              <TouchableOpacity
                onPress={handleTakePhoto}
                style={{
                  backgroundColor: C.coral,
                  borderRadius: 18,
                  padding: 20,
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  shadowColor: C.coral,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <View
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: "rgba(255,255,255,0.3)",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Camera size={24} color="#FFF" />
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "800",
                    color: "#FFF",
                  }}
                >
                  {t("healthUi.photoCheckModal.takePhoto")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChooseFromGallery}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <View
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: C.sage + "20",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <ImageIcon size={24} color={C.sage} />
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: C.warmBrown,
                  }}
                >
                  {t("healthUi.photoCheckModal.chooseFromGallery")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === "preview" && imageUri && (
            <View style={{ padding: 16 }}>
              {/* Photo Preview */}
              <View
                style={{
                  backgroundColor: C.card,
                  borderRadius: 20,
                  padding: 12,
                  marginBottom: 20,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={{
                    width: "100%",
                    height: 300,
                    borderRadius: 14,
                  }}
                  resizeMode="cover"
                />
              </View>

              {/* Notes */}
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 10,
                }}
              >
                {t("healthUi.photoCheckModal.optionalNotes")}
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={t("health.photoCheck.notesModalPlaceholder")}
                placeholderTextColor={C.mutedBrown}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                  fontSize: 14,
                  color: C.warmBrown,
                  minHeight: 100,
                  textAlignVertical: "top",
                  marginBottom: 20,
                }}
              />

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSave}
                style={{
                  backgroundColor: C.coral,
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  shadowColor: C.coral,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <Check size={20} color="#FFF" />
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "800",
                    color: "#FFF",
                  }}
                >
                  {t("healthUi.photoCheckModal.savePhotoCheck")}
                </Text>
              </TouchableOpacity>

              {/* Info */}
              <View
                style={{
                  marginTop: 16,
                  backgroundColor: C.sand,
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: C.peach,
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <Info size={16} color={C.mutedBrown} style={{ marginTop: 2 }} />
                <Text
                  style={{
                    fontSize: 12,
                    color: C.mutedBrown,
                    lineHeight: 18,
                    flex: 1,
                  }}
                >
                  {t("healthUi.photoCheckModal.thisPhotoWillBeSaved")}
                </Text>
              </View>
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
