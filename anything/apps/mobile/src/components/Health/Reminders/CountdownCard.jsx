import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Clock, CheckCircle, Zap } from "lucide-react-native";
import { getTimeDisplay, REMINDER_TYPE_CONFIG } from "@/data/remindersData";
import { formatScheduledTime } from "@/utils/scheduledTimeFormat";

const C = {
  coral: "#FF6F61",
  honey: "#F4A460",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sand: "#F5EDE4",
  peach: "#FFE5D9",
};

export default function CountdownCard({
  reminder,
  onComplete,
  onSnooze,
  onSomethingOff,
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-refresh every minute to update countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, []);

  const config = REMINDER_TYPE_CONFIG[reminder.type];
  const timeDisplay = getTimeDisplay(reminder);

  return (
    <View
      style={{
        backgroundColor: "#FFF4E5",
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: "#FFD699",
        shadowColor: C.honey,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
      }}
    >
      {/* Time-sensitive badge */}
      {reminder.timeSensitive && (
        <View
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            backgroundColor: C.coral,
            borderRadius: 16,
            paddingHorizontal: 10,
            paddingVertical: 4,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Zap size={12} color="#FFF" />
          <Text style={{ fontSize: 10, fontWeight: "800", color: "#FFF" }}>
            TIME-SENSITIVE
          </Text>
        </View>
      )}

      {/* Icon and countdown */}
      <View style={{ alignItems: "center", marginBottom: 16, marginTop: 8 }}>
        <Text style={{ fontSize: 48, marginBottom: 8 }}>
          {config?.icon || "📌"}
        </Text>
        <Text
          style={{
            fontSize: 32,
            fontWeight: "800",
            color: C.coral,
            marginBottom: 4,
          }}
        >
          {timeDisplay}
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: C.mutedBrown,
            marginBottom: 4,
          }}
        >
          {formatScheduledTime(reminder.scheduledAt ?? reminder.nextTriggerAt)}
        </Text>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: C.warmBrown,
            marginBottom: 6,
          }}
        >
          {reminder.title}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: C.mutedBrown,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          {reminder.description}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={{ gap: 10 }}>
        {(() => {
          const isMedicalCare = reminder.type === "medical_care";
          const isVaccine = reminder.careType === "vaccine";

          // Primary label: prefer the reminder's own primaryAction, then config
          const primaryLabel =
            reminder.primaryAction || config?.actionLabel || "Done";

          // Secondary button shown for Medical Care reminders only
          let secondaryLabel = null;
          let secondaryHandler = null;
          if (isMedicalCare) {
            if (isVaccine) {
              secondaryLabel = "Mark completed";
              secondaryHandler = () =>
                onComplete(reminder, { action: "completed" });
            } else if (onSomethingOff) {
              secondaryLabel = "Something was off";
              secondaryHandler = () => onSomethingOff(reminder);
            }
          }

          const primaryAction = () => {
            if (isMedicalCare) {
              onComplete(reminder, {
                action: isVaccine ? "add_vet_record" : "given",
              });
            } else {
              onComplete(reminder);
            }
          };

          return (
            <>
              <TouchableOpacity
                onPress={primaryAction}
                style={{
                  backgroundColor: C.coral,
                  borderRadius: 14,
                  paddingVertical: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  shadowColor: C.coral,
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  elevation: 4,
                }}
              >
                <CheckCircle size={18} color="#FFF" />
                <Text
                  style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}
                >
                  {primaryLabel}
                </Text>
              </TouchableOpacity>

              {secondaryLabel && (
                <TouchableOpacity
                  onPress={secondaryHandler}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 14,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: C.warmBrown,
                    }}
                  >
                    {secondaryLabel}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => onSnooze(reminder)}
                style={{
                  backgroundColor: C.sand,
                  borderRadius: 14,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <Clock size={16} color={C.mutedBrown} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.mutedBrown,
                  }}
                >
                  Snooze
                </Text>
              </TouchableOpacity>
            </>
          );
        })()}
      </View>
    </View>
  );
}