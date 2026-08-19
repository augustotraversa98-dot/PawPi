import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert } from "react-native";
import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import TimeField from "@/components/TimeField";
import useRemindersStore from "@/store/remindersStore";
import {
  REMINDER_TYPES,
  REMINDER_TYPE_CONFIG,
  REPEAT_RULES,
  PRIORITY_LEVELS,
  PHOTO_CHECK_AREAS,
  DEFAULT_PHOTO_FREQUENCIES,
} from "@/data/remindersData";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sand: "#F5EDE4",
  sage: "#A7BFA3",
};

const REPEAT_LABELS = {
  [REPEAT_RULES.ONCE]: "Once",
  [REPEAT_RULES.DAILY]: "Daily",
  [REPEAT_RULES.WEEKLY]: "Weekly",
  [REPEAT_RULES.BIWEEKLY]: "Every 2 weeks",
  [REPEAT_RULES.MONTHLY]: "Monthly",
};

const BODY_AREA_LABELS = {
  [PHOTO_CHECK_AREAS.PAWS]: "Paws",
  [PHOTO_CHECK_AREAS.EARS]: "Ears",
  [PHOTO_CHECK_AREAS.EYES]: "Eyes",
  [PHOTO_CHECK_AREAS.TEETH]: "Teeth",
  [PHOTO_CHECK_AREAS.SKIN_FUR]: "Skin / Fur",
  [PHOTO_CHECK_AREAS.FACE]: "Face",
  [PHOTO_CHECK_AREAS.FULL_BODY]: "Full Body",
};

