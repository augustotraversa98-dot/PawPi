import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import {
  X,
  Camera,
  Image as ImageIcon,
  Check,
  Info,
  AlertCircle,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import useUpload from "@/utils/useUpload";
import { useCurrentPet } from "@/hooks/usePetProfile";

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

// Body area configurations with observation chips
const BODY_AREA_OBSERVATIONS = {
  eyes: [
    "No visible change",
    "Redness",
    "Discharge",
    "Cloudy",
    "Squinting",
    "Other",
  ],
  ears: [
    "No visible change",
    "Redness",
    "Smell",
    "Discharge",
    "Scratching",
    "Other",
  ],
  paws: [
    "No visible change",
    "Redness",
    "Swelling",
    "Limping",
    "Cracked pads",
    "Other",
  ],
  teeth: [
    "No visible change",
    "Bad breath",
    "Red gums",
    "Tartar",
    "Bleeding",
    "Other",
  ],
  skin_fur: [
    "No visible change",
    "Redness",
    "Rash",
    "Dry skin",
    "Hair loss",
    "Other",
  ],
  face: [
    "No visible change",
    "Redness",
    "Swelling",
    "Discharge",
    "Sensitivity",
    "Other",
  ],
  full_body: [
    "No visible change",
    "Redness",
    "Swelling",
    "Lumps",
    "Sensitivity",
    "Other",
  ],
  other: [
    "No visible change",
    "Redness",
    "Swelling",
    "Discharge",
    "Sensitivity",
    "Other",
  ],
};

const BODY_AREA_LABELS = {
  eyes: "Eyes",
  ears: "Ears",
  paws: "Paws",
  teeth: "Teeth",
  skin_fur: "Skin / Fur",
  face: "Face",
  full_body: "Full Body",
  other: "Other",
};

export default function PhotoCheckCaptureModal({
  visible,
  onClose,
  bodyArea,
  reminderId,
  onComplete,
}) {
  const { data: currentPet } = useCurrentPet();
  const [upload, { loading: uploading }] = useUpload();

  const [step, setStep] = useState("capture"); // 'capture', 'notes', 'skipConfirm'
  const [imageUri, setImageUri] = useState(null);
  const [notes, setNotes] = useState("");
  const [selectedObservations, setSelectedObservations] = useState([]);
  const [saving, setSaving] = useState(false);

  const bodyAreaLabel = BODY_AREA_LABELS[bodyArea] || "Body Area";
  const observations = BODY_AREA_OBSERVATIONS[bodyArea] || [];

  const handleClose = () => {
    setStep("capture");
    setImageUri(null);
    setNotes("");
    setSelectedObservations([]);
    onClose();
  };

  const handleTakePhoto = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert(
          "Camera Permission Required",
          "Photo access is needed to add a photo. You can still save a note.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
        setStep("notes");
      }
    } catch (error) {
      console.error("[PhotoCheckCapture] Camera error:", error);
      Alert.alert("Error", "Could not open camera. Please try again.");
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert(
          "Photo Library Permission Required",
          "Photo access is needed to add a photo. You can still save a note.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
        setStep("notes");
      }
    } catch (error) {
      console.error("[PhotoCheckCapture] Gallery error:", error);
      Alert.alert("Error", "Could not open gallery. Please try again.");
    }
  };

  const handleSkipPhoto = () => {
    setStep("skipConfirm");
  };

  const handleSkipConfirmed = () => {
    setStep("notes");
  };

  const toggleObservation = (observation) => {
    if (selectedObservations.includes(observation)) {
      setSelectedObservations(
        selectedObservations.filter((o) => o !== observation),
      );
    } else {
      setSelectedObservations([...selectedObservations, observation]);
    }
  };

  const handleSave = async () => {
    if (!currentPet?.id) {
      Alert.alert("Error", "No pet selected");
      return;
    }

    setSaving(true);

    try {
      let uploadedImageUrl = null;

      // Upload photo if provided
      if (imageUri) {
        console.log("[PhotoCheckCapture] Uploading photo...");
        const uploadResult = await upload({
          reactNativeAsset: {
            uri: imageUri,
            name: `photo_check_${bodyArea}_${Date.now()}.jpg`,
            mimeType: "image/jpeg",
          },
        });

        if (uploadResult.error) {
          throw new Error(uploadResult.error);
        }

        uploadedImageUrl = uploadResult.url;
        console.log("[PhotoCheckCapture] Photo uploaded:", uploadedImageUrl);
      }

      // Combine notes and observations
      const combinedNotes = [...selectedObservations, notes.trim()]
        .filter(Boolean)
        .join("; ");

      // Save to database
      console.log("[PhotoCheckCapture] Saving photo check...");
      const response = await fetch("/api/health/photo-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          bodyArea,
          imageUrl: uploadedImageUrl || "",
          notes: combinedNotes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save photo check");
      }

      console.log("[PhotoCheckCapture] Photo check saved successfully");

      // Mark reminder as complete
      if (reminderId && onComplete) {
        onComplete(reminderId);
      }

      // Success feedback
      Alert.alert("✅ Saved", "Photo check saved successfully");

      // Close modal
      handleClose();
    } catch (error) {
      console.error("[PhotoCheckCapture] Save error:", error);
      Alert.alert(
        "Error",
        error.message || "Could not save photo check. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.cream }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: 60,
            paddingHorizontal: 20,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
            backgroundColor: C.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
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
              {bodyAreaLabel} Photo Check
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown }}>
              {step === "capture" &&
                "Take a photo to compare changes over time"}
              {step === "notes" && "Add notes and observations"}
              {step === "skipConfirm" && "Skip photo?"}
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

        {/* Capture Step */}
        {step === "capture" && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20 }}
          >
            {/* Safety Info */}
            <View
              style={{
                backgroundColor: C.sand,
                borderRadius: 16,
                padding: 16,
                marginBottom: 24,
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

            {/* Tip */}
            <View
              style={{
                backgroundColor: "#4DB8E8" + "15",
                borderRadius: 16,
                padding: 16,
                marginBottom: 24,
                borderWidth: 1,
                borderColor: "#4DB8E8" + "40",
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
                💡 Photo tip
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: C.mutedBrown,
                  lineHeight: 18,
                }}
              >
                Try to use similar lighting and angle each time. Photos help you
                and your vet compare visible changes over time.
              </Text>
            </View>

            {/* Primary: Take Photo */}
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

            {/* Secondary: Choose from Gallery */}
            <TouchableOpacity
              onPress={handleChooseFromGallery}
              style={{
                backgroundColor: C.card,
                borderRadius: 18,
                padding: 20,
                marginBottom: 24,
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

            {/* Skip Photo Link */}
            <View
              style={{
                backgroundColor: C.sand,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: C.mutedBrown,
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                Photo recommended for better comparison over time
              </Text>
              <TouchableOpacity
                onPress={handleSkipPhoto}
                style={{
                  paddingVertical: 8,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.terracotta,
                    textDecorationLine: "underline",
                  }}
                >
                  Skip photo
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* Skip Confirm Step */}
        {step === "skipConfirm" && (
          <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
            <View style={{ alignItems: "center", marginBottom: 32 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: "#FEF3C7",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <AlertCircle size={40} color="#F59E0B" />
              </View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: C.warmBrown,
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                Save without photo?
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: C.mutedBrown,
                  textAlign: "center",
                  lineHeight: 22,
                }}
              >
                Photos make it easier to compare changes over time. You can
                still save a note if needed.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setStep("capture")}
              style={{
                backgroundColor: C.coral,
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                Add Photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSkipConfirmed}
              style={{
                backgroundColor: C.sand,
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: C.peach,
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: C.terracotta }}
              >
                Save Note Only
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Notes Step */}
        {step === "notes" && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Photo Preview (if photo was taken) */}
            {imageUri && (
              <View style={{ marginBottom: 24 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 12,
                  }}
                >
                  Photo Preview
                </Text>
                <View
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 20,
                    padding: 12,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                >
                  <Image
                    source={{ uri: imageUri }}
                    style={{
                      width: "100%",
                      height: 200,
                      borderRadius: 14,
                    }}
                    resizeMode="cover"
                  />
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setImageUri(null);
                    setStep("capture");
                  }}
                  style={{
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.terracotta,
                      textDecorationLine: "underline",
                    }}
                  >
                    Change photo
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Observation Chips */}
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Anything changed?
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {observations.map((obs) => {
                const isSelected = selectedObservations.includes(obs);
                return (
                  <TouchableOpacity
                    key={obs}
                    onPress={() => toggleObservation(obs)}
                    style={{
                      backgroundColor: isSelected ? "#4DB8E8" : C.card,
                      borderRadius: 20,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderWidth: 1.5,
                      borderColor: isSelected ? "#4DB8E8" : C.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected ? "700" : "600",
                        color: isSelected ? "#FFF" : C.warmBrown,
                      }}
                    >
                      {obs}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Notes Text Input */}
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Notes (optional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Redness, swelling, discharge, smell, sensitivity, no change…"
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

            {/* Info */}
            <View
              style={{
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
                This photo check will be saved to your Photo History and can be
                included in future Vet Summaries.
              </Text>
            </View>
          </ScrollView>
        )}

        {/* Save Button (only in notes step) */}
        {step === "notes" && (
          <View
            style={{
              padding: 20,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: C.peach,
              backgroundColor: C.cream,
            }}
          >
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || uploading}
              style={{
                backgroundColor: C.coral,
                borderRadius: 16,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                shadowColor: C.coral,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 4,
                opacity: saving || uploading ? 0.6 : 1,
              }}
            >
              {saving || uploading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Check size={20} color="#FFF" />
              )}
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: "#FFF",
                }}
              >
                {uploading
                  ? "Uploading..."
                  : saving
                    ? "Saving..."
                    : "Save Photo Check"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
