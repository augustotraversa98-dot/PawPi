import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { X, Check, Camera } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { useCreatePet, useCurrentPet } from "@/hooks/usePetProfile";
import useUpload from "@/utils/useUpload";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";
import DateField from "@/components/DateField";

const EMPTY = {
  photo: null,
  name: "",
  breed: "",
  gender: "",
  weight: "",
  weightUnit: "lbs",
  birthday: "",
  notes: "",
};

// Lightweight "add a dog" form. Creates ONE pets row for the current owner via
// POST /api/pets (owner_user_id resolved server-side), makes the new dog active
// via setCurrentPet, then closes. Does NOT touch auth/session or onboarding.
export function AddDogModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const createPet = useCreatePet();
  const { setCurrentPet } = useCurrentPet();
  const [upload, { loading: uploading }] = useUpload();

  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const close = () => {
    setForm(EMPTY);
    onClose();
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setField("photo", result.assets[0].uri);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "Please allow camera access in settings.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setField("photo", result.assets[0].uri);
  };

  const handlePickPhoto = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "📷  Take a photo", "🖼️  Choose from gallery"],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) takePhoto();
          if (idx === 2) pickFromGallery();
        },
      );
    } else {
      Alert.alert("Add a photo", "How would you like to add a photo?", [
        { text: "Take a photo", onPress: takePhoto },
        { text: "Choose from gallery", onPress: pickFromGallery },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert("Name needed", "Please enter your dog's name.");
      return;
    }

    setSubmitting(true);
    try {
      let avatarUrl = null;
      if (form.photo) {
        const uploadResult = await upload({
          reactNativeAsset: {
            uri: form.photo,
            name: `pet-avatar-${Date.now()}.jpg`,
            mimeType: "image/jpeg",
          },
        });
        if (uploadResult.error || !uploadResult.url) {
          throw new Error("photo upload failed");
        }
        avatarUrl = uploadResult.url;
      }

      const result = await createPet.mutateAsync({
        name: form.name.trim(),
        breed: form.breed.trim() || null,
        gender: form.gender || null,
        weight: form.weight ? parseFloat(form.weight) : null,
        weight_unit: form.weightUnit,
        birthday: form.birthday.trim() || null,
        notes: form.notes.trim() || null,
        avatar_url: avatarUrl,
      });

      const newPetId = result?.pet?.id;
      if (newPetId) setCurrentPet(newPetId);

      Alert.alert("Saved", `${form.name.trim()} is ready to go!`);
      close();
    } catch (error) {
      Alert.alert("Could not save", "Could not save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || uploading;
  const canSave = !!form.name.trim() && !busy;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingAnimatedView
        style={{ flex: 1, backgroundColor: COLORS.cream }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: COLORS.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
          }}
        >
          <TouchableOpacity onPress={close}>
            <X size={22} color={COLORS.warmBrown} />
          </TouchableOpacity>
          <Text
            style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown }}
          >
            Add a dog
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: insets.bottom + 120,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo */}
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            {form.photo ? (
              <Image
                source={{ uri: form.photo }}
                style={{ width: 120, height: 120, borderRadius: 60 }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: COLORS.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 60 }}>🐕</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={handlePickPhoto}
              style={{
                marginTop: 12,
                paddingVertical: 10,
                paddingHorizontal: 20,
                backgroundColor: COLORS.sand,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Camera size={16} color={COLORS.coral} />
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: COLORS.coral }}
              >
                {form.photo ? "Change photo" : "Add photo"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Name */}
          <Field
            label="Name"
            required
            value={form.name}
            onChangeText={(t) => setField("name", t)}
            placeholder="e.g. Buddy"
          />

          {/* Breed */}
          <Field
            label="Breed"
            value={form.breed}
            onChangeText={(t) => setField("breed", t)}
            placeholder="e.g. Golden Retriever"
          />

          {/* Gender */}
          <Label>Gender</Label>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
            {["male", "female", "unknown"].map((option) => {
              const selected = form.gender === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => setField("gender", option)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: selected ? COLORS.coral : COLORS.sand,
                    borderWidth: 1,
                    borderColor: selected ? COLORS.coral : COLORS.peach,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: selected ? "#FFF" : COLORS.warmBrown,
                    }}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Weight */}
          <Label>Weight</Label>
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginBottom: 20,
              alignItems: "flex-end",
            }}
          >
            <View style={{ flex: 1 }}>
              <TextInput
                style={inputStyle}
                placeholder="0"
                placeholderTextColor={COLORS.mutedBrown}
                value={form.weight}
                onChangeText={(t) =>
                  setField("weight", t.replace(/[^0-9.]/g, ""))
                }
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {["lbs", "kg"].map((unit) => {
                const selected = form.weightUnit === unit;
                return (
                  <TouchableOpacity
                    key={unit}
                    onPress={() => setField("weightUnit", unit)}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      borderRadius: 12,
                      backgroundColor: selected ? COLORS.coral : COLORS.sand,
                      borderWidth: 1,
                      borderColor: selected ? COLORS.coral : COLORS.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: selected ? "#FFF" : COLORS.warmBrown,
                      }}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Birthday */}
          <View style={{ marginBottom: 20 }}>
            <Label>Birthday</Label>
            <DateField
              value={form.birthday}
              onChange={(date) => setField("birthday", date)}
              maximumDate={new Date()}
              fieldStyle={{
                backgroundColor: "#FFF",
                padding: 14,
                borderColor: COLORS.sand,
              }}
              textStyle={{ fontSize: 16, fontWeight: "600" }}
            />
          </View>

          {/* Notes */}
          <Label>Notes</Label>
          <TextInput
            style={[inputStyle, { minHeight: 110, textAlignVertical: "top" }]}
            placeholder="Allergies, food preferences, medical conditions..."
            placeholderTextColor={COLORS.mutedBrown}
            value={form.notes}
            onChangeText={(t) => setField("notes", t)}
            multiline
          />
        </ScrollView>

        {/* Save */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: COLORS.cream,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: COLORS.sand,
          }}
        >
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            style={{
              backgroundColor: canSave ? COLORS.coral : COLORS.sand,
              borderRadius: 18,
              height: 56,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text
                  style={{ color: "#FFF", fontSize: 17, fontWeight: "800" }}
                >
                  Save
                </Text>
                <Check size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingAnimatedView>
    </Modal>
  );
}

const inputStyle = {
  backgroundColor: "#FFF",
  borderRadius: 12,
  padding: 14,
  fontSize: 16,
  fontWeight: "600",
  color: COLORS.warmBrown,
  borderWidth: 1,
  borderColor: COLORS.sand,
};

const Label = ({ children }) => (
  <Text
    style={{
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.warmBrown,
      marginBottom: 8,
    }}
  >
    {children}
  </Text>
);

const Field = ({ label, required = false, ...inputProps }) => (
  <View style={{ marginBottom: 20 }}>
    <Text
      style={{
        fontSize: 14,
        fontWeight: "700",
        color: COLORS.warmBrown,
        marginBottom: 8,
      }}
    >
      {label} {required && <Text style={{ color: COLORS.coral }}>*</Text>}
    </Text>
    <TextInput
      style={inputStyle}
      placeholderTextColor={COLORS.mutedBrown}
      autoCapitalize="words"
      {...inputProps}
    />
  </View>
);
