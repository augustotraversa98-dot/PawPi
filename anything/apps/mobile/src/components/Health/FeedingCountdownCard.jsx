import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Clock, CheckCircle, Zap, AlertCircle } from "lucide-react-native";
import { getTimeDisplay } from "@/data/remindersData";
import { formatScheduledTime } from "@/utils/scheduledTimeFormat";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buildQuickFoodLogPayload } from "@/utils/reminderLogFlow";
import FeedingIssueModal from "./FeedingIssueModal";

const C = {
  coral: "#FF6F61",
  honey: "#F4A460",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sand: "#F5EDE4",
  peach: "#FFE5D9",
  sage: "#A7BFA3",
};

export default function FeedingCountdownCard({
  reminder,
  onComplete,
  onSnooze,
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const { data: currentPet } = useCurrentPet();
  const queryClient = useQueryClient();

  // Auto-refresh every minute to update countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, []);

  const timeDisplay = getTimeDisplay(reminder);

  // Quick log mutation
  const quickLogMutation = useMutation({
    mutationFn: async () => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/food-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildQuickFoodLogPayload(reminder, currentPet.id)),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log food");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "food-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      onComplete(reminder);
      Alert.alert("✅ Logged", `${reminder.title} logged`);
    },
    onError: (error) => {
      console.error("[FeedingCountdownCard] Quick log error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });

  const handleLogAsUsual = () => {
    quickLogMutation.mutate();
  };

  const handleSomethingWasOff = () => {
    setIssueModalVisible(true);
  };

  const handleIssueSaved = () => {
    setIssueModalVisible(false);
    onComplete(reminder);
  };

  const petName = currentPet?.name || "Your pet";

  return (
    <>
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
          <Text style={{ fontSize: 48, marginBottom: 8 }}>🍽️</Text>
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
              marginBottom: 2,
            }}
          >
            {reminder.title}
          </Text>

          {/* Show meal notes if available */}
          {reminder.notes && reminder.notes !== "Logged as usual" && (
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 18,
                marginTop: 4,
                fontStyle: "italic",
              }}
            >
              {reminder.notes}
            </Text>
          )}

          {/* Pet name */}
          <Text
            style={{
              fontSize: 12,
              color: C.mutedBrown,
              marginTop: 6,
              fontWeight: "600",
            }}
          >
            {petName}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 10 }}>
          {/* Primary: Log as usual */}
          <TouchableOpacity
            onPress={handleLogAsUsual}
            disabled={quickLogMutation.isPending}
            style={{
              backgroundColor: C.sage,
              borderRadius: 14,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              shadowColor: C.sage,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4,
              opacity: quickLogMutation.isPending ? 0.6 : 1,
            }}
          >
            <CheckCircle size={18} color="#FFF" />
            <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}>
              {quickLogMutation.isPending ? "Logging..." : "Log as usual"}
            </Text>
          </TouchableOpacity>

          {/* Secondary: Something was off */}
          <TouchableOpacity
            onPress={handleSomethingWasOff}
            style={{
              backgroundColor: C.sand,
              borderRadius: 14,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 1.5,
              borderColor: C.honey + "60",
            }}
          >
            <AlertCircle size={16} color={C.honey} />
            <Text
              style={{ fontSize: 14, fontWeight: "700", color: C.warmBrown }}
            >
              Something was off
            </Text>
          </TouchableOpacity>

          {/* Tertiary: Snooze */}
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

      {/* Feeding Issue Modal */}
      <FeedingIssueModal
        visible={issueModalVisible}
        onClose={() => setIssueModalVisible(false)}
        onSaved={handleIssueSaved}
        reminder={reminder}
        petName={petName}
      />
    </>
  );
}
