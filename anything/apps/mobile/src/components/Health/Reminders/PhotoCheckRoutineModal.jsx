import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { Check, ChevronDown, ChevronUp } from "lucide-react-native";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import { CADENCE_LABELS } from "./CadenceFrequencySelector";
import { DAY_CHIP_LABELS } from "./DayChips";
import ScheduleBlock, {
  scheduleFromItem,
  defaultSchedule,
} from "./ScheduleBlock";
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

const ACCENT = "#4DB8E8";

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

// =========================================================================
// Per-area schedule object = ScheduleBlock's canonical fields (frequency /
// preferredTime / startDate / preferredDay / days / intervalHours /
// reminderTiming) PLUS the toggles + notes ScheduleBlock does NOT own. Same
// shape for the shared "same schedule" object and each custom-area entry. The
// two pure helpers below are the single source of truth for the load + save
// transforms, so the JSONB round-trips through ScheduleBlock unchanged.
// =========================================================================

// Pure: a fresh per-area schedule, seeded from the area's recommended cadence
// (defaultFreq) via defaultSchedule(today, ...) — mirrors wellness's new-item
// seeding. Toggles/notes get their existing defaults.
export function newPhotoSchedule(defaultFreq) {
  return {
    ...defaultSchedule(new Date(), defaultFreq ? { frequency: defaultFreq } : {}),
    reminderEnabled: true,
    timeSensitive: false,
    notes: "",
  };
}

// Pure: build the in-state schedule object from a stored photoCheckSchedule
// entry (or a legacy single-area shape). Canonical ScheduleBlock fields via
// scheduleFromItem + the toggles/notes it doesn't own. Back-compat: a
// pre-redesign entry lacks startDate/days/intervalHours/reminderTiming, so
// scheduleFromItem supplies "" / [] / 4 / "on_time" and it loads unchanged.
export function photoScheduleFromEntry(entry = {}) {
  return {
    ...scheduleFromItem(entry),
    reminderEnabled: entry.reminderEnabled ?? true,
    timeSensitive: entry.timeSensitive ?? false,
    notes: entry.notes || "",
  };
}

// Pure: build one persisted photoCheckSchedule entry (JSONB) from a body area +
// its in-state schedule object. Single source of truth for the save shape,
// carrying the ScheduleBlock fields the generator reads (startDate / days /
// intervalHours) plus reminderTiming and the existing toggles/notes. Empty
// startDate persists as null so the generator anchors on routine.createdAt.
export function photoScheduleEntry(bodyArea, sched = {}) {
  return {
    bodyArea,
    frequency: sched.frequency,
    preferredDay: sched.preferredDay,
    preferredTime: sched.preferredTime,
    startDate: sched.startDate || null,
    days: Array.isArray(sched.days) ? sched.days : [],
    intervalHours: sched.intervalHours ?? null,
    reminderTiming: sched.reminderTiming || null,
    reminderEnabled: sched.reminderEnabled,
    timeSensitive: sched.timeSensitive,
    notes: sched.notes,
  };
}

