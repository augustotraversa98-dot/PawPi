import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { X, Check, ChevronDown, ChevronUp } from "lucide-react-native";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "@/data/routinesData";

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

const BODY_AREAS = [
  {
    value: "paws",
    label: "Paws",
    icon: "🐾",
    defaultFreq: ROUTINE_FREQUENCY.WEEKLY,
  },
  {
    value: "ears",
    label: "Ears",
    icon: "👂",
    defaultFreq: ROUTINE_FREQUENCY.BIWEEKLY,
  },
  {
    value: "eyes",
    label: "Eyes",
    icon: "👁️",
    defaultFreq: ROUTINE_FREQUENCY.WEEKLY,
  },
  {
    value: "teeth",
    label: "Teeth",
    icon: "🦷",
    defaultFreq: ROUTINE_FREQUENCY.MONTHLY,
  },
  {
    value: "skin_fur",
    label: "Skin / Fur",
    icon: "🧴",
    defaultFreq: ROUTINE_FREQUENCY.MONTHLY,
  },
  {
    value: "face",
    label: "Face",
    icon: "😊",
    defaultFreq: ROUTINE_FREQUENCY.MONTHLY,
  },
  {
    value: "full_body",
    label: "Full Body",
    icon: "🔍",
    defaultFreq: ROUTINE_FREQUENCY.MONTHLY,
  },
  {
    value: "other",
    label: "Other",
    icon: "📋",
    defaultFreq: ROUTINE_FREQUENCY.MONTHLY,
  },
];

