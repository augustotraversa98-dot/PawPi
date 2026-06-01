import React from "react";
import { View, Text, TouchableOpacity, TextInput, Alert } from "react-native";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Calendar as CalendarIcon,
  Edit3,
} from "lucide-react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";
import FrequencySelector from "./FrequencySelector";
import CustomDaysSelector from "./CustomDaysSelector";
import DurationPaceSelector from "./DurationPaceSelector";
import ReminderSettings from "./ReminderSettings";
import SocialWalkToggle from "./SocialWalkToggle";
import SocialWalkSettings from "./SocialWalkSettings";
import { addWalkToCalendar } from "@/utils/calendarIntegration";

// Helper function to format frequency for display
const getFrequencyDisplay = (walk) => {
  if (walk.frequency === ROUTINE_FREQUENCY.DAILY) return "Every day";
  if (walk.frequency === ROUTINE_FREQUENCY.WEEKDAYS) return "Weekdays";
  if (walk.frequency === ROUTINE_FREQUENCY.WEEKENDS) return "Weekends";
  if (walk.frequency === ROUTINE_FREQUENCY.CUSTOM) {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (walk.days && walk.days.length > 0) {
      return walk.days.map((d) => dayNames[d]).join(", ");
    }
    return "Custom days";
  }
  return "Every day";
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
    const success = await addWalkToCalendar(walk, "Phoebe");
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
              Walk {index + 1}
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
              {walk.name || "Walk"}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: C.mutedBrown,
                marginBottom: 4,
              }}
            >
              {walk.time} · {getFrequencyDisplay(walk)} ·{" "}
              {walk.durationMinutes || 30} min
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                textTransform: "capitalize",
              }}
            >
              {walk.pace || "normal"} pace
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
                  Edit walk details
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 11,
                  color: C.mutedBrown,
                }}
              >
                Repeat days, pace, social walk, notes
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
                Walk {index + 1}
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
                Walk details
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
              Basic Info
            </Text>

            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: C.warmBrown,
                marginBottom: 6,
              }}
            >
              Walk name
            </Text>
            <TextInput
              value={walk.name}
              onChangeText={(text) => onChange("name", text)}
              placeholder="Walk name"
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
              Walk time
            </Text>
            <TextInput
              value={walk.time}
              onChangeText={(text) => onChange("time", text)}
              placeholder="Time (HH:MM)"
              placeholderTextColor={C.mutedBrown + "80"}
              style={{
                backgroundColor: C.sand,
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
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
              Schedule
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
              Walk Details
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
              Reminders
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
              Social Walk
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
              Calendar
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
                Add to calendar
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
              Notes
            </Text>

            <TextInput
              value={walk.notes}
              onChangeText={(text) => onChange("notes", text)}
              placeholder="Route, preferences..."
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
              Done editing
            </Text>
            <ChevronUp size={18} color={C.mutedBrown} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
