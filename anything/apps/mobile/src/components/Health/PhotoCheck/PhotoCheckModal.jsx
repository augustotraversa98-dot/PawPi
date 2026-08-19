import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
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

const BODY_AREAS = [
  {
    id: "paws",
    label: "Paws",
    prompt: "Any redness, swelling, cuts, limping, or excessive licking?",
    color: "#FFB74D",
  },
  {
    id: "ears",
    label: "Ears",
    prompt: "Any smell, discharge, redness, scratching, or head shaking?",
    color: "#9575CD",
  },
  {
    id: "eyes",
    label: "Eyes",
    prompt: "Any redness, cloudiness, discharge, or squinting?",
    color: "#64B5F6",
  },
  {
    id: "teeth",
    label: "Teeth",
    prompt: "Any tartar, bad breath, gum redness, or broken teeth?",
    color: "#4DB6AC",
  },
  {
    id: "skin_fur",
    label: "Skin / Fur",
    prompt: "Any redness, hair loss, wounds, bumps, fleas, ticks, or itching?",
    color: "#FF8A65",
  },
  {
    id: "face",
    label: "Face",
    prompt: "Any swelling, wounds, discharge, or asymmetry?",
    color: C.coral,
  },
  {
    id: "full_body",
    label: "Full body",
    prompt:
      "Useful for tracking body shape, posture, coat, and visible changes.",
    color: C.sage,
  },
  {
    id: "other",
    label: "Other",
    prompt: "Any other visible changes you want to track?",
    color: C.terracotta,
  },
];

export default function PhotoCheckModal({ visible, onClose, onSave }) {
  const { t } = useTranslation();
  const [step, setStep] = useState("select"); // 'select', 'capture', 'preview'
  const [selectedArea, setSelectedArea] = useState(null);
  const [imageUri, setImageUri] = useState(null);
  const [notes, setNotes] = useState("");

  const handleAreaSelect = (area) => {
    setSelectedArea(area);
    setStep("capture");
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      alert("Camera permission is required to take photos");
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
      alert("Photo library permission is required");
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
            <TouchableOpacity onPress={handleBack}>
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
            {step === "select" && "Photo Check"}
            {step === "capture" && selectedArea?.label}
            {step === "preview" && "Review Photo"}
          </Text>
          <TouchableOpacity onPress={handleClose}>
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
                What do you want to photograph?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: C.mutedBrown,
                  marginBottom: 20,
                  lineHeight: 20,
                }}
              >
                Select a body area to track visible changes over time
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
                        {area.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: C.mutedBrown,
                          lineHeight: 17,
                        }}
                      >
                        {area.prompt}
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
                  Photo Check helps you track visible changes over time. It does
                  not diagnose or replace veterinary care.
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
                  {selectedArea?.prompt}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: C.mutedBrown,
                    lineHeight: 18,
                  }}
                >
                  Try to use similar lighting and angle each time.{"\n"}
                  Photos can help you and your vet compare visible changes over
                  time.
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
                  Take Photo
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
                  Choose from Gallery
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
                Optional notes
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
                  Save Photo Check
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
                  This photo will be saved to your Photo History and can be
                  included in future Vet Summaries.
                </Text>
              </View>
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
