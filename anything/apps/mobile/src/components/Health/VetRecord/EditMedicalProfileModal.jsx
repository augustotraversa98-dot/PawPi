import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";

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

export default function EditMedicalProfileModal({
  visible,
  onClose,
  petId,
  initialData,
  onSave,
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  // Shared fields (from pets table)
  const [breed, setBreed] = useState(initialData?.pet?.breed || "");
  const [birthday, setBirthday] = useState(
    initialData?.pet?.birthday
      ? new Date(initialData.pet.birthday).toISOString().split("T")[0]
      : "",
  );
  const [adoptionDate, setAdoptionDate] = useState(
    initialData?.pet?.adoption_date
      ? new Date(initialData.pet.adoption_date).toISOString().split("T")[0]
      : "",
  );
  const [gender, setGender] = useState(initialData?.pet?.gender || "");
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
      Alert.alert("Validation Error", "Please check the highlighted fields.");
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const response = await fetch("/api/pet-medical-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId,
          breed,
          birthday: birthday || null,
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

      Alert.alert("Success", "Medical profile saved");
      onSave?.();
      onClose();
    } catch (error) {
      console.error("Save medical profile error:", error);
      Alert.alert("Error", "Could not save medical profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const FormSection = ({ title, children }) => (
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: C.mutedBrown,
          marginBottom: 12,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
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
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: C.warmBrown,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.mutedBrown + "80"}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={{
          backgroundColor: C.card,
          borderRadius: 12,
          padding: 14,
          fontSize: 14,
          color: C.warmBrown,
          borderWidth: 1.5,
          borderColor: error ? "#FF6B6B" : C.peach,
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

  const GenderSelector = () => (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: C.warmBrown,
          marginBottom: 6,
        }}
      >
        Sex / Gender
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {["Male", "Female"].map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setGender(option)}
            style={{
              flex: 1,
              backgroundColor: gender === option ? C.coral : C.card,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: gender === option ? C.coral : C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: gender === option ? "#FFF" : C.warmBrown,
              }}
            >
              {option}
            </Text>
          </TouchableOpacity>
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
          color: C.warmBrown,
          marginBottom: 6,
        }}
      >
        Weight Unit
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {["lbs", "kg"].map((unit) => (
          <TouchableOpacity
            key={unit}
            onPress={() => setWeightUnit(unit)}
            style={{
              flex: 1,
              backgroundColor: weightUnit === unit ? C.coral : C.card,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: weightUnit === unit ? C.coral : C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: weightUnit === unit ? "#FFF" : C.warmBrown,
              }}
            >
              {unit}
            </Text>
          </TouchableOpacity>
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
          color: C.warmBrown,
          marginBottom: 6,
        }}
      >
        Spayed / Neutered
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {["Spayed", "Neutered", "Not spayed/neutered", "Unknown"].map(
          (option) => (
            <TouchableOpacity
              key={option}
              onPress={() => setSpayedNeuteredStatus(option)}
              style={{
                flex: 1,
                backgroundColor:
                  spayedNeuteredStatus === option ? C.coral : C.card,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 8,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor:
                  spayedNeuteredStatus === option ? C.coral : C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: spayedNeuteredStatus === option ? "#FFF" : C.warmBrown,
                  textAlign: "center",
                }}
              >
                {option}
              </Text>
            </TouchableOpacity>
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
      onSave={handleSave}
      saveText="Save Medical Profile"
      loading={loading}
    >
      <FormSection title="Basic Information">
        <FormInput
          label="Breed"
          value={breed}
          onChangeText={setBreed}
          placeholder="e.g., Golden Retriever"
        />
        <FormInput
          label="Birthday"
          value={birthday}
          onChangeText={setBirthday}
          placeholder="YYYY-MM-DD"
          error={errors.birthday}
        />
        <FormInput
          label="Adoption Date (optional)"
          value={adoptionDate}
          onChangeText={setAdoptionDate}
          placeholder="YYYY-MM-DD"
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
        <FormInput
          label="Spayed / Neutered Date (optional)"
          value={spayedNeuteredDate}
          onChangeText={setSpayedNeuteredDate}
          placeholder="YYYY-MM-DD"
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
          placeholder="Any additional medical information, allergies, or special care instructions..."
          multiline
        />
      </FormSection>
    </KeyboardSafeFormModal>
  );
}
