import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, Switch } from "react-native";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import TimeField from "@/components/TimeField";
import {
  ROUTINE_TYPES,
  ROUTINE_FREQUENCY,
  ROUTINE_TYPE_CONFIG,
} from "@/data/routinesData";

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

/**
 * Unified modal for General Check, Weight Check
 */
export default function SimpleRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
  routineType,
}) {
  const config = ROUTINE_TYPE_CONFIG[routineType];

  const [frequency, setFrequency] = useState(
    routineType === ROUTINE_TYPES.GENERAL_CHECK
      ? ROUTINE_FREQUENCY.DAILY
      : routineType === ROUTINE_TYPES.WEIGHT_CHECK
        ? ROUTINE_FREQUENCY.WEEKLY
        : ROUTINE_FREQUENCY.DAILY,
  );
  const [preferredDay, setPreferredDay] = useState(6);
  const [preferredTime, setPreferredTime] = useState(
    routineType === ROUTINE_TYPES.GENERAL_CHECK ? "20:00" : "09:00",
  );
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [timeSensitive, setTimeSensitive] = useState(
    routineType === ROUTINE_TYPES.GENERAL_CHECK,
  );
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editingRoutine) {
      setFrequency(editingRoutine.frequency || ROUTINE_FREQUENCY.DAILY);
      setPreferredDay(editingRoutine.preferredDay ?? 6);
      setPreferredTime(editingRoutine.times?.[0] || "09:00");
      setReminderEnabled(editingRoutine.notificationEnabled ?? true);
      setTimeSensitive(editingRoutine.timeSensitive ?? false);
      setNotes(editingRoutine.notes || "");
    }
  }, [editingRoutine, visible]);

  const handleSave = () => {
    const routine = {
      type: routineType,
      petId: "phoebe",
      isActive: true,
      frequency,
      preferredDay:
        frequency === ROUTINE_FREQUENCY.WEEKLY ? preferredDay : null,
      times: [preferredTime],
      days: frequency === ROUTINE_FREQUENCY.WEEKLY ? [preferredDay] : [],
      notificationEnabled: reminderEnabled,
      timeSensitive,
      notes,
      title: config.label,
      description: config.description,
    };

    if (editingRoutine) routine.id = editingRoutine.id;
    onSave(routine);
    onClose();
  };

  const getFrequencyOptions = () => {
    if (routineType === ROUTINE_TYPES.GENERAL_CHECK) {
      return [
        { value: ROUTINE_FREQUENCY.DAILY, label: "Daily" },
        { value: ROUTINE_FREQUENCY.WEEKLY, label: "Weekly" },
        { value: ROUTINE_FREQUENCY.BIWEEKLY, label: "Every 2 weeks" },
      ];
    } else {
      return [
        { value: ROUTINE_FREQUENCY.WEEKLY, label: "Weekly" },
        { value: ROUTINE_FREQUENCY.BIWEEKLY, label: "Every 2 weeks" },
        { value: ROUTINE_FREQUENCY.MONTHLY, label: "Monthly" },
      ];
    }
  };

  return (
    <KeyboardSafeFormModal
      visible={visible}
      onClose={onClose}
      title={`${editingRoutine ? "Edit" : "Create"} ${config.label}`}
      subtitle={config.description}
      icon={config.icon}
      ctaLabel={editingRoutine ? "Save Changes" : "Create Routine"}
      ctaColor={config.color}
      onCtaPress={handleSave}
      backgroundColor={C.cream}
    >
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
        {getFrequencyOptions().map((option) => (
          <TouchableOpacity
            key={option.value}
            onPress={() => setFrequency(option.value)}
            style={{
              backgroundColor:
                frequency === option.value ? config.color + "20" : C.card,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1.5,
              borderColor: frequency === option.value ? config.color : C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: frequency === option.value ? "700" : "600",
                color: frequency === option.value ? config.color : C.warmBrown,
              }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {frequency === ROUTINE_FREQUENCY.WEEKLY && (
        <>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 12,
            }}
          >
            Preferred Day
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => setPreferredDay(index)}
                  style={{
                    width: 45,
                    height: 45,
                    borderRadius: 23,
                    backgroundColor:
                      preferredDay === index ? config.color : C.sand,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor:
                      preferredDay === index ? config.color : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: preferredDay === index ? "#FFF" : C.mutedBrown,
                    }}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              ),
            )}
          </View>
        </>
      )}

      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 12,
        }}
      >
        Preferred Time
      </Text>
      <View style={{ marginBottom: 20 }}>
        <TimeField value={preferredTime} onChange={setPreferredTime} />
      </View>

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
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.warmBrown }}>
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
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.warmBrown }}>
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
        placeholder="Any special notes..."
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
    </KeyboardSafeFormModal>
  );
}
