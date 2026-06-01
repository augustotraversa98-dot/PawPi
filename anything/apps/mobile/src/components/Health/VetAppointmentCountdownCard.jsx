import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Calendar, Clock, Zap, Eye } from "lucide-react-native";
import { getTimeDisplay } from "@/data/remindersData";
import VetAppointmentDetailModal from "./VetAppointmentDetailModal";

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
  honey: "#F4A460",
};

export default function VetAppointmentCountdownCard({
  reminder,
  onComplete,
  onSnooze,
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Auto-refresh every minute to update countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, []);

  const timeDisplay = getTimeDisplay(reminder);

  // Format appointment date/time
  const formatAppointmentTime = (isoString) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      // Check if today
      if (date.toDateString() === now.toDateString()) {
        return `Today at ${timeStr}`;
      }
      // Check if tomorrow
      else if (date.toDateString() === tomorrow.toDateString()) {
        return `Tomorrow at ${timeStr}`;
      }
      // Otherwise show date
      else {
        const dateStr = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        return `${dateStr} at ${timeStr}`;
      }
    } catch {
      return isoString;
    }
  };

  const handleViewAppointment = () => {
    setDetailModalVisible(true);
  };

  const handleAppointmentComplete = () => {
    setDetailModalVisible(false);
    onComplete(reminder);
  };

  return (
    <>
      <View
        style={{
          backgroundColor: "#F0F9FF",
          borderRadius: 20,
          padding: 20,
          marginBottom: 16,
          borderWidth: 2,
          borderColor: "#BAE6FD",
          shadowColor: "#4DB8E8",
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
          <Text style={{ fontSize: 48, marginBottom: 8 }}>🩺</Text>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "800",
              color: "#4DB8E8",
              marginBottom: 4,
            }}
          >
            {timeDisplay}
          </Text>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 2,
              textAlign: "center",
            }}
          >
            {reminder.title}
          </Text>

          {/* Appointment time */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
            }}
          >
            <Calendar size={14} color={C.mutedBrown} />
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                fontWeight: "600",
              }}
            >
              {formatAppointmentTime(reminder.appointmentDateTime)}
            </Text>
          </View>

          {/* Clinic */}
          {reminder.clinic && (
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                marginTop: 4,
                fontWeight: "600",
              }}
            >
              📍 {reminder.clinic}
            </Text>
          )}

          {/* Reason */}
          {reminder.reasonForVisit && (
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                marginTop: 4,
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              {reminder.reasonForVisit}
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 10 }}>
          {/* Primary: View appointment */}
          <TouchableOpacity
            onPress={handleViewAppointment}
            style={{
              backgroundColor: "#4DB8E8",
              borderRadius: 14,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              shadowColor: "#4DB8E8",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            <Eye size={18} color="#FFF" />
            <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}>
              View appointment
            </Text>
          </TouchableOpacity>

          {/* Secondary: Snooze */}
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
              style={{ fontSize: 14, fontWeight: "700", color: C.mutedBrown }}
            >
              Snooze
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Appointment Detail Modal */}
      <VetAppointmentDetailModal
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        appointment={reminder.appointmentData}
        onComplete={handleAppointmentComplete}
      />
    </>
  );
}
