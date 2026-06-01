import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import {
  Calendar,
  TrendingUp,
  AlertCircle,
  Bell,
  ChevronRight,
  Play,
  CheckCircle,
  Camera,
  Scale,
  Eye,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import useRemindersStore from "@/store/remindersStore";
import {
  getReminderStatus,
  getTimeDisplay,
  REMINDER_STATUS,
  REMINDER_TYPE_CONFIG,
  REMINDER_TYPES,
} from "@/data/remindersData";
import CountdownCard from "./Reminders/CountdownCard";
import FeedingCountdownCard from "./FeedingCountdownCard";
import WalkCountdownCard from "./WalkActivity/WalkCountdownCard";
import VetAppointmentCountdownCard from "./VetAppointmentCountdownCard";
import SnoozeModal from "./Reminders/SnoozeModal";
import PhotoCheckCaptureModal from "./PhotoCheck/PhotoCheckCaptureModal";
import MedicalCareIssueModal from "./Reminders/MedicalCareIssueModal";
import { useVetAppointmentReminders } from "@/hooks/useVetAppointmentReminders";

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

export default function HealthToday() {
  const router = useRouter();
  const { reminders, completeReminder, snoozeReminder } = useRemindersStore();
  // Fetch vet appointment reminders
  const { data: vetAppointmentReminders = [] } = useVetAppointmentReminders();
  const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [photoCheckModalVisible, setPhotoCheckModalVisible] = useState(false);
  const [photoCheckReminder, setPhotoCheckReminder] = useState(null);
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [issueReminder, setIssueReminder] = useState(null);
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [weightReminder, setWeightReminder] = useState(null);
  const [mobilityModalVisible, setMobilityModalVisible] = useState(false);
  const [mobilityReminder, setMobilityReminder] = useState(null);
  const [moodEnergyModalVisible, setMoodEnergyModalVisible] = useState(false);
  const [moodEnergyReminder, setMoodEnergyReminder] = useState(null);
  const [generalCheckModalVisible, setGeneralCheckModalVisible] =
    useState(false);
  const [generalCheckReminder, setGeneralCheckReminder] = useState(null);

  // Auto-refresh countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, []);

  // Combine routine reminders with vet appointment reminders
  const allReminders = [...reminders, ...vetAppointmentReminders];

  // Get time-sensitive reminders for countdown cards
  const timeSensitiveReminders = allReminders.filter((r) => {
    const status = getReminderStatus(r);
    return (
      r.timeSensitive &&
      (status === REMINDER_STATUS.DUE_NOW ||
        status === REMINDER_STATUS.DUE_SOON ||
        status === REMINDER_STATUS.OVERDUE) &&
      status !== REMINDER_STATUS.COMPLETED &&
      status !== REMINDER_STATUS.DISABLED
    );
  });

  // Get next 1-3 actionable reminders (upcoming within next few hours)
  const getNextUpReminders = () => {
    const now = new Date();
    const inSixHours = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    const upcomingReminders = allReminders
      .filter((r) => {
        const status = getReminderStatus(r);
        const reminderTime = new Date(r.nextTriggerAt);
        return (
          reminderTime >= now &&
          reminderTime <= inSixHours &&
          status !== REMINDER_STATUS.COMPLETED &&
          status !== REMINDER_STATUS.DISABLED
        );
      })
      .sort((a, b) => new Date(a.nextTriggerAt) - new Date(b.nextTriggerAt))
      .slice(0, 3);

    return upcomingReminders;
  };

  const nextUpReminders = getNextUpReminders();

  const handleComplete = async (reminder, extra) => {
    // Check if this is a vet appointment reminder
    if (reminder.type === "vet_appointment") {
      // Vet appointment completion is handled in VetAppointmentDetailModal
      // Just acknowledge here
      Alert.alert("✅ Done!", "Vet appointment marked as completed");
      return;
    }

    // Check if this is a photo check reminder
    if (reminder.type === REMINDER_TYPES.PHOTO_CHECK) {
      // Open photo check capture modal instead of just completing
      setPhotoCheckReminder(reminder);
      setPhotoCheckModalVisible(true);
      return;
    }

    // Medical Care: save a log entry, then complete only this reminder
    if (reminder.type === "medical_care") {
      const action = extra?.action || "given";
      const status =
        action === "add_vet_record" || action === "completed"
          ? "completed"
          : "given";
      const noteSuffix =
        action === "add_vet_record" ? "Added to vet record" : null;

      try {
        await saveMedicalCareLog(reminder, { status, notes: noteSuffix });
      } catch (err) {
        console.error("[HealthToday] medical care log save failed", err);
        Alert.alert(
          "Could not save",
          "We couldn't save this entry. Please try again.",
        );
        return;
      }

      completeReminder(reminder.id);
      Alert.alert(
        "✅ Saved",
        action === "add_vet_record"
          ? `${reminder.title} saved to vet record`
          : `${reminder.title} logged`,
      );
      return;
    }

    // For other types, mark as complete immediately
    completeReminder(reminder.id);
    Alert.alert("✅ Done!", `${reminder.title} marked as complete`);
  };

  const handleSomethingOff = (reminder) => {
    setIssueReminder(reminder);
    setIssueModalVisible(true);
  };

  const handleIssueSubmit = async ({ reactionOrIssue, notes }) => {
    if (!issueReminder) return;
    try {
      await saveMedicalCareLog(issueReminder, {
        status: "issue_reported",
        notes,
        reactionOrIssue,
      });
      completeReminder(issueReminder.id);
      setIssueModalVisible(false);
      setIssueReminder(null);
      Alert.alert("Saved", "Issue saved to medical care history");
    } catch (err) {
      console.error("[HealthToday] medical care issue save failed", err);
      Alert.alert(
        "Could not save",
        "We couldn't save this entry. Please try again.",
      );
    }
  };

  const saveMedicalCareLog = async (
    reminder,
    { status, notes, reactionOrIssue },
  ) => {
    const payload = {
      petId: reminder.petId,
      routineId: reminder.routineId,
      medicalCareItemId: reminder.medicalCareItemId,
      careType: reminder.careType,
      name: reminder.title,
      dose: reminder.dose || null,
      givenAt: new Date().toISOString(),
      status,
      notes: notes || null,
      reactionOrIssue: reactionOrIssue || null,
    };
    const res = await fetch("/api/health/medical-care-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Save failed: ${res.statusText}`);
    }
    return res.json();
  };

  const handlePhotoCheckComplete = (reminderId) => {
    // Mark reminder as complete after photo check is saved
    completeReminder(reminderId);
  };

  const handleSnooze = (reminder) => {
    setSelectedReminder(reminder);
    setSnoozeModalVisible(true);
  };

  const handleSnoozeSelect = (option) => {
    if (selectedReminder) {
      snoozeReminder(selectedReminder.id, option);
      Alert.alert(
        "⏰ Snoozed",
        `${
          selectedReminder.title
        } has been snoozed for ${option.label.toLowerCase()}`,
      );
    }
    setSnoozeModalVisible(false);
    setSelectedReminder(null);
  };

  // Get action icon and label for reminder type
  const getReminderAction = (reminder) => {
    const type = reminder.type;
    switch (type) {
      case REMINDER_TYPES.FEEDING:
        return { icon: CheckCircle, label: "Log food" };
      case REMINDER_TYPES.WALK:
        return { icon: Play, label: "Start walk" };
      case REMINDER_TYPES.MEDICATION:
        return { icon: CheckCircle, label: "Mark given" };
      case REMINDER_TYPES.PHOTO_CHECK:
        return { icon: Camera, label: "Take photo" };
      case REMINDER_TYPES.GENERAL_CHECK:
        return { icon: CheckCircle, label: "Start check" };
      case REMINDER_TYPES.WEIGHT_CHECK:
        return { icon: Scale, label: "Log weight" };
      case REMINDER_TYPES.WELLNESS_CHECK:
        // Use primary action from reminder metadata
        return {
          icon: CheckCircle,
          label: reminder.primaryAction || "Start check",
        };
      case "vet_appointment":
        return { icon: Eye, label: "View appointment" };
      default:
        return { icon: CheckCircle, label: "Complete" };
    }
  };

  // Helper to render the correct countdown card based on reminder type
  const renderCountdownCard = (reminder) => {
    if (reminder.type === REMINDER_TYPES.FEEDING) {
      return (
        <FeedingCountdownCard
          key={`${reminder.id}-${refreshKey}`}
          reminder={reminder}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
        />
      );
    } else if (reminder.type === REMINDER_TYPES.WALK) {
      return (
        <WalkCountdownCard
          key={`${reminder.id}-${refreshKey}`}
          reminder={reminder}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
        />
      );
    } else if (reminder.type === "vet_appointment") {
      return (
        <VetAppointmentCountdownCard
          key={`${reminder.id}-${refreshKey}`}
          reminder={reminder}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
        />
      );
    } else {
      return (
        <CountdownCard
          key={`${reminder.id}-${refreshKey}`}
          reminder={reminder}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
          onSomethingOff={handleSomethingOff}
        />
      );
    }
  };

  return (
    <View style={{ padding: 16 }}>
      {/* Section Title */}
      <View style={{ marginBottom: 20 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: C.warmBrown,
            marginBottom: 4,
          }}
        >
          Health Today
        </Text>
        <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 20 }}>
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </View>

      {/* Time-Sensitive Countdown Cards */}
      {timeSensitiveReminders.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <AlertCircle size={18} color={C.coral} style={{ marginRight: 8 }} />
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: C.warmBrown }}
            >
              Due Soon
            </Text>
            <View
              style={{
                backgroundColor: C.coral,
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
                marginLeft: 8,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFF" }}>
                {timeSensitiveReminders.length}
              </Text>
            </View>
          </View>
          {timeSensitiveReminders.slice(0, 2).map(renderCountdownCard)}
        </View>
      )}

      {/* Next Up - Actionable Reminders */}
      {nextUpReminders.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Calendar
                size={18}
                color={C.terracotta}
                style={{ marginRight: 8 }}
              />
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: C.warmBrown }}
              >
                Next Up
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/more/reminders")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: C.terracotta }}
              >
                Manage routines
              </Text>
              <ChevronRight size={14} color={C.terracotta} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 10 }}>
            {nextUpReminders.map((reminder) => {
              const config = REMINDER_TYPE_CONFIG[reminder.type];
              const timeDisplay = getTimeDisplay(reminder);
              const action = getReminderAction(reminder);
              const ActionIcon = action.icon;

              return (
                <View
                  key={reminder.id}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: (config?.color || C.sage) + "40",
                    shadowColor: C.terracotta,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.04,
                    shadowRadius: 6,
                    elevation: 1,
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
                        {timeDisplay}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleComplete(reminder)}
                    style={{
                      backgroundColor: config?.color || C.sage,
                      borderRadius: 12,
                      paddingVertical: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <ActionIcon size={16} color="#FFF" strokeWidth={2.5} />
                    <Text
                      style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Empty State for Next Up */}
      {nextUpReminders.length === 0 && timeSensitiveReminders.length === 0 && (
        <View style={{ marginBottom: 24 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Calendar
                size={18}
                color={C.terracotta}
                style={{ marginRight: 8 }}
              />
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: C.warmBrown }}
              >
                Next Up
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/more/reminders")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: C.terracotta }}
              >
                Manage routines
              </Text>
              <ChevronRight size={14} color={C.terracotta} />
            </TouchableOpacity>
          </View>

          <View
            style={{
              backgroundColor: C.sand,
              borderRadius: 16,
              padding: 20,
              alignItems: "center",
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Text style={{ fontSize: 40, marginBottom: 8 }}>📅</Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: C.warmBrown,
                marginBottom: 4,
              }}
            >
              All clear for now
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 18,
              }}
            >
              No reminders scheduled in the next few hours
            </Text>
          </View>
        </View>
      )}

      {/* Quick Stats */}
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <TrendingUp size={18} color={C.sage} style={{ marginRight: 8 }} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.warmBrown }}>
            Today's Progress
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          <View
            style={{
              backgroundColor: C.sage + "20",
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.sage }}>
              🍽️ Fed 2 times
            </Text>
          </View>
          <View
            style={{
              backgroundColor: C.sage + "20",
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.sage }}>
              🚶 1 walk
            </Text>
          </View>
          <View
            style={{
              backgroundColor: C.sage + "20",
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.sage }}>
              💊 Medication given
            </Text>
          </View>
        </View>
      </View>

      {/* Snooze Modal */}
      <SnoozeModal
        visible={snoozeModalVisible}
        reminder={selectedReminder}
        onClose={() => {
          setSnoozeModalVisible(false);
          setSelectedReminder(null);
        }}
        onSelect={handleSnoozeSelect}
      />

      {/* Photo Check Capture Modal */}
      <PhotoCheckCaptureModal
        visible={photoCheckModalVisible}
        onClose={() => {
          setPhotoCheckModalVisible(false);
          setPhotoCheckReminder(null);
        }}
        bodyArea={photoCheckReminder?.relatedBodyArea || "other"}
        reminderId={photoCheckReminder?.id}
        onComplete={handlePhotoCheckComplete}
      />

      {/* Medical Care Issue Modal */}
      <MedicalCareIssueModal
        visible={issueModalVisible}
        reminder={issueReminder}
        onClose={() => {
          setIssueModalVisible(false);
          setIssueReminder(null);
        }}
        onSubmit={handleIssueSubmit}
      />
    </View>
  );
}