export default function PhotoCheckRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
}) {
  // Multi-select body areas
  const [selectedBodyAreas, setSelectedBodyAreas] = useState(["paws"]);

  // Schedule mode: "same" or "custom"
  const [scheduleMode, setScheduleMode] = useState("same");

  // Same schedule for all
  const [frequency, setFrequency] = useState(ROUTINE_FREQUENCY.WEEKLY);
  const [preferredDay, setPreferredDay] = useState(6); // Sunday
  const [preferredTime, setPreferredTime] = useState("10:00");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [timeSensitive, setTimeSensitive] = useState(false);
  const [notes, setNotes] = useState("");

  // Custom schedules per body area
  const [customSchedules, setCustomSchedules] = useState({});

  // Expand/collapse custom schedules
  const [expandedAreas, setExpandedAreas] = useState({});

  useEffect(() => {
    if (editingRoutine) {
      // Load existing routine
      if (
        editingRoutine.photoCheckSchedule &&
        Array.isArray(editingRoutine.photoCheckSchedule)
      ) {
        // New multi-area format
        const areas = editingRoutine.photoCheckSchedule.map((s) => s.bodyArea);
        setSelectedBodyAreas(areas);

        // Check if all schedules are the same
        const first = editingRoutine.photoCheckSchedule[0];
        const allSame = editingRoutine.photoCheckSchedule.every(
          (s) =>
            s.frequency === first.frequency &&
            s.preferredDay === first.preferredDay &&
            s.preferredTime === first.preferredTime &&
            s.reminderEnabled === first.reminderEnabled &&
            s.timeSensitive === first.timeSensitive,
        );

        if (allSame) {
          setScheduleMode("same");
          setFrequency(first.frequency || ROUTINE_FREQUENCY.WEEKLY);
          setPreferredDay(first.preferredDay ?? 6);
          setPreferredTime(first.preferredTime || "10:00");
          setReminderEnabled(first.reminderEnabled ?? true);
          setTimeSensitive(first.timeSensitive ?? false);
          setNotes(first.notes || "");
        } else {
          setScheduleMode("custom");
          const schedules = {};
          editingRoutine.photoCheckSchedule.forEach((s) => {
            schedules[s.bodyArea] = {
              frequency: s.frequency || ROUTINE_FREQUENCY.WEEKLY,
              preferredDay: s.preferredDay ?? 6,
              preferredTime: s.preferredTime || "10:00",
              reminderEnabled: s.reminderEnabled ?? true,
              timeSensitive: s.timeSensitive ?? false,
              notes: s.notes || "",
            };
          });
          setCustomSchedules(schedules);
        }
      } else if (editingRoutine.bodyArea) {
        // Old single-area format - migrate
        setSelectedBodyAreas([editingRoutine.bodyArea]);
        setScheduleMode("same");
        setFrequency(editingRoutine.frequency || ROUTINE_FREQUENCY.WEEKLY);
        setPreferredDay(editingRoutine.preferredDay ?? 6);
        setPreferredTime(editingRoutine.times?.[0] || "10:00");
        setReminderEnabled(editingRoutine.notificationEnabled ?? true);
        setTimeSensitive(editingRoutine.timeSensitive ?? false);
        setNotes(editingRoutine.notes || "");
      }
    } else {
      // New routine - reset to defaults
      setSelectedBodyAreas(["paws"]);
      setScheduleMode("same");
      setFrequency(ROUTINE_FREQUENCY.WEEKLY);
      setPreferredDay(6);
      setPreferredTime("10:00");
      setReminderEnabled(true);
      setTimeSensitive(false);
      setNotes("");
      setCustomSchedules({});
      setExpandedAreas({});
    }
  }, [editingRoutine, visible]);

  const toggleBodyArea = (areaValue) => {
    if (selectedBodyAreas.includes(areaValue)) {
      // Unselect
      setSelectedBodyAreas(selectedBodyAreas.filter((a) => a !== areaValue));
      // Remove custom schedule if exists
      const newSchedules = { ...customSchedules };
      delete newSchedules[areaValue];
      setCustomSchedules(newSchedules);
    } else {
      // Select
      setSelectedBodyAreas([...selectedBodyAreas, areaValue]);
      // Initialize custom schedule with default frequency
      const area = BODY_AREAS.find((a) => a.value === areaValue);
      if (scheduleMode === "custom") {
        setCustomSchedules({
          ...customSchedules,
          [areaValue]: {
            frequency: area?.defaultFreq || ROUTINE_FREQUENCY.WEEKLY,
            preferredDay: 6,
            preferredTime: "10:00",
            reminderEnabled: true,
            timeSensitive: false,
            notes: "",
          },
        });
      }
    }
  };

  const updateCustomSchedule = (bodyArea, field, value) => {
    setCustomSchedules({
      ...customSchedules,
      [bodyArea]: {
        ...customSchedules[bodyArea],
        [field]: value,
      },
    });
  };

  const toggleExpandArea = (areaValue) => {
    setExpandedAreas({
      ...expandedAreas,
      [areaValue]: !expandedAreas[areaValue],
    });
  };

  const handleScheduleModeChange = (mode) => {
    if (mode === "custom" && scheduleMode === "same") {
      // Initialize custom schedules from same schedule
      const newSchedules = {};
      selectedBodyAreas.forEach((areaValue) => {
        newSchedules[areaValue] = {
          frequency,
          preferredDay,
          preferredTime,
          reminderEnabled,
          timeSensitive,
          notes,
        };
      });
      setCustomSchedules(newSchedules);
    }
    setScheduleMode(mode);
  };

  const handleSave = () => {
    // Validate at least one body area selected
    if (selectedBodyAreas.length === 0) {
      Alert.alert("Select at least one photo check area.");
      return;
    }

    // Build photoCheckSchedule array
    const photoCheckSchedule = selectedBodyAreas.map((bodyArea) => {
      if (scheduleMode === "same") {
        return {
          bodyArea,
          frequency,
          preferredDay,
          preferredTime,
          reminderEnabled,
          timeSensitive,
          notes,
        };
      } else {
        const schedule = customSchedules[bodyArea] || {
          frequency: ROUTINE_FREQUENCY.WEEKLY,
          preferredDay: 6,
          preferredTime: "10:00",
          reminderEnabled: true,
          timeSensitive: false,
          notes: "",
        };
        return {
          bodyArea,
          ...schedule,
        };
      }
    });

    const routine = {
      type: ROUTINE_TYPES.PHOTO_CHECK,
      petId: "phoebe",
      isActive: true,
      photoCheckSchedule,
      // Legacy fields for backward compatibility
      bodyArea: selectedBodyAreas[0], // Use first selected area as primary
      frequency:
        scheduleMode === "same" ? frequency : photoCheckSchedule[0].frequency,
      preferredDay:
        scheduleMode === "same"
          ? preferredDay
          : photoCheckSchedule[0].preferredDay,
      times:
        scheduleMode === "same"
          ? [preferredTime]
          : [photoCheckSchedule[0].preferredTime],
      days:
        scheduleMode === "same"
          ? [preferredDay]
          : [photoCheckSchedule[0].preferredDay],
      notificationEnabled: reminderEnabled,
      timeSensitive:
        scheduleMode === "same"
          ? timeSensitive
          : photoCheckSchedule[0].timeSensitive,
      notes: scheduleMode === "same" ? notes : photoCheckSchedule[0].notes,
      title: "Photo Check",
      description: `Photo check for ${selectedBodyAreas.length} area${selectedBodyAreas.length > 1 ? "s" : ""}`,
    };

    if (editingRoutine) routine.id = editingRoutine.id;
    onSave(routine);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={{ flex: 1, backgroundColor: C.cream }}>
        {/* Header */}
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
              📸 {editingRoutine ? "Edit" : "Create"} Photo Check
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown }}>
              Visual health monitoring
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

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
          {/* Body Areas - Multi-select */}
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 8,
            }}
          >
            Body Areas
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: C.mutedBrown,
              marginBottom: 12,
            }}
          >
            Select one or more areas to track
          </Text>
          <View style={{ gap: 10, marginBottom: 24 }}>
            {BODY_AREAS.map((area) => {
              const isSelected = selectedBodyAreas.includes(area.value);
              return (
                <TouchableOpacity
                  key={area.value}
                  onPress={() => toggleBodyArea(area.value)}
                  style={{
                    backgroundColor: isSelected ? "#4DB8E8" + "20" : C.card,
                    borderRadius: 14,
                    padding: 16,
                    borderWidth: 1.5,
                    borderColor: isSelected ? "#4DB8E8" : C.peach,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  {isSelected && (
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: "#4DB8E8",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 10,
                      }}
                    >
                      <Check size={14} color="#FFF" strokeWidth={3} />
                    </View>
                  )}
                  <Text style={{ fontSize: 28, marginRight: 12 }}>
                    {area.icon}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: isSelected ? "700" : "600",
                        color: isSelected ? "#4DB8E8" : C.warmBrown,
                      }}
                    >
                      {area.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                      Recommended:{" "}
                      {area.defaultFreq === ROUTINE_FREQUENCY.WEEKLY
                        ? "Weekly"
                        : area.defaultFreq === ROUTINE_FREQUENCY.BIWEEKLY
                          ? "Every 2 weeks"
                          : "Monthly"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Schedule Mode Selection */}
          {selectedBodyAreas.length > 0 && (
            <>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 12,
                }}
              >
                Schedule
              </Text>
              <View style={{ gap: 8, marginBottom: 20 }}>
                <TouchableOpacity
                  onPress={() => handleScheduleModeChange("same")}
                  style={{
                    backgroundColor:
                      scheduleMode === "same" ? "#4DB8E8" + "20" : C.card,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: scheduleMode === "same" ? "#4DB8E8" : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: scheduleMode === "same" ? "700" : "600",
                      color: scheduleMode === "same" ? "#4DB8E8" : C.warmBrown,
                    }}
                  >
                    Use same schedule for all selected areas
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleScheduleModeChange("custom")}
                  style={{
                    backgroundColor:
                      scheduleMode === "custom" ? "#4DB8E8" + "20" : C.card,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor:
                      scheduleMode === "custom" ? "#4DB8E8" : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: scheduleMode === "custom" ? "700" : "600",
                      color:
                        scheduleMode === "custom" ? "#4DB8E8" : C.warmBrown,
                    }}
                  >
                    Customize per area
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Same Schedule for All */}
          {selectedBodyAreas.length > 0 && scheduleMode === "same" && (
            <>
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
                  { value: ROUTINE_FREQUENCY.WEEKLY, label: "Weekly" },
                  { value: ROUTINE_FREQUENCY.BIWEEKLY, label: "Every 2 weeks" },
                  { value: ROUTINE_FREQUENCY.MONTHLY, label: "Monthly" },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setFrequency(option.value)}
                    style={{
                      backgroundColor:
                        frequency === option.value ? "#4DB8E8" + "20" : C.card,
                      borderRadius: 12,
                      padding: 14,
                      borderWidth: 1.5,
                      borderColor:
                        frequency === option.value ? "#4DB8E8" : C.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: frequency === option.value ? "700" : "600",
                        color:
                          frequency === option.value ? "#4DB8E8" : C.warmBrown,
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
                          preferredDay === index ? "#4DB8E8" : C.sand,
                        justifyContent: "center",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor:
                          preferredDay === index ? "#4DB8E8" : C.peach,
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
              <TextInput
                value={preferredTime}
                onChangeText={setPreferredTime}
                placeholder="HH:MM"
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
                placeholder="What to look for..."
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
            </>
          )}

          {/* Custom Schedule Per Area */}
          {selectedBodyAreas.length > 0 && scheduleMode === "custom" && (
            <>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 12,
                }}
              >
                Custom Schedules
              </Text>
              {selectedBodyAreas.map((areaValue) => {
                const area = BODY_AREAS.find((a) => a.value === areaValue);
                const schedule = customSchedules[areaValue] || {
                  frequency: area?.defaultFreq || ROUTINE_FREQUENCY.WEEKLY,
                  preferredDay: 6,
                  preferredTime: "10:00",
                  reminderEnabled: true,
                  timeSensitive: false,
                  notes: "",
                };
                const isExpanded = expandedAreas[areaValue];

                return (
                  <View
                    key={areaValue}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 14,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: C.peach,
                      marginBottom: 12,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => toggleExpandArea(areaValue)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          flex: 1,
                        }}
                      >
                        <Text style={{ fontSize: 24, marginRight: 10 }}>
                          {area?.icon}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: "700",
                              color: C.warmBrown,
                            }}
                          >
                            {area?.label}
                          </Text>
                          <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                            {schedule.frequency === ROUTINE_FREQUENCY.WEEKLY
                              ? "Weekly"
                              : schedule.frequency ===
                                  ROUTINE_FREQUENCY.BIWEEKLY
                                ? "Every 2 weeks"
                                : "Monthly"}{" "}
                            ·{" "}
                            {
                              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                                schedule.preferredDay
                              ]
                            }{" "}
                            at {schedule.preferredTime}
                          </Text>
                        </View>
                      </View>
                      {isExpanded ? (
                        <ChevronUp size={20} color={C.mutedBrown} />
                      ) : (
                        <ChevronDown size={20} color={C.mutedBrown} />
                      )}
                    </TouchableOpacity>

                    {isExpanded && (
                      <View
                        style={{
                          marginTop: 16,
                          paddingTop: 16,
                          borderTopWidth: 1,
                          borderTopColor: C.peach,
                        }}
                      >
                        {/* Frequency */}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: C.warmBrown,
                            marginBottom: 8,
                          }}
                        >
                          Frequency
                        </Text>
                        <View style={{ gap: 6, marginBottom: 12 }}>
                          {[
                            {
                              value: ROUTINE_FREQUENCY.WEEKLY,
                              label: "Weekly",
                            },
                            {
                              value: ROUTINE_FREQUENCY.BIWEEKLY,
                              label: "Every 2 weeks",
                            },
                            {
                              value: ROUTINE_FREQUENCY.MONTHLY,
                              label: "Monthly",
                            },
                          ].map((option) => (
                            <TouchableOpacity
                              key={option.value}
                              onPress={() =>
                                updateCustomSchedule(
                                  areaValue,
                                  "frequency",
                                  option.value,
                                )
                              }
                              style={{
                                backgroundColor:
                                  schedule.frequency === option.value
                                    ? "#4DB8E8" + "20"
                                    : C.sand,
                                borderRadius: 10,
                                padding: 10,
                                borderWidth: 1,
                                borderColor:
                                  schedule.frequency === option.value
                                    ? "#4DB8E8"
                                    : C.peach,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight:
                                    schedule.frequency === option.value
                                      ? "700"
                                      : "600",
                                  color:
                                    schedule.frequency === option.value
                                      ? "#4DB8E8"
                                      : C.warmBrown,
                                }}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* Day */}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: C.warmBrown,
                            marginBottom: 8,
                          }}
                        >
                          Preferred Day
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 6,
                            marginBottom: 12,
                          }}
                        >
                          {[
                            "Sun",
                            "Mon",
                            "Tue",
                            "Wed",
                            "Thu",
                            "Fri",
                            "Sat",
                          ].map((day, index) => (
                            <TouchableOpacity
                              key={index}
                              onPress={() =>
                                updateCustomSchedule(
                                  areaValue,
                                  "preferredDay",
                                  index,
                                )
                              }
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor:
                                  schedule.preferredDay === index
                                    ? "#4DB8E8"
                                    : C.sand,
                                justifyContent: "center",
                                alignItems: "center",
                                borderWidth: 1,
                                borderColor:
                                  schedule.preferredDay === index
                                    ? "#4DB8E8"
                                    : C.peach,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "700",
                                  color:
                                    schedule.preferredDay === index
                                      ? "#FFF"
                                      : C.mutedBrown,
                                }}
                              >
                                {day}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* Time */}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: C.warmBrown,
                            marginBottom: 8,
                          }}
                        >
                          Preferred Time
                        </Text>
                        <TextInput
                          value={schedule.preferredTime}
                          onChangeText={(val) =>
                            updateCustomSchedule(
                              areaValue,
                              "preferredTime",
                              val,
                            )
                          }
                          placeholder="HH:MM"
                          placeholderTextColor={C.mutedBrown}
                          style={{
                            backgroundColor: C.sand,
                            borderRadius: 10,
                            padding: 10,
                            fontSize: 14,
                            color: C.warmBrown,
                            borderWidth: 1,
                            borderColor: C.peach,
                            marginBottom: 12,
                          }}
                        />

                        {/* Toggles */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: C.warmBrown,
                            }}
                          >
                            Reminder enabled
                          </Text>
                          <Switch
                            value={schedule.reminderEnabled}
                            onValueChange={(val) =>
                              updateCustomSchedule(
                                areaValue,
                                "reminderEnabled",
                                val,
                              )
                            }
                            trackColor={{ false: C.sand, true: C.sage + "60" }}
                            thumbColor={
                              schedule.reminderEnabled ? C.sage : C.peach
                            }
                          />
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: C.warmBrown,
                            }}
                          >
                            Time-sensitive
                          </Text>
                          <Switch
                            value={schedule.timeSensitive}
                            onValueChange={(val) =>
                              updateCustomSchedule(
                                areaValue,
                                "timeSensitive",
                                val,
                              )
                            }
                            trackColor={{ false: C.sand, true: C.coral + "60" }}
                            thumbColor={
                              schedule.timeSensitive ? C.coral : C.peach
                            }
                          />
                        </View>

                        {/* Notes */}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: C.warmBrown,
                            marginBottom: 8,
                          }}
                        >
                          Notes (optional)
                        </Text>
                        <TextInput
                          value={schedule.notes}
                          onChangeText={(val) =>
                            updateCustomSchedule(areaValue, "notes", val)
                          }
                          placeholder="What to look for..."
                          placeholderTextColor={C.mutedBrown}
                          multiline
                          numberOfLines={2}
                          style={{
                            backgroundColor: C.sand,
                            borderRadius: 10,
                            padding: 10,
                            fontSize: 13,
                            color: C.warmBrown,
                            borderWidth: 1,
                            borderColor: C.peach,
                            textAlignVertical: "top",
                          }}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>

        {/* Save Button */}
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
              backgroundColor: "#4DB8E8",
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
    </Modal>
  );
}
