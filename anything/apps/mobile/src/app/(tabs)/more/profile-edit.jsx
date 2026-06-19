import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, Camera } from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import useUpload from "@/utils/useUpload";
import { useQueryClient } from "@tanstack/react-query";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";
import DateField from "@/components/DateField";
import { canonicalizeDateValue } from "@/utils/canonicalDateTime";

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: currentPet, isLoading: loadingPet } = useCurrentPet();
  const [upload, { loading: uploading }] = useUpload();

  const [formData, setFormData] = useState({
    photo: null,
    name: "",
    handle: "",
    breed: "",
    ageYears: "",
    ageMonths: "",
    gender: "",
    weight: "",
    weightUnit: "lbs",
    birthday: "",
    adoptionDate: "",
    notes: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pick a new pet photo from the library (the save handler uploads it). Replaces the previous
  // "coming soon" placeholder (App Store readiness 2.78 — no no-op buttons).
  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Photo access needed",
          "Allow photo library access to change your pet's photo.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setFormData((prev) => ({ ...prev, photo: result.assets[0].uri }));
      }
    } catch (e) {
      Alert.alert("Couldn't pick a photo", e?.message || "Please try again.");
    }
  };

  // Pre-fill form with current pet data
  useEffect(() => {
    if (currentPet) {
      console.log("[Profile Edit] Pre-filling form with pet data:", currentPet);

      setFormData({
        photo: currentPet.avatar_url || null,
        name: currentPet.name || "",
        handle: currentPet.handle || "",
        breed: currentPet.breed || "",
        ageYears: currentPet.age_years?.toString() || "",
        ageMonths: currentPet.age_months?.toString() || "",
        gender: currentPet.gender || "",
        weight: currentPet.weight?.toString() || "",
        weightUnit: currentPet.weight_unit || "lbs",
        birthday: canonicalizeDateValue(currentPet.birthday),
        adoptionDate: canonicalizeDateValue(currentPet.adoption_date),
        notes: currentPet.notes || "",
      });
    }
  }, [currentPet]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert("Error", "Pet name is required");
      return;
    }

    if (!currentPet?.id) {
      Alert.alert("Error", "No pet found to update");
      return;
    }

    setIsSubmitting(true);

    try {
      console.log("[Profile Edit] ========================================");
      console.log("[Profile Edit] Starting profile update...");
      console.log("[Profile Edit] Pet ID:", currentPet.id);
      console.log("[Profile Edit] Form data:", formData);

      let uploadedAvatarUrl = currentPet.avatar_url; // Keep existing if no new photo

      // Upload new photo if changed
      if (formData.photo && formData.photo !== currentPet.avatar_url) {
        console.log("[Profile Edit] Uploading new photo...");

        const uploadResult = await upload({
          reactNativeAsset: {
            uri: formData.photo,
            name: `pet-avatar-${Date.now()}.jpg`,
            mimeType: "image/jpeg",
          },
        });

        if (uploadResult.error) {
          throw new Error(`Photo upload failed: ${uploadResult.error}`);
        }

        if (!uploadResult.url) {
          throw new Error("Photo upload succeeded but no URL was returned");
        }

        uploadedAvatarUrl = uploadResult.url;
        console.log("[Profile Edit] ✅ Photo uploaded:", uploadedAvatarUrl);
      }

      // Prepare update payload
      const updatePayload = {
        name: formData.name,
        handle: formData.handle || null,
        avatar_url: uploadedAvatarUrl,
        breed: formData.breed || null,
        age_years: formData.ageYears ? parseInt(formData.ageYears) : null,
        age_months: formData.ageMonths ? parseInt(formData.ageMonths) : null,
        gender: formData.gender || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        weight_unit: formData.weightUnit || "lbs",
        birthday: formData.birthday || null,
        adoption_date: formData.adoptionDate || null,
        notes: formData.notes || null,
      };

      console.log(
        "[Profile Edit] Update payload:",
        JSON.stringify(updatePayload, null, 2),
      );

      // Update pet via API
      const response = await fetch(`/api/pets/${currentPet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[Profile Edit] ERROR:", errorData);
        throw new Error(errorData.error || "Failed to update profile");
      }

      const { pet } = await response.json();
      console.log("[Profile Edit] ✅ Pet updated successfully:", pet);

      // Invalidate pets query to refetch updated data
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
      await queryClient.refetchQueries({ queryKey: ["pets", "current"] });

      console.log("[Profile Edit] ✅ Profile update complete!");
      console.log("[Profile Edit] ========================================");

      Alert.alert("Success", "Profile saved");
      router.back();
    } catch (error) {
      console.error("[Profile Edit] ========================================");
      console.error("[Profile Edit] ERROR:", error.message);
      console.error("[Profile Edit] ========================================");
      Alert.alert(
        "Error",
        error.message || "Could not save profile. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingPet) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.cream,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={C.coral} />
      </View>
    );
  }

  if (!currentPet) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.cream,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Text
          style={{ fontSize: 16, color: C.mutedBrown, textAlign: "center" }}
        >
          No pet profile found
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingAnimatedView
      style={{ flex: 1, backgroundColor: C.cream }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {/* Header */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: C.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={22} color={C.warmBrown} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: "800", color: C.warmBrown }}>
            Edit Profile
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Form */}
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
          <View style={{ alignItems: "center", marginBottom: 30 }}>
            {formData.photo ? (
              <Image
                source={{ uri: formData.photo }}
                style={{ width: 120, height: 120, borderRadius: 60 }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: C.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 60 }}>🐕</Text>
              </View>
            )}
            <TouchableOpacity
              testID="change-photo"
              onPress={pickPhoto}
              style={{
                marginTop: 12,
                paddingVertical: 10,
                paddingHorizontal: 20,
                backgroundColor: C.sand,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Camera size={16} color={C.coral} />
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.coral }}>
                Change Photo
              </Text>
            </TouchableOpacity>
          </View>

          {/* Name */}
          <FormField
            label="Name"
            value={formData.name}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, name: text }))
            }
            placeholder="e.g. Buddy"
            required
          />

          {/* Handle */}
          <FormField
            label="Handle"
            value={formData.handle}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, handle: text }))
            }
            placeholder="e.g. buddy_adventures"
            autoCapitalize="none"
          />

          {/* Breed */}
          <FormField
            label="Breed"
            value={formData.breed}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, breed: text }))
            }
            placeholder="e.g. Golden Retriever"
          />

          {/* Age */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 8,
            }}
          >
            Age
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 12, color: C.mutedBrown, marginBottom: 6 }}
              >
                Years
              </Text>
              <TextInput
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  fontWeight: "600",
                  color: C.warmBrown,
                  borderWidth: 1,
                  borderColor: C.sand,
                }}
                placeholder="0"
                placeholderTextColor={C.mutedBrown}
                value={formData.ageYears}
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    ageYears: text.replace(/[^0-9]/g, ""),
                  }))
                }
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 12, color: C.mutedBrown, marginBottom: 6 }}
              >
                Months
              </Text>
              <TextInput
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  fontWeight: "600",
                  color: C.warmBrown,
                  borderWidth: 1,
                  borderColor: C.sand,
                }}
                placeholder="0"
                placeholderTextColor={C.mutedBrown}
                value={formData.ageMonths}
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    ageMonths: text.replace(/[^0-9]/g, ""),
                  }))
                }
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Gender */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 8,
            }}
          >
            Gender
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
            {["male", "female", "unknown"].map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, gender: option }))
                }
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor:
                    formData.gender === option ? C.coral : C.sand,
                  borderWidth: 1,
                  borderColor: formData.gender === option ? C.coral : C.peach,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: formData.gender === option ? "#FFF" : C.warmBrown,
                  }}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Weight */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 8,
            }}
          >
            Weight
          </Text>
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
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  fontWeight: "600",
                  color: C.warmBrown,
                  borderWidth: 1,
                  borderColor: C.sand,
                }}
                placeholder="0"
                placeholderTextColor={C.mutedBrown}
                value={formData.weight}
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    weight: text.replace(/[^0-9.]/g, ""),
                  }))
                }
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {["lbs", "kg"].map((unit) => (
                <TouchableOpacity
                  key={unit}
                  onPress={() =>
                    setFormData((prev) => ({ ...prev, weightUnit: unit }))
                  }
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderRadius: 12,
                    backgroundColor:
                      formData.weightUnit === unit ? C.coral : C.sand,
                    borderWidth: 1,
                    borderColor:
                      formData.weightUnit === unit ? C.coral : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color:
                        formData.weightUnit === unit ? "#FFF" : C.warmBrown,
                    }}
                  >
                    {unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Birthday */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 8,
              }}
            >
              Birthday
            </Text>
            <DateField
              value={formData.birthday}
              onChange={(date) =>
                setFormData((prev) => ({ ...prev, birthday: date }))
              }
              maximumDate={new Date()}
              fieldStyle={{
                backgroundColor: "#FFF",
                padding: 14,
                borderColor: C.sand,
              }}
              textStyle={{ fontSize: 16, fontWeight: "600" }}
            />
          </View>

          {/* Adoption Date */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 8,
              }}
            >
              Adoption Date
            </Text>
            <DateField
              value={formData.adoptionDate}
              onChange={(date) =>
                setFormData((prev) => ({ ...prev, adoptionDate: date }))
              }
              maximumDate={new Date()}
              fieldStyle={{
                backgroundColor: "#FFF",
                padding: 14,
                borderColor: C.sand,
              }}
              textStyle={{ fontSize: 16, fontWeight: "600" }}
            />
          </View>

          {/* Notes */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 8,
            }}
          >
            Notes
          </Text>
          <TextInput
            style={{
              backgroundColor: "#FFF",
              borderRadius: 12,
              padding: 14,
              fontSize: 14,
              color: C.warmBrown,
              borderWidth: 1,
              borderColor: C.sand,
              minHeight: 120,
              textAlignVertical: "top",
            }}
            placeholder="Allergies, food preferences, medical conditions..."
            placeholderTextColor={C.mutedBrown}
            value={formData.notes}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, notes: text }))
            }
            multiline
          />
        </ScrollView>

        {/* Save Button */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: C.cream,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: C.sand,
          }}
        >
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSubmitting || !formData.name.trim()}
            style={{
              backgroundColor: formData.name.trim() ? C.coral : C.sand,
              borderRadius: 18,
              height: 56,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text
                  style={{ color: "#FFF", fontSize: 17, fontWeight: "800" }}
                >
                  Save Changes
                </Text>
                <Check size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingAnimatedView>
  );
}

const FormField = ({
  label,
  value,
  onChangeText,
  placeholder,
  required = false,
  keyboardType = "default",
  autoCapitalize = "words",
}) => (
  <View style={{ marginBottom: 20 }}>
    <Text
      style={{
        fontSize: 14,
        fontWeight: "700",
        color: C.warmBrown,
        marginBottom: 8,
      }}
    >
      {label} {required && <Text style={{ color: C.coral }}>*</Text>}
    </Text>
    <TextInput
      style={{
        backgroundColor: "#FFF",
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        fontWeight: "600",
        color: C.warmBrown,
        borderWidth: 1,
        borderColor: C.sand,
      }}
      placeholder={placeholder}
      placeholderTextColor={C.mutedBrown}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
    />
  </View>
);
