import React from "react";
import { View, Text, TouchableOpacity, Switch } from "react-native";
import {
  Edit3,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react-native";
import {
  ROUTINE_TYPE_CONFIG,
  getScheduleSummary,
  getNextReminderPreview,
  ROUTINE_TYPES,
} from "@/data/routinesData";
import { addWalkToCalendar } from "@/utils/calendarIntegration";

const C = {
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

export default function RoutineCard({ routine, onEdit, onToggle }) {
  const config = ROUTINE_TYPE_CONFIG[routine.type];
  const scheduleSummary = getScheduleSummary(routine);
  const nextReminder = getNextReminderPreview(routine);

  // Get display label - for grouped types, show subtype info
  let displayLabel = config?.label || routine.title;
  let medicalCareItemsSummary = null;
  const careTypeLabels = {
    medication: "Medication",
    vaccine: "Vaccine",
    flea_tick: "Flea/tick prevention",
    deworming: "Deworming",
    heartworm: "Heartworm prevention",
    supplement: "Supplement",
    other: "Medical care",
  };
  if (
    routine.type === ROUTINE_TYPES.MEDICAL_CARE &&
    Array.isArray(routine.medicalCareItems) &&
    routine.medicalCareItems.length > 0
  ) {
    // New multi-item format
    displayLabel = "Medical Care";
    medicalCareItemsSummary = routine.medicalCareItems
      .map((it) => it.name || careTypeLabels[it.type] || "Item")
      .join(" · ");
  } else if (
    routine.type === ROUTINE_TYPES.MEDICAL_CARE &&
    routine.medicalCareSubtype
  ) {
    const careLabel =
      careTypeLabels[routine.medicalCareSubtype] || "Medical care";
    displayLabel = routine.name ? `${routine.name} · ${careLabel}` : careLabel;
  } else if (
    routine.type === ROUTINE_TYPES.WELLNESS_CHECK &&
    routine.wellnessCheckItems
  ) {
    const itemLabels = {
      general: "General",
      weight: "Weight",
      body_condition: "Body condition",
      mobility: "Mobility",
      mood_energy: "Mood",
      skin_coat: "Skin/Coat",
      appetite_hydration: "Appetite/Hydration",
      custom: "Custom",
    };
    const items = routine.wellnessCheckItems
      .map((item) => {
        if (typeof item === "string") {
          // Legacy format: array of check type strings
          return itemLabels[item];
        } else if (typeof item === "object" && item.checkType) {
          // New format: array of check item objects
          if (item.checkType === "custom" && item.customName) {
            return item.customName;
          }
          return itemLabels[item.checkType];
        }
        return null;
      })
      .filter(Boolean)
      .join(" · ");
    displayLabel = items || "Wellness Check";
  } else if (
    routine.type === ROUTINE_TYPES.MEDICATION &&
    routine.medicationName
  ) {
    displayLabel = `${routine.medicationName} · Medication`;
  } else if (routine.type === ROUTINE_TYPES.VACCINE && routine.name) {
    displayLabel = `${routine.name} · Vaccine`;
  } else if (routine.type === ROUTINE_TYPES.PREVENTIVE && routine.productName) {
    displayLabel = `${routine.productName} · Prevention`;
  }

  // For Photo Check routines, show selected body areas
  let photoCheckAreas = null;
  if (routine.type === ROUTINE_TYPES.PHOTO_CHECK) {
    // Support both new multi-area format and legacy single-area format
    const photoCheckSchedules =
      routine.photoCheckSchedule && Array.isArray(routine.photoCheckSchedule)
        ? routine.photoCheckSchedule
        : routine.bodyArea
          ? [{ bodyArea: routine.bodyArea }]
          : [];

    const activeSchedules = photoCheckSchedules.filter(
      (s) => s.reminderEnabled !== false,
    );

    if (activeSchedules.length > 0) {
      const areaLabels = {
        paws: "Paws",
        ears: "Ears",
        eyes: "Eyes",
        teeth: "Teeth",
        skin_fur: "Skin/Fur",
        face: "Face",
        full_body: "Full Body",
        other: "Other",
      };

      const areaNames = activeSchedules
        .map((s) => areaLabels[s.bodyArea] || s.bodyArea)
        .join(" · ");

      photoCheckAreas = areaNames;
    }
  }

  // Safety: Don't render empty walk routines
  if (routine.type === ROUTINE_TYPES.WALK) {
    const activeWalks = (routine.walks || []).filter(
      (w) => w.reminderEnabled !== false,
    );
    if (activeWalks.length === 0) {
      console.log("[RoutineCard] Skipping empty walk routine:", routine.id);
      return null;
    }
  }

  // Safety: Don't render empty feeding routines
  if (routine.type === ROUTINE_TYPES.FEEDING) {
    const activeMeals = (routine.meals || []).filter(
      (m) => m.reminderEnabled !== false,
    );
    if (activeMeals.length === 0) {
      console.log("[RoutineCard] Skipping empty feeding routine:", routine.id);
      return null;
    }
  }

  // Safety: Don't render empty photo check routines
  if (routine.type === ROUTINE_TYPES.PHOTO_CHECK) {
    const photoCheckSchedules =
      routine.photoCheckSchedule && Array.isArray(routine.photoCheckSchedule)
        ? routine.photoCheckSchedule
        : routine.bodyArea
          ? [
              {
                bodyArea: routine.bodyArea,
                reminderEnabled: routine.notificationEnabled,
              },
            ]
          : [];

    const activeSchedules = photoCheckSchedules.filter(
      (s) => s.reminderEnabled !== false,
    );

    if (activeSchedules.length === 0) {
      console.log(
        "[RoutineCard] Skipping empty photo check routine:",
        routine.id,
      );
      return null;
    }
  }

  // Safety: Don't render empty wellness check routines
  if (routine.type === ROUTINE_TYPES.WELLNESS_CHECK) {
    const wellnessCheckItems =
      routine.wellnessCheckItems && Array.isArray(routine.wellnessCheckItems)
        ? routine.wellnessCheckItems
        : [];

    const activeItems = wellnessCheckItems.filter(
      (item) => item.reminderEnabled !== false,
    );

    if (activeItems.length === 0) {
      console.log(
        "[RoutineCard] Skipping empty wellness check routine:",
        routine.id,
      );
      return null;
    }
  }

  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1.5,
        borderColor: routine.isActive ? config?.color + "40" : C.peach,
        shadowColor: C.terracotta,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        opacity: routine.isActive ? 1 : 0.6,
      }}
    >
      {/* Header */}
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: (config?.color || C.sage) + "20",
            justifyContent: "center",
            alignItems: "center",
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 22 }}>{config?.icon || "📌"}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 2,
            }}
          >
            {displayLabel}
          </Text>
          {/* Show body areas for Photo Check */}
          {photoCheckAreas && (
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: config?.color || C.sage,
                marginBottom: 4,
              }}
            >
              {photoCheckAreas}
            </Text>
          )}
          {/* Show items list for Medical Care */}
          {medicalCareItemsSummary && (
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: config?.color || C.terracotta,
                marginBottom: 4,
              }}
            >
              {medicalCareItemsSummary}
            </Text>
          )}
          <View
            style={{
              backgroundColor: routine.isActive ? C.sage + "20" : C.sand,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
              alignSelf: "flex-start",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: routine.isActive ? C.sage : C.mutedBrown,
              }}
            >
              {routine.isActive ? "ACTIVE" : "INACTIVE"}
            </Text>
          </View>
        </View>

        <Switch
          value={routine.isActive}
          onValueChange={() => onToggle(routine.id)}
          trackColor={{ false: C.sand, true: C.sage + "60" }}
          thumbColor={routine.isActive ? C.sage : C.peach}
          ios_backgroundColor={C.sand}
        />
      </View>

      {/* Schedule Summary */}
      {routine.isActive && (
        <>
          <View
            style={{
              backgroundColor: C.sand,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: C.mutedBrown,
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Schedule
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: C.warmBrown,
                lineHeight: 20,
              }}
            >
              {scheduleSummary}
            </Text>
          </View>

          {/* Next Reminder */}
          {nextReminder && (
            <View
              style={{
                backgroundColor: (config?.color || C.sage) + "15",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: (config?.color || C.sage) + "30",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: C.mutedBrown,
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Next
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: config?.color || C.sage,
                }}
              >
                {nextReminder}
              </Text>
            </View>
          )}

          {/* Add to Calendar - Walk Routines Only */}
          {routine.type === ROUTINE_TYPES.WALK && routine.walks?.length > 0 && (
            <TouchableOpacity
              onPress={async () => {
                // Add all walks to calendar
                for (const walk of routine.walks) {
                  await addWalkToCalendar(walk, routine.petName || "Your pet");
                }
              }}
              style={{
                backgroundColor: C.card,
                borderRadius: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                borderWidth: 1.5,
                borderColor: C.sage,
                marginBottom: 12,
              }}
            >
              <CalendarIcon size={14} color={C.sage} />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: C.sage,
                }}
              >
                Add to calendar
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Edit Button */}
      <TouchableOpacity
        onPress={() => onEdit(routine)}
        style={{
          backgroundColor: C.sand,
          borderRadius: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <Edit3 size={14} color={C.mutedBrown} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: C.mutedBrown }}>
          Edit Routine
        </Text>
        <ChevronRight size={14} color={C.mutedBrown} />
      </TouchableOpacity>
    </View>
  );
}