// Deep-equal for the day arrays (Mon=0); element-wise so a per-area difference
// in days[] opens the routine in custom mode.
function sameDays(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

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

  // Shared schedule object for the "same schedule for all areas" path.
  const [sharedSchedule, setSharedSchedule] = useState(() => newPhotoSchedule());

  // Custom schedules per body area (same object shape as sharedSchedule).
  const [customSchedules, setCustomSchedules] = useState({});

  // Expand/collapse custom schedule cards
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

        // Check if all schedules are the same — compares the ScheduleBlock
        // fields too (startDate / days / intervalHours / reminderTiming), so a
        // per-area difference in any of them correctly opens in custom mode.
        const first = editingRoutine.photoCheckSchedule[0];
        const allSame = editingRoutine.photoCheckSchedule.every(
          (s) =>
            s.frequency === first.frequency &&
            s.preferredDay === first.preferredDay &&
            s.preferredTime === first.preferredTime &&
            s.reminderEnabled === first.reminderEnabled &&
            s.timeSensitive === first.timeSensitive &&
            (s.startDate || null) === (first.startDate || null) &&
            (s.intervalHours ?? null) === (first.intervalHours ?? null) &&
            (s.reminderTiming || null) === (first.reminderTiming || null) &&
            sameDays(s.days, first.days),
        );

        if (allSame) {
          setScheduleMode("same");
          setSharedSchedule(photoScheduleFromEntry(first));
        } else {
          setScheduleMode("custom");
          const schedules = {};
          editingRoutine.photoCheckSchedule.forEach((s) => {
            schedules[s.bodyArea] = photoScheduleFromEntry(s);
          });
          setCustomSchedules(schedules);
        }
      } else if (editingRoutine.bodyArea) {
        // Old single-area format - migrate
        setSelectedBodyAreas([editingRoutine.bodyArea]);
        setScheduleMode("same");
        setSharedSchedule(
          photoScheduleFromEntry({
            frequency: editingRoutine.frequency,
            preferredDay: editingRoutine.preferredDay,
            preferredTime: editingRoutine.times?.[0],
            reminderEnabled: editingRoutine.notificationEnabled,
            timeSensitive: editingRoutine.timeSensitive,
            notes: editingRoutine.notes,
          }),
        );
      }
    } else {
      // New routine - reset to defaults
      setSelectedBodyAreas(["paws"]);
      setScheduleMode("same");
      setSharedSchedule(newPhotoSchedule());
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
      // Seed the custom schedule from the area's recommended cadence
      const area = BODY_AREAS.find((a) => a.value === areaValue);
      if (scheduleMode === "custom") {
        setCustomSchedules({
          ...customSchedules,
          [areaValue]: newPhotoSchedule(area?.defaultFreq),
        });
      }
    }
  };

  // Merge a ScheduleBlock's emitted canonical object into a custom area's
  // schedule, preserving the toggles/notes it doesn't own.
  const handleCustomScheduleChange = (areaValue, schedule) => {
    setCustomSchedules((prev) => ({
      ...prev,
      [areaValue]: { ...prev[areaValue], ...schedule },
    }));
  };

  // Update a single non-ScheduleBlock field (reminderEnabled / timeSensitive /
  // notes) on a custom area's schedule.
  const updateCustomScheduleField = (areaValue, field, value) => {
    setCustomSchedules((prev) => ({
      ...prev,
      [areaValue]: { ...prev[areaValue], [field]: value },
    }));
  };

  const toggleExpandArea = (areaValue) => {
    setExpandedAreas({
      ...expandedAreas,
      [areaValue]: !expandedAreas[areaValue],
    });
  };

  const handleScheduleModeChange = (mode) => {
    if (mode === "custom" && scheduleMode === "same") {
      // Initialize custom schedules from the shared schedule
      const newSchedules = {};
      selectedBodyAreas.forEach((areaValue) => {
        newSchedules[areaValue] = { ...sharedSchedule };
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

    // Build photoCheckSchedule array (carries the ScheduleBlock fields the
    // reminder generator reads, per area).
    const photoCheckSchedule = selectedBodyAreas.map((bodyArea) => {
      const sched =
        scheduleMode === "same"
          ? sharedSchedule
          : customSchedules[bodyArea] ||
            newPhotoSchedule(
              BODY_AREAS.find((a) => a.value === bodyArea)?.defaultFreq,
            );
      return photoScheduleEntry(bodyArea, sched);
    });

    const primary = photoCheckSchedule[0];
    const routine = {
      type: ROUTINE_TYPES.PHOTO_CHECK,
      petId: editingRoutine?.petId || "phoebe",
      isActive: true,
      photoCheckSchedule,
      // Legacy fields for backward compatibility
      bodyArea: selectedBodyAreas[0], // Use first selected area as primary
      frequency: primary.frequency,
      preferredDay: primary.preferredDay,
      times: [primary.preferredTime],
      days: primary.days?.length ? primary.days : [primary.preferredDay],
      notificationEnabled: primary.reminderEnabled,
      timeSensitive: primary.timeSensitive,
      notes: primary.notes,
      title: "Photo Check",
      description: `Photo check for ${selectedBodyAreas.length} area${selectedBodyAreas.length > 1 ? "s" : ""}`,
    };

    if (editingRoutine?.id) routine.id = editingRoutine.id;
    onSave(routine);
    onClose();
  };

  return (
    <KeyboardSafeFormModal
      visible={visible}
      onClose={onClose}
      title={`${editingRoutine ? "Edit" : "Create"} Photo Check`}
      subtitle="Visual health monitoring"
      icon="📸"
      ctaLabel={editingRoutine ? "Save Changes" : "Create Routine"}
      ctaColor={ACCENT}
      onCtaPress={handleSave}
      backgroundColor={C.cream}
    >
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
                backgroundColor: isSelected ? ACCENT + "20" : C.card,
                borderRadius: 14,
                padding: 16,
                borderWidth: 1.5,
                borderColor: isSelected ? ACCENT : C.peach,
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
                    backgroundColor: ACCENT,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: 10,
                  }}
                >
                  <Check size={14} color="#FFF" strokeWidth={3} />
                </View>
              )}
              <Text style={{ fontSize: 28, marginRight: 12 }}>{area.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: isSelected ? "700" : "600",
                    color: isSelected ? ACCENT : C.warmBrown,
                  }}
                >
                  {area.label}
                </Text>
                <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                  Recommended: {CADENCE_LABELS[area.defaultFreq] || "Monthly"}
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
                backgroundColor: scheduleMode === "same" ? ACCENT + "20" : C.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1.5,
                borderColor: scheduleMode === "same" ? ACCENT : C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: scheduleMode === "same" ? "700" : "600",
                  color: scheduleMode === "same" ? ACCENT : C.warmBrown,
                }}
              >
                Use same schedule for all selected areas
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleScheduleModeChange("custom")}
              style={{
                backgroundColor:
                  scheduleMode === "custom" ? ACCENT + "20" : C.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1.5,
                borderColor: scheduleMode === "custom" ? ACCENT : C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: scheduleMode === "custom" ? "700" : "600",
                  color: scheduleMode === "custom" ? ACCENT : C.warmBrown,
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
          {/* Schedule — date, time, frequency (full cadence list), conditional
              sub-controls, and early reminder */}
          <ScheduleBlock
            value={scheduleFromItem(sharedSchedule)}
            onChange={(schedule) =>
              setSharedSchedule((prev) => ({ ...prev, ...schedule }))
            }
            color={ACCENT}
            style={{ marginBottom: 20 }}
            testID="schedule-shared"
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
                value={sharedSchedule.reminderEnabled}
                onValueChange={(value) =>
                  setSharedSchedule((prev) => ({
                    ...prev,
                    reminderEnabled: value,
                  }))
                }
                trackColor={{ false: C.sand, true: C.sage + "60" }}
                thumbColor={sharedSchedule.reminderEnabled ? C.sage : C.peach}
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
                value={sharedSchedule.timeSensitive}
                onValueChange={(value) =>
                  setSharedSchedule((prev) => ({
                    ...prev,
                    timeSensitive: value,
                  }))
                }
                trackColor={{ false: C.sand, true: C.coral + "60" }}
                thumbColor={sharedSchedule.timeSensitive ? C.coral : C.peach}
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
            value={sharedSchedule.notes}
            onChangeText={(value) =>
              setSharedSchedule((prev) => ({ ...prev, notes: value }))
            }
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
            const schedule =
              customSchedules[areaValue] || newPhotoSchedule(area?.defaultFreq);
            const isExpanded = expandedAreas[areaValue];
            const isDayCadence =
              schedule.frequency === ROUTINE_FREQUENCY.WEEKLY ||
              schedule.frequency === ROUTINE_FREQUENCY.BIWEEKLY;
            const dayLabel =
              isDayCadence && schedule.days?.length
                ? ` · ${schedule.days.map((d) => DAY_CHIP_LABELS[d]).join(", ")}`
                : "";

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
                        {CADENCE_LABELS[schedule.frequency] || "Monthly"}
                        {dayLabel} at {schedule.preferredTime}
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
                    {/* Schedule — date, time, frequency (full cadence list),
                        conditional sub-controls, and early reminder */}
                    <ScheduleBlock
                      value={scheduleFromItem(schedule)}
                      onChange={(next) =>
                        handleCustomScheduleChange(areaValue, next)
                      }
                      color={ACCENT}
                      style={{ marginBottom: 12 }}
                      testID={`schedule-${areaValue}`}
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
                          updateCustomScheduleField(
                            areaValue,
                            "reminderEnabled",
                            val,
                          )
                        }
                        trackColor={{ false: C.sand, true: C.sage + "60" }}
                        thumbColor={schedule.reminderEnabled ? C.sage : C.peach}
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
                          updateCustomScheduleField(
                            areaValue,
                            "timeSensitive",
                            val,
                          )
                        }
                        trackColor={{ false: C.sand, true: C.coral + "60" }}
                        thumbColor={schedule.timeSensitive ? C.coral : C.peach}
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
                        updateCustomScheduleField(areaValue, "notes", val)
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
    </KeyboardSafeFormModal>
  );
}
