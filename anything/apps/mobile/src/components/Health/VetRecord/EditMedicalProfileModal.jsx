import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import DateField from "@/components/DateField";
import BirthdayOrAgeField from "@/components/Pets/BirthdayOrAgeField";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";

export default function EditMedicalProfileModal({
  visible,
  onClose,
  petId,
  initialData,
  onSave,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Shared fields (from pets table)
  const [breed, setBreed] = useState(initialData?.pet?.breed || "");
  const [birthday, setBirthday] = useState(
    initialData?.pet?.birthday
      ? new Date(initialData.pet.birthday).toISOString().split("T")[0]
      : "",
  );
  // Explicit "I don't know the birthday" state (docs/roadmap.md) — not just
  // "birthday happens to be blank". Derived from the pet on open, then owned
  // by the toggle in BirthdayOrAgeField.
  const [birthdayUnknown, setBirthdayUnknown] = useState(
    !initialData?.pet?.birthday,
  );
  const [ageYears, setAgeYears] = useState(
    initialData?.pet?.age_years?.toString() || "",
  );
  const [ageMonths, setAgeMonths] = useState(
    initialData?.pet?.age_months?.toString() || "",
  );
  const [adoptionDate, setAdoptionDate] = useState(
    initialData?.pet?.adoption_date
      ? new Date(initialData.pet.adoption_date).toISOString().split("T")[0]
      : "",
  );
  // Stored lowercase (app-wide convention — see profile-edit.jsx / AddDogModal.jsx);
  // normalize on read so a pre-existing differently-cased value still matches an option.
  const [gender, setGender] = useState(
    initialData?.pet?.gender?.toLowerCase() || "",
  );
  const [currentWeight, setCurrentWeight] = useState(
    initialData?.currentWeight?.weight?.toString() || "",
  );
  const [weightUnit, setWeightUnit] = useState(
    initialData?.currentWeight?.weight_unit || "lbs",
  );

  // Medical-only fields (from pet_medical_profiles)
  const [spayedNeuteredStatus, setSpayedNeuteredStatus] = useState(
    initialData?.medicalProfile?.spayed_neutered_status || "",
  );
  const [spayedNeuteredDate, setSpayedNeuteredDate] = useState(
    initialData?.medicalProfile?.spayed_neutered_date
      ? new Date(initialData.medicalProfile.spayed_neutered_date)
          .toISOString()
          .split("T")[0]
      : "",
  );
  const [microchipId, setMicrochipId] = useState(
    initialData?.medicalProfile?.microchip_id || "",
  );
  const [primaryVetName, setPrimaryVetName] = useState(
    initialData?.medicalProfile?.primary_vet_name || "",
  );
  const [primaryClinicName, setPrimaryClinicName] = useState(
    initialData?.medicalProfile?.primary_clinic_name || "",
  );
  const [vetPhone, setVetPhone] = useState(
    initialData?.medicalProfile?.vet_phone || "",
  );
  const [vetEmail, setVetEmail] = useState(
    initialData?.medicalProfile?.vet_email || "",
  );
  const [emergencyContactName, setEmergencyContactName] = useState(
    initialData?.medicalProfile?.emergency_contact_name || "",
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    initialData?.medicalProfile?.emergency_contact_phone || "",
  );
  const [insuranceProvider, setInsuranceProvider] = useState(
    initialData?.medicalProfile?.insurance_provider || "",
  );
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState(
    initialData?.medicalProfile?.insurance_policy_number || "",
  );
  const [medicalNotes, setMedicalNotes] = useState(
    initialData?.medicalProfile?.medical_notes || "",
  );

  const [errors, setErrors] = useState({});

  const validateEmail = (email) => {
    if (!email) return true;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateWeight = (weight) => {
    if (!weight) return true;
    const num = parseFloat(weight);
    return !isNaN(num) && num > 0;
  };

  const validateDate = (dateStr) => {
    if (!dateStr) return true;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  };

  const handleSave = async () => {
    const newErrors = {};

    if (vetEmail && !validateEmail(vetEmail)) {
      newErrors.vetEmail = "Please enter a valid email";
    }

    if (currentWeight && !validateWeight(currentWeight)) {
      newErrors.currentWeight = "Please enter a valid weight";
    }

    if (birthday && !validateDate(birthday)) {
      newErrors.birthday = "Please enter a valid date";
    }

    if (adoptionDate && !validateDate(adoptionDate)) {
      newErrors.adoptionDate = "Please enter a valid date";
    }

    if (spayedNeuteredDate && !validateDate(spayedNeuteredDate)) {
      newErrors.spayedNeuteredDate = "Please enter a valid date";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Alert.alert(t("editMedicalProfile.validationTitle"), t("editMedicalProfile.validationBody"));
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // Age model (docs/roadmap.md): when the birthday is known, age_years/
      // age_months are left OUT of the body entirely (not sent as null) so a
      // previously-stored estimate stays in the database untouched — it's
      // harmless once a birthday exists since display always prefers the
      // calculated age. When the birthday is marked unknown, birthday is
      // explicitly cleared and the estimate (if any) is written.
      const ageFields = birthdayUnknown
        ? {
            ageYears: ageYears ? parseInt(ageYears, 10) : null,
            ageMonths: ageMonths ? parseInt(ageMonths, 10) : null,
          }
        : {};

      const response = await fetch("/api/pet-medical-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId,
          breed,
          birthday: birthdayUnknown ? null : birthday || null,
          ...ageFields,
          adoptionDate: adoptionDate || null,
          gender,
          currentWeight: currentWeight || null,
          weightUnit,
          spayedNeuteredStatus,
          spayedNeuteredDate: spayedNeuteredDate || null,
          microchipId,
          primaryVetName,
          primaryClinicName,
          vetPhone,
          vetEmail,
          emergencyContactName,
          emergencyContactPhone,
          insuranceProvider,
          insurancePolicyNumber,
          medicalNotes,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      // breed/birthday/gender/weight above are shared fields written to the
      // pets table (not just pet_medical_profiles) — invalidate the same
      // ["pets"] cache profile-edit.jsx does so every other screen reading
      // usePetProfile/useCurrentPet (Dog Profile, headers, etc.) reflects the
      // change immediately instead of waiting out the 45s staleTime.
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
      await queryClient.refetchQueries({ queryKey: ["pets", "current"] });

      // currentWeight above can land in health_weight_logs now (petWeight.js
      // logCurrentWeight — once the pet has any weigh-in history), not just
      // pets.weight, so the Health → Track weight chart/history must refresh
      // too, same as WeightModal.jsx does after logging a weight there.
      await queryClient.invalidateQueries({ queryKey: ["health", "weight-logs"] });
      await queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });

      Alert.alert(t("editMedicalProfile.savedTitle"), t("editMedicalProfile.savedBody"));
      onSave?.();
      onClose();
    } catch (error) {
      console.error("Save medical profile error:", error);
      Alert.alert(t("common.error"), t("editMedicalProfile.saveFailedBody"));
    } finally {
      setLoading(false);
    }
  };

  const FormSection = ({ title, children }) => (
    <View style={{ marginBottom: SPACING.xxl }}>
      <Text
        style={[
          TYPE.subhead,
          {
            fontWeight: "700",
            color: COLORS.mutedBrown,
            marginBottom: SPACING.md,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          },
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );

  const FormInput = ({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType = "default",
    multiline = false,
    error,
  }) => (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text
        style={[
          TYPE.subhead,
          { fontWeight: "600", color: COLORS.warmBrown, marginBottom: SPACING.xs + 2 },
        ]}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.mutedBrown + "80"}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={{
          backgroundColor: MATERIALS.surface,
          borderRadius: RADIUS.control,
          padding: 14,
          fontSize: 14,
          color: COLORS.warmBrown,
          borderWidth: 1.5,
          borderColor: error ? "#FF6B6B" : MATERIALS.hairline,
          ...(multiline && {
            height: 80,
            textAlignVertical: "top",
          }),
        }}
      />
      {error && (
        <Text
          style={{
            fontSize: 12,
            color: "#FF6B6B",
            marginTop: 4,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );

  const FormDateField = ({ label, value, onChange, error }) => (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: COLORS.warmBrown,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <DateField
        value={value}
        onChange={onChange}
        fieldStyle={{
          padding: 14,
          borderWidth: 1.5,
          borderColor: error ? "#FF6B6B" : MATERIALS.hairline,
        }}
        textStyle={{ fontSize: 14 }}
      />
      {error && (
        <Text
          style={{
            fontSize: 12,
            color: "#FF6B6B",
            marginTop: 4,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );

  const GenderSelector = () => (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: COLORS.warmBrown,
          marginBottom: 6,
        }}
      >
        Sex / Gender
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {["male", "female"].map((option) => (
          <PressableScale
            key={option}
            testID={`gender-${option}`}
            onPress={() => setGender(option)}
            style={{
              flex: 1,
              backgroundColor: gender === option ? COLORS.coral : MATERIALS.surface,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.md,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: gender === option ? COLORS.coral : MATERIALS.hairline,
            }}
          >
            <Text
              style={[
                TYPE.callout,
                { fontWeight: "600", color: gender === option ? "#FFF" : COLORS.warmBrown },
              ]}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );

  const WeightUnitSelector = () => (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: COLORS.warmBrown,
          marginBottom: 6,
        }}
      >
        Weight Unit
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {["lbs", "kg"].map((unit) => (
          <PressableScale
            key={unit}
            onPress={() => setWeightUnit(unit)}
            style={{
              flex: 1,
              backgroundColor: weightUnit === unit ? COLORS.coral : MATERIALS.surface,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.md,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: weightUnit === unit ? COLORS.coral : MATERIALS.hairline,
            }}
          >
            <Text
              style={[
                TYPE.callout,
                { fontWeight: "600", color: weightUnit === unit ? "#FFF" : COLORS.warmBrown },
              ]}
            >
              {unit}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );

  const SpayedNeuteredSelector = () => (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: COLORS.warmBrown,
          marginBottom: 6,
        }}
      >
        Spayed / Neutered
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {["Spayed", "Neutered", "Not spayed/neutered", "Unknown"].map(
          (option) => (
            <PressableScale
              key={option}
              onPress={() => setSpayedNeuteredStatus(option)}
              style={{
                flex: 1,
                backgroundColor:
                  spayedNeuteredStatus === option ? COLORS.coral : MATERIALS.surface,
                borderRadius: RADIUS.control,
                paddingVertical: SPACING.md,
                paddingHorizontal: SPACING.sm,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor:
                  spayedNeuteredStatus === option ? COLORS.coral : MATERIALS.hairline,
              }}
            >
              <Text
                style={[
                  TYPE.footnote,
                  {
                    fontWeight: "600",
                    color: spayedNeuteredStatus === option ? "#FFF" : COLORS.warmBrown,
                    textAlign: "center",
                  },
                ]}
              >
                {option}
              </Text>
            </PressableScale>
          ),
        )}
      </View>
    </View>
  );

  return (
    <KeyboardSafeFormModal
      visible={visible}
      onClose={onClose}
      title="Edit Medical Profile"
      onCtaPress={handleSave}
      ctaLabel={loading ? "Saving…" : "Save Medical Profile"}
      ctaDisabled={loading}
    >
      <FormSection title="Basic Information">
        <FormInput
          label="Breed"
          value={breed}
          onChangeText={setBreed}
          placeholder="e.g., Golden Retriever"
        />
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: COLORS.warmBrown,
              marginBottom: 6,
            }}
          >
            Birthday
          </Text>
          <BirthdayOrAgeField
            birthdayUnknown={birthdayUnknown}
            onToggleUnknown={setBirthdayUnknown}
            birthday={birthday}
            onBirthdayChange={setBirthday}
            ageYears={ageYears}
            onAgeYearsChange={setAgeYears}
            ageMonths={ageMonths}
            onAgeMonthsChange={setAgeMonths}
          />
        </View>
        <FormDateField
          label="Adoption Date (optional)"
          value={adoptionDate}
          onChange={setAdoptionDate}
          error={errors.adoptionDate}
        />
        <GenderSelector />
        <FormInput
          label="Current Weight"
          value={currentWeight}
          onChangeText={setCurrentWeight}
          placeholder="e.g., 65"
          keyboardType="decimal-pad"
          error={errors.currentWeight}
        />
        <WeightUnitSelector />
      </FormSection>

      <FormSection title="Medical Details">
        <SpayedNeuteredSelector />
        <FormDateField
          label="Spayed / Neutered Date (optional)"
          value={spayedNeuteredDate}
          onChange={setSpayedNeuteredDate}
          error={errors.spayedNeuteredDate}
        />
        <FormInput
          label="Microchip ID"
          value={microchipId}
          onChangeText={setMicrochipId}
          placeholder="e.g., 985112345678900"
        />
        <FormInput
          label="Primary Veterinarian"
          value={primaryVetName}
          onChangeText={setPrimaryVetName}
          placeholder="e.g., Dr. Sarah Johnson"
        />
        <FormInput
          label="Primary Clinic"
          value={primaryClinicName}
          onChangeText={setPrimaryClinicName}
          placeholder="e.g., Happy Paws Veterinary Clinic"
        />
        <FormInput
          label="Vet Phone"
          value={vetPhone}
          onChangeText={setVetPhone}
          placeholder="(555) 123-4567"
          keyboardType="phone-pad"
        />
        <FormInput
          label="Vet Email (optional)"
          value={vetEmail}
          onChangeText={setVetEmail}
          placeholder="clinic@example.com"
          keyboardType="email-address"
          error={errors.vetEmail}
        />
        <FormInput
          label="Emergency Contact Name"
          value={emergencyContactName}
          onChangeText={setEmergencyContactName}
          placeholder="e.g., Jane Doe"
        />
        <FormInput
          label="Emergency Contact Phone"
          value={emergencyContactPhone}
          onChangeText={setEmergencyContactPhone}
          placeholder="(555) 987-6543"
          keyboardType="phone-pad"
        />
        <FormInput
          label="Insurance Provider"
          value={insuranceProvider}
          onChangeText={setInsuranceProvider}
          placeholder="e.g., PetPlan Premium"
        />
        <FormInput
          label="Insurance Policy Number"
          value={insurancePolicyNumber}
          onChangeText={setInsurancePolicyNumber}
          placeholder="e.g., PP123456789"
        />
      </FormSection>

      <FormSection title="Notes">
        <FormInput
          label="Medical Notes"
          value={medicalNotes}
          onChangeText={setMedicalNotes}
          placeholder={t("editMedicalProfile.notesPlaceholder")}
          multiline
        />
      </FormSection>
    </KeyboardSafeFormModal>
  );
}
