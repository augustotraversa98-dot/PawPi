import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  CheckCircle,
  Clock,
  Zap,
  Play,
  Edit3,
  Calendar as CalendarIcon,
} from "lucide-react-native";
import { getTimeDisplay } from "@/data/remindersData";
import { formatScheduledTime } from "@/utils/scheduledTimeFormat";
import StartWalkModal from "./StartWalkModal";
import PostWalkFeedbackModal from "./PostWalkFeedbackModal";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { addWalkToCalendar } from "@/utils/calendarIntegration";

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
  honey: "#FFB74D",
};

export default function WalkCountdownCard({ reminder, onComplete, onSnooze }) {
  const [startWalkVisible, setStartWalkVisible] = useState(false);
  const [postWalkVisible, setPostWalkVisible] = useState(false);
  const [walkData, setWalkData] = useState(null);
  const { data: currentPet } = useCurrentPet();

  const timeDisplay = getTimeDisplay(reminder);
  const petName = currentPet?.name || "your dog";

  // Extract walk info from reminder
  const walk = reminder.relatedWalk || {
    name: reminder.title || "Walk",
    durationMinutes: reminder.walkDuration || 30,
    pace: reminder.walkPace || "normal",
    notes: reminder.notes || "",
  };

  const handleStartWalk = () => {
    setStartWalkVisible(true);
  };

  const handleWalkComplete = (completedWalkData) => {
    setStartWalkVisible(false);
    setWalkData(completedWalkData);
    setPostWalkVisible(true);
  };

  const handlePostWalkComplete = () => {
    setPostWalkVisible(false);
    setWalkData(null);
    onComplete(reminder);
    Alert.alert("✅ Walk completed!", `${walk.name} has been logged`);
  };

  const handleLogManually = () => {
    // Just complete the reminder, user can log manually from track section
    onComplete(reminder);
    Alert.alert(
      "Reminder dismissed",
      "Log this walk manually from Health → Track when ready",
    );
  };

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
          <Text style={{ fontSize: 48, marginBottom: 8 }}>🚶</Text>
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
            {walk.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: C.mutedBrown,
              marginTop: 4,
              fontWeight: "600",
            }}
          >
            {petName} · {walk.durationMinutes} min · {walk.pace}
          </Text>

          {/* Add to Calendar */}
          <TouchableOpacity
            onPress={async () => {
              await addWalkToCalendar(walk, petName);
            }}
            style={{
              marginTop: 8,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.sage + "40",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              alignSelf: "center",
            }}
          >
            <CalendarIcon size={12} color={C.sage} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: C.sage,
              }}
            >
              Add to calendar
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 10 }}>
          {/* Primary: Start walk */}
          <TouchableOpacity
            onPress={handleStartWalk}
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
            <Play size={18} color="#FFF" />
            <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}>
              Start walk
            </Text>
          </TouchableOpacity>

          {/* Secondary: Log manually */}
          <TouchableOpacity
            onPress={handleLogManually}
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
            <Edit3 size={16} color={C.mutedBrown} />
            <Text
              style={{ fontSize: 14, fontWeight: "700", color: C.mutedBrown }}
            >
              Log manually
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

      {/* Start Walk Modal */}
      <StartWalkModal
        visible={startWalkVisible}
        onClose={() => setStartWalkVisible(false)}
        walk={walk}
        petName={petName}
        onWalkComplete={handleWalkComplete}
      />

      {/* Post-Walk Feedback Modal */}
      <PostWalkFeedbackModal
        visible={postWalkVisible}
        onClose={() => setPostWalkVisible(false)}
        walkData={walkData}
        onComplete={handlePostWalkComplete}
      />
    </>
  );
}
