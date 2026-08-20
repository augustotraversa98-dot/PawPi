import React from "react";
import { View, Text, TouchableOpacity, TextInput, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Calendar as CalendarIcon,
  Edit3,
} from "lucide-react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";
import TimeField from "@/components/TimeField";
import FrequencySelector from "./FrequencySelector";
import CustomDaysSelector from "./CustomDaysSelector";
import DurationPaceSelector from "./DurationPaceSelector";
import ReminderSettings from "./ReminderSettings";
import SocialWalkToggle from "./SocialWalkToggle";
import SocialWalkSettings from "./SocialWalkSettings";
import { addWalkToCalendar } from "@/utils/calendarIntegration";

// Helper function to format frequency for display
const getFrequencyDisplay = (walk, t) => {
  if (walk.frequency === ROUTINE_FREQUENCY.DAILY) return t("walkItem.everyDay");
  if (walk.frequency === ROUTINE_FREQUENCY.WEEKDAYS) return t("walkItem.weekdays");
  if (walk.frequency === ROUTINE_FREQUENCY.WEEKENDS) return t("walkItem.weekends");
  if (walk.frequency === ROUTINE_FREQUENCY.CUSTOM) {
    const dayNames = [
      t("walkItem.days.mon"),
      t("walkItem.days.tue"),
      t("walkItem.days.wed"),
      t("walkItem.days.thu"),
      t("walkItem.days.fri"),
      t("walkItem.days.sat"),
      t("walkItem.days.sun"),
    ];
    if (walk.days && walk.days.length > 0) {
      return walk.days.map((d) => dayNames[d]).join(", ");
    }
    return t("walkItem.customDays");
  }
  return t("walkItem.everyDay");
};

