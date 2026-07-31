import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
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
import BirthdayOrAgeField from "@/components/Pets/BirthdayOrAgeField";
import { canonicalizeDateValue } from "@/utils/canonicalDateTime";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
} from "@/constants/theme";
import { PressableScale } from "@/components/ui";

// Shared form field styling (Liquid Glass, ticket 2.77): sunken well + hairline
// edge + body type. Behavior of each input (value/onChange/keyboard) is unchanged.
const inputStyle = {
  backgroundColor: MATERIALS.surfaceSunken,
  borderRadius: RADIUS.control,
  padding: SPACING.md + 2,
  ...TYPE.body,
  color: COLORS.warmBrown,
  borderWidth: 1,
  borderColor: MATERIALS.hairline,
};

const fieldLabelStyle = { ...TYPE.callout, fontWeight: "700", color: COLORS.warmBrown };

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
    // Explicit "I don't know the birthday" state (docs/roadmap.md) — not
    // just "birthday happens to be blank". Derived from the pet on load,
    // then owned by the toggle below.
    birthdayUnknown: false,
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
        birthdayUnknown: !currentPet.birthday,
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

      // Prepare update payload. Age model (docs/roadmap.md): when the
      // birthday is known, age_years/age_months are left OUT of the payload
      // entirely (not set to null) so a previously-stored estimate stays in
      // the database untouched — it's harmless once a birthday exists since
      // display always prefers the calculated age. When the birthday is
      // marked unknown, birthday is explicitly cleared and the estimate (if
      // any) is written.
      const updatePayload = {
        name: formData.name,
        handle: formData.handle || null,
        avatar_url: uploadedAvatarUrl,
        breed: formData.breed || null,
        gender: formData.gender || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        weight_unit: formData.weightUnit || "lbs",
        birthday: formData.birthdayUnknown ? null : formData.birthday || null,
        adoption_date: formData.adoptionDate || null,
        notes: formData.notes || null,
      };
      if (formData.birthdayUnknown) {
        updatePayload.age_years = formData.ageYears
          ? parseInt(formData.ageYears)
          : null;
        updatePayload.age_months = formData.ageMonths
          ? parseInt(formData.ageMonths)
          : null;
      }

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
          backgroundColor: COLORS.cream,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
    );
  }

  if (!currentPet) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.cream,
          justifyContent: "center",
          alignItems: "center",
          padding: SPACING.xl,
        }}
      >
        <Text style={[TYPE.headline, { color: COLORS.mutedBrown, fontWeight: "500", textAlign: "center" }]}>
          No pet profile found
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingAnimatedView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {/* Header */}
        <View
          style={{
            paddingHorizontal: SPACING.xl,
            paddingBottom: SPACING.md + 2,
            backgroundColor: MATERIALS.surface,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: MATERIALS.hairline,
          }}
        >
          <PressableScale onPress={() => router.back()}>
            <ArrowLeft size={22} color={COLORS.warmBrown} />
          </PressableScale>
          <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
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
          <View style={{ alignItems: "center", marginBottom: SPACING.xxxl - 2 }}>
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
                  backgroundColor: MATERIALS.surfaceSunken,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 60 }}>🐕</Text>
              </View>
            )}
            <PressableScale
              testID="change-photo"
              onPress={pickPhoto}
              accessibilityRole="button"
              style={{
                marginTop: SPACING.md,
                paddingVertical: SPACING.sm + 2,
                paddingHorizontal: SPACING.xl,
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: RADIUS.control,
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.sm,
              }}
            >
              <Camera size={16} color={COLORS.coral} />
              <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.coral }]}>
                Change Photo
              </Text>
            </PressableScale>
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

          {/* Gender */}
          <Text style={[fieldLabelStyle, { marginBottom: SPACING.sm }]}>
            Gender
          </Text>
          <View style={{ flexDirection: "row", gap: SPACING.sm + 2, marginBottom: SPACING.xl }}>
            {["male", "female", "unknown"].map((option) => (
              <PressableScale
                key={option}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, gender: option }))
                }
                accessibilityRole="button"
                style={{
                  flex: 1,
                  paddingVertical: SPACING.md,
                  paddingHorizontal: SPACING.md,
                  borderRadius: RADIUS.control,
                  backgroundColor:
                    formData.gender === option ? COLORS.coral : MATERIALS.surfaceSunken,
                  borderWidth: 1,
                  borderColor: formData.gender === option ? COLORS.coral : COLORS.peach,
                  alignItems: "center",
                }}
              >
                <Text
                  style={[
                    TYPE.callout,
                    { fontWeight: "700", color: formData.gender === option ? "#FFF" : COLORS.warmBrown },
                  ]}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </PressableScale>
            ))}
          </View>

          {/* Weight */}
          <Text style={[fieldLabelStyle, { marginBottom: SPACING.sm }]}>
            Weight
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: SPACING.md,
              marginBottom: SPACING.xl,
              alignItems: "flex-end",
            }}
          >
            <View style={{ flex: 1 }}>
              <TextInput
                style={inputStyle}
                placeholder="0"
                placeholderTextColor={COLORS.mutedBrown}
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
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
              {["lbs", "kg"].map((unit) => (
                <PressableScale
                  key={unit}
                  onPress={() =>
                    setFormData((prev) => ({ ...prev, weightUnit: unit }))
                  }
                  accessibilityRole="button"
                  style={{
                    paddingVertical: SPACING.md + 2,
                    paddingHorizontal: SPACING.xl,
                    borderRadius: RADIUS.control,
                    backgroundColor:
                      formData.weightUnit === unit ? COLORS.coral : MATERIALS.surfaceSunken,
                    borderWidth: 1,
                    borderColor:
                      formData.weightUnit === unit ? COLORS.coral : COLORS.peach,
                  }}
                >
                  <Text
                    style={[
                      TYPE.callout,
                      { fontWeight: "700", color: formData.weightUnit === unit ? "#FFF" : COLORS.warmBrown },
                    ]}
                  >
                    {unit}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </View>

          {/* Birthday (known) or estimated Age (unknown) — mutually exclusive */}
          <View style={{ marginBottom: SPACING.xl }}>
            <Text style={[fieldLabelStyle, { marginBottom: SPACING.sm }]}>
              Birthday
            </Text>
            <BirthdayOrAgeField
              birthdayUnknown={formData.birthdayUnknown}
              onToggleUnknown={(unknown) =>
                setFormData((prev) => ({ ...prev, birthdayUnknown: unknown }))
              }
              birthday={formData.birthday}
              onBirthdayChange={(date) =>
                setFormData((prev) => ({ ...prev, birthday: date }))
              }
              ageYears={formData.ageYears}
              onAgeYearsChange={(text) =>
                setFormData((prev) => ({ ...prev, ageYears: text }))
              }
              ageMonths={formData.ageMonths}
              onAgeMonthsChange={(text) =>
                setFormData((prev) => ({ ...prev, ageMonths: text }))
              }
            />
          </View>

          {/* Adoption Date */}
          <View style={{ marginBottom: SPACING.xl }}>
            <Text style={[fieldLabelStyle, { marginBottom: SPACING.sm }]}>
              Adoption Date
            </Text>
            <DateField
              value={formData.adoptionDate}
              onChange={(date) =>
                setFormData((prev) => ({ ...prev, adoptionDate: date }))
              }
              maximumDate={new Date()}
              fieldStyle={{
                backgroundColor: MATERIALS.surfaceSunken,
                padding: SPACING.md + 2,
                borderColor: MATERIALS.hairline,
              }}
              textStyle={{ ...TYPE.body }}
            />
          </View>

          {/* Notes */}
          <Text style={[fieldLabelStyle, { marginBottom: SPACING.sm }]}>
            Notes
          </Text>
          <TextInput
            style={{
              ...inputStyle,
              ...TYPE.callout,
              color: COLORS.warmBrown,
              minHeight: 120,
              textAlignVertical: "top",
            }}
            placeholder="Allergies, food preferences, medical conditions..."
            placeholderTextColor={COLORS.mutedBrown}
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
            backgroundColor: COLORS.cream,
            paddingHorizontal: SPACING.xl,
            paddingTop: SPACING.lg,
            paddingBottom: insets.bottom + SPACING.lg,
            borderTopWidth: 1,
            borderTopColor: MATERIALS.hairline,
          }}
        >
          <PressableScale
            onPress={handleSave}
            disabled={isSubmitting || !formData.name.trim()}
            accessibilityRole="button"
            style={{
              backgroundColor: formData.name.trim() ? COLORS.coral : MATERIALS.surfaceSunken,
              borderRadius: RADIUS.control,
              height: 56,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: SPACING.sm,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
                  Save Changes
                </Text>
                <Check size={20} color="#FFF" />
              </>
            )}
          </PressableScale>
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
  <View style={{ marginBottom: SPACING.xl }}>
    <Text style={[fieldLabelStyle, { marginBottom: SPACING.sm }]}>
      {label} {required && <Text style={{ color: COLORS.coral }}>*</Text>}
    </Text>
    <TextInput
      style={inputStyle}
      placeholder={placeholder}
      placeholderTextColor={COLORS.mutedBrown}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
    />
  </View>
);
