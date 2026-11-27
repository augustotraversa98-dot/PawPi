import { normalizeWeightUnit } from "@/utils/weightUnitAlias";
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
import { SPAY_NEUTER_OPTIONS, SPAY_NEUTER_KEYS } from "@/utils/healthText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import DateField from "@/components/DateField";
import BirthdayOrAgeField from "@/components/Pets/BirthdayOrAgeField";
import AdoptionDateField from "@/components/Pets/AdoptionDateField";
import { ageFormFromPet, estimateToSave, petKeepsEstimates } from "@/utils/petAgeForm";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { defaultWeightUnit } from "@/utils/weightUnit";
import { canonicalizeDateValue, parseDateValue } from "@/utils/canonicalDateTime";

// The form pieces live at MODULE scope on purpose. Declared inside the modal they were a
// new component type on every render, so each keystroke unmounted and remounted the
// TextInput and the keyboard closed (docs/keyboard-convention.md, guarded by
// keyboardSafety.guard.test.js).
function FormSection({ title, children }) {
  return (
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
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  error,
}) {
  return (
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
}

function FormDateField({ label, value, onChange, error, maximumDate }) {
  return (
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
        maximumDate={maximumDate}
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
}

function GenderSelector({ selected, onSelect }) {
  const { t } = useTranslation();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: COLORS.warmBrown,
          marginBottom: 6,
        }}
      >
        {t("editMedicalProfile.fieldGender")}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {["male", "female"].map((option) => (
          <PressableScale
            key={option}
            testID={`gender-${option}`}
            onPress={() => onSelect(option)}
            style={{
              flex: 1,
              backgroundColor: selected === option ? COLORS.coral : MATERIALS.surface,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.md,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: selected === option ? COLORS.coral : MATERIALS.hairline,
            }}
          >
            <Text
              style={[
                TYPE.callout,
                { fontWeight: "600", color: selected === option ? "#FFF" : COLORS.warmBrown },
              ]}
            >
              {t(`healthDataUi.editMedicalProfileModal.${option}`)}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

function WeightUnitSelector({ selected, onSelect }) {
  const { t } = useTranslation();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: COLORS.warmBrown,
          marginBottom: 6,
        }}
      >
        {t("editMedicalProfile.fieldWeightUnit")}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {["kg", "lbs"].map((unit) => (
          <PressableScale
            key={unit}
            onPress={() => onSelect(unit)}
            style={{
              flex: 1,
              backgroundColor: selected === unit ? COLORS.coral : MATERIALS.surface,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.md,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: selected === unit ? COLORS.coral : MATERIALS.hairline,
            }}
          >
            <Text
              style={[
                TYPE.callout,
                { fontWeight: "600", color: selected === unit ? "#FFF" : COLORS.warmBrown },
              ]}
            >
              {unit}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

function SpayedNeuteredSelector({ selected, onSelect }) {
  const { t } = useTranslation();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: COLORS.warmBrown,
          marginBottom: 6,
        }}
      >
        {t("editMedicalProfile.fieldSpayNeuter")}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {SPAY_NEUTER_OPTIONS.map(
          (option) => (
            <PressableScale
              key={option}
              onPress={() => onSelect(option)}
              style={{
                flex: 1,
                backgroundColor:
                  selected === option ? COLORS.coral : MATERIALS.surface,
                borderRadius: RADIUS.control,
                paddingVertical: SPACING.md,
                paddingHorizontal: SPACING.sm,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor:
                  selected === option ? COLORS.coral : MATERIALS.hairline,
              }}
            >
              <Text
                style={[
                  TYPE.footnote,
                  {
                    fontWeight: "600",
                    color: selected === option ? "#FFF" : COLORS.warmBrown,
                    textAlign: "center",
                  },
                ]}
              >
                {t(SPAY_NEUTER_KEYS[option])}
              </Text>
            </PressableScale>
          ),
        )}
      </View>
    </View>
  );
}

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
    canonicalizeDateValue(initialData?.pet?.birthday),
  );
  // The age answers as loaded, so a save only sends an estimate the owner changed.
  const [seededAge] = useState(() => ageFormFromPet(initialData?.pet));
  // Explicit "I don't know the birthday" state (docs/roadmap.md) — not just
  // "birthday happens to be blank". Derived from the pet on open, then owned
  // by the toggle in BirthdayOrAgeField.
  const [birthdayUnknown, setBirthdayUnknown] = useState(
    seededAge.birthdayUnknown,
  );
  const [ageYears, setAgeYears] = useState(seededAge.ageYears);
  const [ageMonths, setAgeMonths] = useState(seededAge.ageMonths);
  const [adoptionDate, setAdoptionDate] = useState(
    canonicalizeDateValue(initialData?.pet?.adoption_date),
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
    normalizeWeightUnit(initialData?.currentWeight?.weight_unit) ||
      (initialData?.currentWeight?.weight ? "lbs" : defaultWeightUnit()),
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
    return parseDateValue(dateStr) !== null;
  };

  const handleSave = async () => {
    const newErrors = {};

    if (vetEmail && !validateEmail(vetEmail)) {
      newErrors.vetEmail = t("healthDataUi.editMedicalProfileModal.validEmail");
    }

    if (currentWeight && !validateWeight(currentWeight)) {
      newErrors.currentWeight = t("healthDataUi.editMedicalProfileModal.validWeight");
    }

    if (birthday && !validateDate(birthday)) {
      newErrors.birthday = t("healthDataUi.editMedicalProfileModal.validDate");
    }

    if (adoptionDate && !validateDate(adoptionDate)) {
      newErrors.adoptionDate = t("healthDataUi.editMedicalProfileModal.validDate");
    }

    if (spayedNeuteredDate && !validateDate(spayedNeuteredDate)) {
      newErrors.spayedNeuteredDate = t("healthDataUi.editMedicalProfileModal.validDate");
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Alert.alert(t("editMedicalProfile.validationTitle"), t("editMedicalProfile.validationBody"));
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // When the birthday is marked unknown, birthday is explicitly cleared.
      // ageYears/ageMonths are only included for an estimate the owner entered
      // or changed (utils/petAgeForm.js).
      const estimate = estimateToSave(
        { birthdayUnknown, ageYears, ageMonths },
        seededAge,
      );
      const ageFields = estimate
        ? { ageYears: estimate.years, ageMonths: estimate.months }
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

  return (
    <KeyboardSafeFormModal
      visible={visible}
      onClose={onClose}
      title={t("editMedicalProfile.title")}
      onCtaPress={handleSave}
      ctaLabel={loading ? t("editMedicalProfile.saving") : t("editMedicalProfile.saveCta")}
      ctaDisabled={loading}
    >
      <FormSection title={t("editMedicalProfile.sectionBasic")}>
        <FormInput
          label={t("editMedicalProfile.fieldBreed")}
          value={breed}
          onChangeText={setBreed}
          placeholder={t("editMedicalProfile.breedPlaceholder")}
        />
        <View style={{ marginBottom: 16 }}>
          {/* The heading names the date field, which an estimate replaces. */}
          {birthdayUnknown ? null : (
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: COLORS.warmBrown,
                marginBottom: 6,
              }}
            >
              {t("editMedicalProfile.fieldBirthday")}
            </Text>
          )}
          <BirthdayOrAgeField
            birthdayUnknown={birthdayUnknown}
            onToggleUnknown={setBirthdayUnknown}
            birthday={birthday}
            onBirthdayChange={setBirthday}
            ageYears={ageYears}
            onAgeYearsChange={setAgeYears}
            ageMonths={ageMonths}
            onAgeMonthsChange={setAgeMonths}
            estimateGrows={petKeepsEstimates(initialData?.pet)}
          />
        </View>
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: COLORS.warmBrown,
              marginBottom: 6,
            }}
          >
            {t("editMedicalProfile.fieldAdoptionDate")}
          </Text>
          <AdoptionDateField value={adoptionDate} onChange={setAdoptionDate} />
        </View>
        <GenderSelector selected={gender} onSelect={setGender} />
        <FormInput
          label={t("editMedicalProfile.fieldWeight")}
          value={currentWeight}
          onChangeText={setCurrentWeight}
          placeholder={t("editMedicalProfile.weightPlaceholder")}
          keyboardType="decimal-pad"
          error={errors.currentWeight}
        />
        <WeightUnitSelector selected={weightUnit} onSelect={setWeightUnit} />
      </FormSection>

      <FormSection title={t("editMedicalProfile.sectionMedical")}>
        <SpayedNeuteredSelector selected={spayedNeuteredStatus} onSelect={setSpayedNeuteredStatus} />
        <FormDateField
          label={t("editMedicalProfile.fieldSpayNeuterDate")}
          value={spayedNeuteredDate}
          onChange={setSpayedNeuteredDate}
          maximumDate={new Date()}
          error={errors.spayedNeuteredDate}
        />
        <FormInput
          label={t("editMedicalProfile.fieldMicrochip")}
          value={microchipId}
          onChangeText={setMicrochipId}
          placeholder={t("editMedicalProfile.microchipPlaceholder")}
        />
        <FormInput
          label={t("editMedicalProfile.fieldPrimaryVet")}
          value={primaryVetName}
          onChangeText={setPrimaryVetName}
          placeholder={t("healthUi.editMedicalProfileModal.exampleDrSarahJohnson")}
        />
        <FormInput
          label={t("editMedicalProfile.fieldPrimaryClinic")}
          value={primaryClinicName}
          onChangeText={setPrimaryClinicName}
          placeholder={t("healthUi.editMedicalProfileModal.exampleHappyPawsVeterinaryClinic")}
        />
        <FormInput
          label={t("editMedicalProfile.fieldVetPhone")}
          value={vetPhone}
          onChangeText={setVetPhone}
          placeholder="(555) 123-4567"
          keyboardType="phone-pad"
        />
        <FormInput
          label={t("editMedicalProfile.fieldVetEmail")}
          value={vetEmail}
          onChangeText={setVetEmail}
          placeholder="clinic@example.com"
          keyboardType="email-address"
          error={errors.vetEmail}
        />
        <FormInput
          label={t("editMedicalProfile.fieldEmergencyContact")}
          value={emergencyContactName}
          onChangeText={setEmergencyContactName}
          placeholder={t("healthUi.editMedicalProfileModal.exampleJaneDoe")}
        />
        <FormInput
          label={t("editMedicalProfile.fieldEmergencyPhone")}
          value={emergencyContactPhone}
          onChangeText={setEmergencyContactPhone}
          placeholder="(555) 987-6543"
          keyboardType="phone-pad"
        />
        <FormInput
          label={t("editMedicalProfile.fieldInsurance")}
          value={insuranceProvider}
          onChangeText={setInsuranceProvider}
          placeholder={t("healthUi.editMedicalProfileModal.examplePetplanPremium")}
        />
        <FormInput
          label={t("editMedicalProfile.fieldPolicyNumber")}
          value={insurancePolicyNumber}
          onChangeText={setInsurancePolicyNumber}
          placeholder={t("healthUi.editMedicalProfileModal.examplePp123456789")}
        />
      </FormSection>

      <FormSection title={t("editMedicalProfile.sectionNotes")}>
        <FormInput
          label={t("editMedicalProfile.fieldMedicalNotes")}
          value={medicalNotes}
          onChangeText={setMedicalNotes}
          placeholder={t("editMedicalProfile.notesPlaceholder")}
          multiline
        />
      </FormSection>
    </KeyboardSafeFormModal>
  );
}