export default function WalkItem({
  walk,
  index,
  isExpanded,
  totalWalks,
  onToggleExpanded,
  onRemove,
  onChange,
}) {
  const { t } = useTranslation();
  const handleToggleDay = (day) => {
    const currentDays = walk.days || [];
    let newDays;
    if (currentDays.includes(day)) {
      newDays = currentDays.filter((d) => d !== day);
    } else {
      newDays = [...currentDays, day].sort();
    }
    onChange("days", newDays);
  };

  const handleRemove = () => {
    console.log("[WalkItem] Trash icon pressed", {
      walkIndex: index,
      walkName: walk.name,
      totalWalks,
    });
    // Always allow removal - parent handles confirmation logic
    onRemove();
  };

  const handleAddToCalendar = async () => {
    const success = await addWalkToCalendar(walk, "your pet");
    if (success) {
      console.log("[WalkRoutine] Walk added to calendar successfully");
    }
  };

  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1.5,
        borderColor: isExpanded ? C.sage : C.peach,
        marginBottom: 12,
      }}
    >
      {/* COLLAPSED STATE */}
      {!isExpanded && (
        <>
          {/* Header with delete button - always show trash icon */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: C.mutedBrown,
              }}
            >
              {t("walkItem.walkN", { n: index + 1 })}
            </Text>
            <TouchableOpacity onPress={handleRemove}>
              <Trash2 size={16} color={C.coral} />
            </TouchableOpacity>
          </View>

          {/* Walk Summary */}
          <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 6,
              }}
            >
              {walk.name || t("walkItem.walk")}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: C.mutedBrown,
                marginBottom: 4,
              }}
            >
              {walk.time} · {getFrequencyDisplay(walk, t)} ·{" "}
              {t("walkItem.minutes", { count: walk.durationMinutes || 30 })}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                textTransform: "capitalize",
              }}
            >
              {t("walkItem.pace", { pace: walk.pace || t("walkItem.paceNormal") })}
            </Text>
          </View>

          {/* Edit Details Button - Full Tappable Row */}
          <TouchableOpacity
            onPress={onToggleExpanded}
            style={{
              backgroundColor: C.sand,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 3,
                }}
              >
                <Edit3 size={14} color={C.mutedBrown} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.warmBrown,
                  }}
                >
                  {t("walkItem.editDetails")}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 11,
                  color: C.mutedBrown,
                }}
              >
                {t("walkItem.editDetailsHint")}
              </Text>
            </View>
            <ChevronDown size={20} color={C.mutedBrown} />
          </TouchableOpacity>
        </>
      )}

      {/* EXPANDED STATE */}
      {isExpanded && (
        <>
          {/* Header - always show trash icon */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: C.mutedBrown,
                }}
              >
                {t("walkItem.walkN", { n: index + 1 })}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: C.sage,
                  backgroundColor: C.sage + "20",
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}
              >
                {t("walkItem.walkDetailsBadge")}
              </Text>
            </View>
            <TouchableOpacity onPress={handleRemove}>
              <Trash2 size={16} color={C.coral} />
            </TouchableOpacity>
          </View>

          {/* SECTION: Basic Info */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: C.sage,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("walkItem.basicInfo")}
            </Text>

            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: C.warmBrown,
                marginBottom: 6,
              }}
            >
              {t("walkItem.walkName")}
            </Text>
            <TextInput
              value={walk.name}
              onChangeText={(text) => onChange("name", text)}
              placeholder={t("walkItem.walkName")}
              placeholderTextColor={C.mutedBrown + "80"}
              style={{
                backgroundColor: C.sand,
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                color: C.warmBrown,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: C.peach,
              }}
            />

            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: C.warmBrown,
                marginBottom: 6,
              }}
            >
              {t("walkItem.walkTime")}
            </Text>
            <TimeField
              value={walk.time}
              onChange={(time) => onChange("time", time)}
              fieldStyle={{
                backgroundColor: C.sand,
                padding: 14,
              }}
            />
          </View>

          {/* SECTION: Schedule */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: C.sage,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("walkItem.schedule")}
            </Text>

            <FrequencySelector
              frequency={walk.frequency}
              onFrequencyChange={(value) => onChange("frequency", value)}
            />

            {walk.frequency === ROUTINE_FREQUENCY.CUSTOM && (
              <CustomDaysSelector
                selectedDays={walk.days}
                onToggleDay={handleToggleDay}
              />
            )}
          </View>

          {/* SECTION: Walk Details */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: C.sage,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("walkItem.walkDetails")}
            </Text>

            <DurationPaceSelector
              durationMinutes={walk.durationMinutes}
              pace={walk.pace}
              onDurationChange={(value) => onChange("durationMinutes", value)}
              onPaceChange={(value) => onChange("pace", value)}
            />
          </View>

          {/* SECTION: Reminders */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: C.sage,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("walkItem.reminders")}
            </Text>

            <ReminderSettings
              reminderEnabled={walk.reminderEnabled}
              timeSensitive={walk.timeSensitive}
              onReminderEnabledChange={(val) =>
                onChange("reminderEnabled", val)
              }
              onTimeSensitiveChange={(val) => onChange("timeSensitive", val)}
            />
          </View>

          {/* SECTION: Social Walk */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: C.sage,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("walkItem.socialWalk")}
            </Text>

            <SocialWalkToggle
              socialWalkEnabled={walk.socialWalkEnabled}
              onSocialWalkEnabledChange={(val) =>
                onChange("socialWalkEnabled", val)
              }
            />

            <SocialWalkSettings walk={walk} onChange={onChange} />
          </View>

          {/* SECTION: Calendar */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: C.sage,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("walkItem.calendar")}
            </Text>

            <TouchableOpacity
              onPress={handleAddToCalendar}
              style={{
                backgroundColor: C.card,
                borderRadius: 12,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1.5,
                borderColor: C.sage,
              }}
            >
              <CalendarIcon size={16} color={C.sage} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: C.sage,
                }}
              >
                {t("walkItem.addToCalendar")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* SECTION: Notes */}
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: C.sage,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("walkItem.notes")}
            </Text>

            <TextInput
              value={walk.notes}
              onChangeText={(text) => onChange("notes", text)}
              placeholder={t("walkItem.notesPlaceholder")}
              placeholderTextColor={C.mutedBrown + "80"}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: C.sand,
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
                textAlignVertical: "top",
                minHeight: 80,
              }}
            />
          </View>

          {/* Collapse Button */}
          <TouchableOpacity
            onPress={onToggleExpanded}
            style={{
              backgroundColor: C.sand,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: C.mutedBrown,
              }}
            >
              {t("walkItem.doneEditing")}
            </Text>
            <ChevronUp size={18} color={C.mutedBrown} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
