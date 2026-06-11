import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { X, Pencil } from "lucide-react-native";
import { REMINDER_TYPE_CONFIG } from "@/data/remindersData";
import { formatScheduledTime } from "@/utils/scheduledTimeFormat";

// A heads-up (early reminder) card for Health → Today. Deliberately NOT a task card:
// it surfaces during the early window of a lead-time reminder ("1 day before", etc.)
// so the user knows something is coming, while the real instance stays pinned at its
// event time. So: no Complete / Log / Take-photo. Exactly two actions —
//   Close = acknowledge (durably hide ONLY this heads-up; the real reminder still
//           surfaces at its true time)
//   Edit  = open the source routine's edit flow.
// Shows the type icon, the task title (WHAT), and "Due <when>" (the real event time).

const C = {
  card: "#FFFBF7",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  peach: "#FFE5D9",
  sand: "#F5EDE4",
};

export default function HeadsUpReminderCard({ reminder, now, onClose, onEdit }) {
  const config = REMINDER_TYPE_CONFIG[reminder.type];
  const eventTime =
    reminder.eventTime ?? reminder.scheduledAt ?? reminder.nextTriggerAt;

  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1.5,
        borderColor: C.terracotta + "33",
        // Softer, flat — reads as a heads-up, not an actionable task card.
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 22, marginRight: 12 }}>
          {config?.icon || "📌"}
        </Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 2,
            }}
          >
            {reminder.title}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: C.mutedBrown,
              fontWeight: "600",
            }}
          >
            Due {formatScheduledTime(eventTime, now)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={() => onClose?.(reminder)}
          style={{
            flex: 1,
            borderRadius: 12,
            paddingVertical: 10,
            borderWidth: 1.5,
            borderColor: C.peach,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <X size={15} color={C.mutedBrown} strokeWidth={2.5} />
          <Text
            style={{ fontSize: 14, fontWeight: "700", color: C.mutedBrown }}
          >
            Close
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onEdit?.(reminder)}
          style={{
            flex: 1,
            borderRadius: 12,
            paddingVertical: 10,
            borderWidth: 1.5,
            borderColor: C.terracotta,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Pencil size={15} color={C.terracotta} strokeWidth={2.5} />
          <Text
            style={{ fontSize: 14, fontWeight: "700", color: C.terracotta }}
          >
            Edit
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
