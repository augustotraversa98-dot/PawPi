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
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "@/data/routinesData";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";

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

export default function MedicationRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
  petName = "your pet",
}) {
  const { t } = useTranslation();
  const [medicationName, setMedicationName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState(ROUTINE_FREQUENCY.DAILY);
  const [times, setTimes] = useState(["21:00"]);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState("");
  const [prescribedBy, setPrescribedBy] = useState("");
  const [instructions, setInstructions] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [timeSensitive, setTimeSensitive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editingRoutine) {
      setMedicationName(editingRoutine.medicationName || "");
      setDose(editingRoutine.dose || "");
      setFrequency(editingRoutine.frequency || ROUTINE_FREQUENCY.DAILY);
      setTimes(editingRoutine.times || ["21:00"]);
      setStartDate(
        editingRoutine.startDate || new Date().toISOString().split("T")[0],
      );
      setEndDate(editingRoutine.endDate || "");
      setPrescribedBy(editingRoutine.prescribedBy || "");
      setInstructions(editingRoutine.instructions || "");
      setReminderEnabled(editingRoutine.notificationEnabled ?? true);
      setTimeSensitive(editingRoutine.timeSensitive ?? true);
      setNotes(editingRoutine.notes || "");
    } else {
      setMedicationName("");
      setDose("");
      setFrequency(ROUTINE_FREQUENCY.DAILY);
      setTimes(["21:00"]);
      setStartDate(new Date().toISOString().split("T")[0]);
      setEndDate("");
      setPrescribedBy("");
      setInstructions("");
      setReminderEnabled(true);
      setTimeSensitive(true);
      setNotes("");
    }
  }, [editingRoutine, visible]);

  const handleSave = () => {
    const routine = {
      type: ROUTINE_TYPES.MEDICATION,
      petId: editingRoutine?.petId ?? null,
      isActive: true,
      medicationName,
      dose,
      frequency,
      times,
      startDate,
      endDate,
      prescribedBy,
      instructions,
      notificationEnabled: reminderEnabled,
      timeSensitive,
      notes,
      title: medicationName || "Medication",
      description: dose || "Daily medication",
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
                💊 {editingRoutine ? "Edit" : "Create"} Medication
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                Track {petName}'s medication schedule
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
            <View
              style={{
                backgroundColor: "#FEF3C7",
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#FDE68A",
              }}
            >
              <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 19 }}>
                ⚠️ Follow your veterinarian's instructions for medication dose
                and schedule
              </Text>
            </View>

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Medication Name
            </Text>
            <TextInput
              value={medicationName}
              onChangeText={setMedicationName}
              placeholder="e.g., Apoquel"
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

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Dose
            </Text>
            <TextInput
              value={dose}
              onChangeText={setDose}
              placeholder="e.g., 1 tablet"
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

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Frequency
            </Text>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {[
                { value: ROUTINE_FREQUENCY.DAILY, label: "Once daily" },
                { value: "twice_daily", label: "Twice daily" },
                { value: "every_12_hours", label: "Every 12 hours" },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => {
                    setFrequency(option.value);
                    if (option.value === "twice_daily")
                      setTimes(["09:00", "21:00"]);
                    else if (option.value === "every_12_hours")
                      setTimes(["09:00", "21:00"]);
                    else setTimes(["21:00"]);
                  }}
                  style={{
                    backgroundColor:
                      frequency === option.value ? C.terracotta + "20" : C.card,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor:
                      frequency === option.value ? C.terracotta : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: frequency === option.value ? "700" : "600",
                      color:
                        frequency === option.value ? C.terracotta : C.warmBrown,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Time(s)
            </Text>
            {times.map((time, index) => (
              <View key={index} style={{ marginBottom: 10 }}>
                <TimeField
                  value={time}
                  onChange={(next) => {
                    const updated = [...times];
                    updated[index] = next;
                    setTimes(updated);
                  }}
                />
              </View>
            ))}

            {/* Stacked (not side-by-side) so the inline calendar has full width */}
            <View style={{ gap: 12, marginBottom: 20, marginTop: 10 }}>
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 8,
                  }}
                >
                  Start Date
                </Text>
                <DateField value={startDate} onChange={setStartDate} />
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
                  End Date
                </Text>
                <DateField value={endDate} onChange={setEndDate} />
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
              Prescribed By
            </Text>
            <TextInput
              value={prescribedBy}
              onChangeText={setPrescribedBy}
              placeholder={t("health.reminders.medication.vetPlaceholder")}
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

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Instructions
            </Text>
            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              placeholder="e.g., Give with food"
              placeholderTextColor={C.mutedBrown}
              multiline
              numberOfLines={2}
              style={{
                backgroundColor: C.card,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
                textAlignVertical: "top",
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
              placeholder={t("health.reminders.medication.notesPlaceholder")}
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
                backgroundColor: C.terracotta,
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
