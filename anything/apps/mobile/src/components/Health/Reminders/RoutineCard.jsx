import React from "react";
import { View, Text, TouchableOpacity, Switch, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import {
  Edit3,
  ChevronRight,
  Calendar as CalendarIcon,
  Trash2,
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

export default function RoutineCard({ routine, onEdit, onToggle, onDelete }) {
  const { t } = useTranslation();
  const config = ROUTINE_TYPE_CONFIG[routine.type];

  // Delete is a SOFT delete (handled by the store): the routine leaves every
  // listing and its future reminders/heads-up acks are cleared, but past health
  // logs stay. Distinct from the Active/Inactive switch above, which only
  // pauses. Confirm first; the success/error toast is owned by the parent.
  const handleDeletePress = () => {
    Alert.alert(
      t("routineCard.deleteTitle"),
      t("routineCard.deleteBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("routineCard.delete"),
          style: "destructive",
          onPress: () => onDelete?.(routine.id),
        },
      ],
    );
  };
  const scheduleSummary = getScheduleSummary(routine);
  const nextReminder = getNextReminderPreview(routine);

  // Get display label - for grouped types, show subtype info
  let displayLabel = config?.label || routine.title;
  let medicalCareItemsSummary = null;
  const careTypeLabels = {
    medication: t("routineCard.care.medication"),
    vaccine: t("routineCard.care.vaccine"),
    flea_tick: t("routineCard.care.flea_tick"),
    deworming: t("routineCard.care.deworming"),
    heartworm: t("routineCard.care.heartworm"),
    supplement: t("routineCard.care.supplement"),
    other: t("routineCard.care.other"),
  };
  if (
    routine.type === ROUTINE_TYPES.MEDICAL_CARE &&
    Array.isArray(routine.medicalCareItems) &&
    routine.medicalCareItems.length > 0
  ) {
    // New multi-item format
    displayLabel = t("routineCard.care.medicalCareLabel");
    medicalCareItemsSummary = routine.medicalCareItems
      .map((it) => it.name || careTypeLabels[it.type] || t("routineCard.care.item"))
      .join(" · ");
  } else if (
    routine.type === ROUTINE_TYPES.MEDICAL_CARE &&
    routine.medicalCareSubtype
  ) {
    const careLabel =
      careTypeLabels[routine.medicalCareSubtype] || t("routineCard.care.other");
    displayLabel = routine.name ? `${routine.name} · ${careLabel}` : careLabel;
  } else if (
    routine.type === ROUTINE_TYPES.WELLNESS_CHECK &&
    routine.wellnessCheckItems
  ) {
    const itemLabels = {
      general: t("routineCard.wellness.general"),
      weight: t("routineCard.wellness.weight"),
      body_condition: t("routineCard.wellness.body_condition"),
      mobility: t("routineCard.wellness.mobility"),
      mood_energy: t("routineCard.wellness.mood_energy"),
      skin_coat: t("routineCard.wellness.skin_coat"),
      appetite_hydration: t("routineCard.wellness.appetite_hydration"),
      custom: t("routineCard.wellness.custom"),
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
    displayLabel = items || t("routineCard.wellness.fallback");
  } else if (
    routine.type === ROUTINE_TYPES.MEDICATION &&
    routine.medicationName
  ) {
    displayLabel = `${routine.medicationName} · ${t("routineCard.suffix.medication")}`;
  } else if (routine.type === ROUTINE_TYPES.VACCINE && routine.name) {
    displayLabel = `${routine.name} · ${t("routineCard.suffix.vaccine")}`;
  } else if (routine.type === ROUTINE_TYPES.PREVENTIVE && routine.productName) {
    displayLabel = `${routine.productName} · ${t("routineCard.suffix.prevention")}`;
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
        paws: t("routineCard.areas.paws"),
        ears: t("routineCard.areas.ears"),
        eyes: t("routineCard.areas.eyes"),
        teeth: t("routineCard.areas.teeth"),
        skin_fur: t("routineCard.areas.skin_fur"),
        face: t("routineCard.areas.face"),
        full_body: t("routineCard.areas.full_body"),
        other: t("routineCard.areas.other"),
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
              {routine.isActive ? t("routineCard.active") : t("routineCard.inactive")}
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
              {t("routineCard.schedule")}
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
                {t("routineCard.next")}
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
                  await addWalkToCalendar(walk, routine.petName || t("routineCard.yourPet"));
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
                {t("routineCard.addToCalendar")}
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
          {t("routineCard.editRoutine")}
        </Text>
        <ChevronRight size={14} color={C.mutedBrown} />
      </TouchableOpacity>

      {/* Delete Button — consistent across every routine type */}
      <TouchableOpacity
        onPress={handleDeletePress}
        style={{
          marginTop: 8,
          backgroundColor: C.card,
          borderRadius: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderWidth: 1,
          borderColor: C.coral + "40",
        }}
      >
        <Trash2 size={14} color={C.coral} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: C.coral }}>
          {t("routineCard.deleteRoutine")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
