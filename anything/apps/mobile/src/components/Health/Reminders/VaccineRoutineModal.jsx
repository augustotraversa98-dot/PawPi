import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ROUTINE_TYPES } from "@/data/routinesData";
import DateField from "@/components/DateField";

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

export default function VaccineRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
}) {
  const { t } = useTranslation();
  const [vaccineName, setVaccineName] = useState("");
  const [lastGiven, setLastGiven] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [vetClinic, setVetClinic] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [timeSensitive, setTimeSensitive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editingRoutine) {
      setVaccineName(editingRoutine.vaccineName || "");
      setLastGiven(editingRoutine.lastGiven || "");
      setNextDue(editingRoutine.nextDue || "");
      setVetClinic(editingRoutine.vetClinic || "");
      setReminderEnabled(editingRoutine.notificationEnabled ?? true);
      setTimeSensitive(editingRoutine.timeSensitive ?? true);
      setNotes(editingRoutine.notes || "");
    } else {
      setVaccineName("");
      setLastGiven("");
      setNextDue("");
      setVetClinic("");
      setReminderEnabled(true);
      setTimeSensitive(true);
      setNotes("");
    }
  }, [editingRoutine, visible]);

  const handleSave = () => {
    const routine = {
      type: ROUTINE_TYPES.VACCINE,
      petId: editingRoutine?.petId ?? null,
      isActive: true,
      vaccineName,
      lastGiven,
      nextDue,
      vetClinic,
      times: ["10:00"],
      notificationEnabled: reminderEnabled,
      timeSensitive,
      notes,
      title: vaccineName || "Vaccine",
      description: "Vaccination schedule",
    };

    if (editingRoutine) routine.id = editingRoutine.id;
    onSave(routine);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, backgroundColor: C.cream }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
              paddingTop: 60,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
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
                💉 {editingRoutine ? "Edit" : "Create"} Vaccine
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                Track vaccination schedule
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
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

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Vaccine Name
            </Text>
            <TextInput
              value={vaccineName}
              onChangeText={setVaccineName}
              placeholder={t("health.reminders.vaccine.namePlaceholder")}
              placeholderTextColor={C.mutedBrown}
              style={{
                backgroundColor: C.card,
                borderRadius: 12,
                padding: 12,
                fontSize: 15,
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
                marginBottom: 20,
              }}
            />

            {/* Stacked (not side-by-side) so the inline calendar has full width */}
            <View style={{ gap: 12, marginBottom: 20 }}>
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 8,
                  }}
                >
                  Last Given
                </Text>
                <DateField value={lastGiven} onChange={setLastGiven} />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 8,
                  }}
                >
                  Next Due
                </Text>
                <DateField value={nextDue} onChange={setNextDue} />
              </View>
            </View>

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Vet Clinic
            </Text>
            <TextInput
              value={vetClinic}
              onChangeText={setVetClinic}
              placeholder={t("health.reminders.vaccine.clinicPlaceholder")}
              placeholderTextColor={C.mutedBrown}
              style={{
                backgroundColor: C.card,
                borderRadius: 12,
                padding: 12,
                fontSize: 15,
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
                marginBottom: 20,
              }}
            />

            <View
              style={{
                backgroundColor: C.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: C.peach,
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: C.warmBrown,
                  }}
                >
                  Reminder enabled
                </Text>
                <Switch
                  value={reminderEnabled}
                  onValueChange={setReminderEnabled}
                  trackColor={{ false: C.sand, true: C.sage + "60" }}
                  thumbColor={reminderEnabled ? C.sage : C.peach}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: C.warmBrown,
                  }}
                >
                  Time-sensitive
                </Text>
                <Switch
                  value={timeSensitive}
                  onValueChange={setTimeSensitive}
                  trackColor={{ false: C.sand, true: C.coral + "60" }}
                  thumbColor={timeSensitive ? C.coral : C.peach}
                />
              </View>
            </View>

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
              placeholder={t("health.reminders.vaccine.notesPlaceholder")}
              placeholderTextColor={C.mutedBrown}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: C.card,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
                textAlignVertical: "top",
                marginBottom: 24,
              }}
            />
          </ScrollView>

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
              style={{
                backgroundColor: C.coral,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                {editingRoutine ? "Save Changes" : "Create Routine"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