export default function ReminderCreationModal({ visible, onClose }) {
  const { t } = useTranslation();
  const { addReminder } = useRemindersStore();

  const [selectedType, setSelectedType] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedTime, setSelectedTime] = useState("09:00");
  const [repeatRule, setRepeatRule] = useState(REPEAT_RULES.ONCE);
  const [bodyArea, setBodyArea] = useState(null);
  const [notes, setNotes] = useState("");
  const [timeSensitive, setTimeSensitive] = useState(false);

  const handleCreate = () => {
    if (!selectedType) {
      Alert.alert(t("health.reminders.creation.missingTypeTitle"), t("health.reminders.creation.missingTypeBody"));
      return;
    }

    if (!title.trim()) {
      Alert.alert(t("health.reminders.creation.missingTitleTitle"), t("health.reminders.creation.missingTitleBody"));
      return;
    }

    const newReminder = {
      id: `rem_${Date.now()}`,
      petId: null,
      type: selectedType,
      title: title.trim(),
      description: description.trim() || `Reminder for ${title}`,
      date: selectedDate,
      time: selectedTime,
      nextTriggerAt: new Date(`${selectedDate}T${selectedTime}`).toISOString(),
      repeatRule,
      status: "upcoming",
      priority: timeSensitive
        ? PRIORITY_LEVELS.TIME_SENSITIVE
        : PRIORITY_LEVELS.NORMAL,
      timeSensitive,
      notificationEnabled: true,
      scheduledNotificationId: `notif_${Date.now()}`,
      relatedTracker: getRelatedTracker(selectedType),
      relatedBodyArea:
        selectedType === REMINDER_TYPES.PHOTO_CHECK ? bodyArea : null,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      snoozedUntil: null,
    };

    addReminder(newReminder);
    Alert.alert(
      t("health.reminders.creation.createdTitle"),
      t("health.reminders.creation.createdBody", { title }),
    );
    handleClose();
  };

  const getRelatedTracker = (type) => {
    const trackerMap = {
      [REMINDER_TYPES.FEEDING]: "food_water",
      [REMINDER_TYPES.WATER]: "food_water",
      [REMINDER_TYPES.WALK]: "walk_activity",
      [REMINDER_TYPES.MEDICATION]: "medication",
      [REMINDER_TYPES.PREVENTIVE]: "medication",
      [REMINDER_TYPES.VACCINE]: "vet_record",
      [REMINDER_TYPES.VET_APPOINTMENT]: "vet_record",
      [REMINDER_TYPES.GENERAL_CHECK]: "general_check",
      [REMINDER_TYPES.WEIGHT_CHECK]: "weight",
      [REMINDER_TYPES.PHOTO_CHECK]: "photo_check",
    };
    return trackerMap[type] || null;
  };

  const handleClose = () => {
    setSelectedType(null);
    setTitle("");
    setDescription("");
    setSelectedDate(new Date().toISOString().split("T")[0]);
    setSelectedTime("09:00");
    setRepeatRule(REPEAT_RULES.ONCE);
    setBodyArea(null);
    setNotes("");
    setTimeSensitive(false);
    onClose();
  };

  return (
    <KeyboardSafeFormModal
      visible={visible}
      onClose={handleClose}
      title="Create Reminder"
      ctaLabel="Create Reminder"
      ctaColor={C.coral}
      onCtaPress={handleCreate}
      backgroundColor={C.cream}
    >
      {/* Type Selection */}
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 12,
        }}
      >
        Reminder Type *
      </Text>
      <View style={{ gap: 10, marginBottom: 24 }}>
        {Object.entries(REMINDER_TYPE_CONFIG).map(([type, config]) => {
          const isSelected = selectedType === type;
          return (
            <TouchableOpacity
              key={type}
              onPress={() => {
                setSelectedType(type);
                // Auto-fill defaults
                if (!title) setTitle(config.label);
                if (type === REMINDER_TYPES.PHOTO_CHECK && !bodyArea) {
                  setBodyArea(PHOTO_CHECK_AREAS.PAWS);
                  setRepeatRule(
                    DEFAULT_PHOTO_FREQUENCIES[PHOTO_CHECK_AREAS.PAWS],
                  );
                }
              }}
              style={{
                backgroundColor: isSelected ? config.color + "15" : C.card,
                borderRadius: 14,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: isSelected ? config.color : C.peach,
              }}
            >
              <Text style={{ fontSize: 24, marginRight: 12 }}>
                {config.icon}
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: isSelected ? "700" : "600",
                  color: C.warmBrown,
                  flex: 1,
                }}
              >
                {config.label}
              </Text>
              {isSelected && <Check size={18} color={config.color} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Photo Check Body Area (conditional) */}
      {selectedType === REMINDER_TYPES.PHOTO_CHECK && (
        <>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 12,
            }}
          >
            Body Area *
          </Text>
          <View style={{ gap: 10, marginBottom: 24 }}>
            {Object.entries(BODY_AREA_LABELS).map(([area, label]) => {
              const isSelected = bodyArea === area;
              return (
                <TouchableOpacity
                  key={area}
                  onPress={() => {
                    setBodyArea(area);
                    setRepeatRule(DEFAULT_PHOTO_FREQUENCIES[area]);
                    setTitle(`${label} photo check`);
                  }}
                  style={{
                    backgroundColor: isSelected ? C.coral + "15" : C.card,
                    borderRadius: 12,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: isSelected ? C.coral : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isSelected ? "700" : "600",
                      color: C.warmBrown,
                      flex: 1,
                    }}
                  >
                    {label}
                  </Text>
                  {isSelected && <Check size={16} color={C.coral} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Title */}
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 12,
        }}
      >
        Title *
      </Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t("health.reminders.creation.titlePlaceholder")}
        placeholderTextColor={C.mutedBrown}
        style={{
          backgroundColor: C.card,
          borderRadius: 12,
          padding: 14,
          fontSize: 15,
          color: C.warmBrown,
          borderWidth: 1,
          borderColor: C.peach,
          marginBottom: 24,
        }}
      />

      {/* Description */}
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 12,
        }}
      >
        Description
      </Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={t("health.reminders.creation.descriptionPlaceholder")}
        placeholderTextColor={C.mutedBrown}
        multiline
        numberOfLines={3}
        style={{
          backgroundColor: C.card,
          borderRadius: 12,
          padding: 14,
          fontSize: 14,
          color: C.warmBrown,
          borderWidth: 1,
          borderColor: C.peach,
          marginBottom: 24,
          minHeight: 80,
          textAlignVertical: "top",
        }}
      />

      {/* Time */}
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 12,
        }}
      >
        Time
      </Text>
      <View style={{ marginBottom: 24 }}>
        <TimeField
          value={selectedTime}
          onChange={setSelectedTime}
          fieldStyle={{ padding: 14 }}
        />
      </View>

      {/* Repeat */}
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 12,
        }}
      >
        Repeat
      </Text>
      <View style={{ gap: 10, marginBottom: 24 }}>
        {Object.entries(REPEAT_LABELS).map(([rule, label]) => {
          const isSelected = repeatRule === rule;
          return (
            <TouchableOpacity
              key={rule}
              onPress={() => setRepeatRule(rule)}
              style={{
                backgroundColor: isSelected ? C.sage + "15" : C.card,
                borderRadius: 12,
                padding: 12,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: isSelected ? C.sage : C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: isSelected ? "700" : "600",
                  color: C.warmBrown,
                  flex: 1,
                }}
              >
                {label}
              </Text>
              {isSelected && <Check size={16} color={C.sage} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Time-sensitive toggle */}
      <TouchableOpacity
        onPress={() => setTimeSensitive(!timeSensitive)}
        style={{
          backgroundColor: timeSensitive ? C.coral + "15" : C.card,
          borderRadius: 12,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1.5,
          borderColor: timeSensitive ? C.coral : C.peach,
          marginBottom: 24,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 2,
            }}
          >
            Time-sensitive reminder
          </Text>
          <Text style={{ fontSize: 12, color: C.mutedBrown }}>
            Show prominent countdown and notifications
          </Text>
        </View>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: timeSensitive ? C.coral : C.sand,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: timeSensitive ? 0 : 1,
            borderColor: C.peach,
          }}
        >
          {timeSensitive && <Check size={14} color="#FFF" />}
        </View>
      </TouchableOpacity>

      {/* Notes */}
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 12,
        }}
      >
        Notes
      </Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder={t("health.reminders.creation.notesPlaceholder")}
        placeholderTextColor={C.mutedBrown}
        multiline
        numberOfLines={2}
        style={{
          backgroundColor: C.card,
          borderRadius: 12,
          padding: 14,
          fontSize: 14,
          color: C.warmBrown,
          borderWidth: 1,
          borderColor: C.peach,
          minHeight: 60,
          textAlignVertical: "top",
        }}
      />
    </KeyboardSafeFormModal>
  );
}
