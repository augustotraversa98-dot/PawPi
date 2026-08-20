import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Bell, Clock, CheckCircle, Trash2 } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useCurrentPet } from "@/hooks/usePetProfile";
import useRemindersStore from "@/store/remindersStore";
import useRoutinesStore from "@/store/routinesStore";
import {
  getReminderStatus,
  getTimeDisplay,
  groupRemindersByTime,
  REMINDER_STATUS,
  REMINDER_TYPE_CONFIG,
} from "@/data/remindersData";
import CountdownCard from "./CountdownCard";
import SnoozeModal from "./SnoozeModal";

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

export default function UpcomingTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const { reminders, completeReminder, snoozeReminder, deleteReminder } =
    useRemindersStore();
  const { routines, initializeReminders, loadRoutines } = useRoutinesStore();

  const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Initialize reminders from routines on mount
  useEffect(() => {
    initializeReminders();
  }, []);

  // Pull-to-refresh: reload the active pet's routines from the server, then
  // rebuild the reminders these cards are derived from.
  const handleRefresh = useCallback(async () => {
    if (currentPet?.id != null) {
      await loadRoutines(currentPet.id);
    }
    initializeReminders();
  }, [currentPet?.id, loadRoutines, initializeReminders]);

  // Auto-refresh countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Filter out completed, disabled reminders, and reminders from inactive routines
  const activeReminders = reminders.filter((r) => {
    if (
      r.status === REMINDER_STATUS.COMPLETED ||
      r.status === REMINDER_STATUS.DISABLED
    ) {
      return false;
    }

    // If reminder has a routineId, check if routine is still active
    if (r.routineId) {
      const routine = routines.find((rt) => rt.id === r.routineId);
      if (!routine || !routine.isActive) {
        return false;
      }
    }

    return true;
  });

  // Get time-sensitive reminders for countdown cards
  const timeSensitiveReminders = activeReminders.filter((r) => {
    const status = getReminderStatus(r);
    return (
      r.timeSensitive &&
      (status === REMINDER_STATUS.DUE_NOW ||
        status === REMINDER_STATUS.DUE_SOON ||
        status === REMINDER_STATUS.OVERDUE)
    );
  });

  // Group reminders by time
  const grouped = groupRemindersByTime(activeReminders);

  const handleComplete = (reminder) => {
    completeReminder(reminder.id);
    Alert.alert(t("reminders.upcoming.doneTitle"), t("reminders.upcoming.doneBody", { title: reminder.title }));
  };

  const handleSnooze = (reminder) => {
    setSelectedReminder(reminder);
    setSnoozeModalVisible(true);
  };

  const handleSnoozeSelect = (option) => {
    if (selectedReminder) {
      snoozeReminder(selectedReminder.id, option);
      Alert.alert(
        t("reminders.upcoming.snoozedTitle"),
        t("reminders.upcoming.snoozedBody", { title: selectedReminder.title, duration: option.label.toLowerCase() }),
      );
    }
    setSnoozeModalVisible(false);
    setSelectedReminder(null);
  };

  const handleDelete = (reminder) => {
    Alert.alert(
      t("reminders.upcoming.deleteTitle"),
      t("reminders.upcoming.deleteBody", { title: reminder.title }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            deleteReminder(reminder.id);
            Alert.alert(t("reminders.upcoming.deletedTitle"), t("reminders.upcoming.deletedBody", { title: reminder.title }));
          },
        },
      ],
    );
  };

  const ReminderCard = ({ reminder }) => {
    const config = REMINDER_TYPE_CONFIG[reminder.type];
    const status = getReminderStatus(reminder);
    const timeDisplay = getTimeDisplay(reminder);

    let statusColor = C.sage;
    if (
      status === REMINDER_STATUS.DUE_NOW ||
      status === REMINDER_STATUS.OVERDUE
    ) {
      statusColor = C.coral;
    } else if (status === REMINDER_STATUS.DUE_SOON) {
      statusColor = "#F4A460";
    }

    return (
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 18,
          padding: 16,
          borderWidth: 1.5,
          borderColor: C.peach,
          shadowColor: C.terracotta,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: (config?.color || C.sage) + "20",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 24 }}>{config?.icon || "📌"}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 3,
              }}
            >
              {reminder.title}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                marginBottom: 6,
                lineHeight: 18,
              }}
            >
              {reminder.description}
            </Text>
            <View
              style={{
                backgroundColor: statusColor + "20",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
                alignSelf: "flex-start",
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: "700", color: statusColor }}
              >
                {timeDisplay}
              </Text>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={() => handleComplete(reminder)}
              style={{
                backgroundColor: C.sage,
                borderRadius: 12,
                width: 36,
                height: 36,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <CheckCircle size={18} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(reminder)}
              style={{
                backgroundColor: C.sand,
                borderRadius: 12,
                width: 36,
                height: 36,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: C.peach,
              }}
            >
              <Trash2 size={16} color={C.mutedBrown} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => handleSnooze(reminder)}
          style={{
            marginTop: 12,
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
          <Clock size={14} color={C.mutedBrown} />
          <Text
            style={{ fontSize: 13, fontWeight: "600", color: C.mutedBrown }}
          >
            Snooze
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const ReminderGroup = ({ title, reminders, emoji }) => {
    if (reminders.length === 0) return null;

    return (
      <View style={{ marginBottom: 24 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 18, marginRight: 8 }}>{emoji}</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: C.warmBrown }}>
            {title}
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
              {reminders.length}
            </Text>
          </View>
        </View>
        <View style={{ gap: 12 }}>
          {reminders.map((reminder) => (
            <ReminderCard key={reminder.id} reminder={reminder} />
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <RefreshableScrollView
        refetch={handleRefresh}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
      >
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
              <Bell size={18} color={C.coral} style={{ marginRight: 8 }} />
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: C.warmBrown }}
              >
                Due Soon
              </Text>
            </View>
            {timeSensitiveReminders.slice(0, 2).map((reminder) => (
              <CountdownCard
                key={`${reminder.id}-${refreshKey}`}
                reminder={reminder}
                onComplete={handleComplete}
                onSnooze={handleSnooze}
              />
            ))}
          </View>
        )}

        {/* Grouped Reminders */}
        <ReminderGroup title="Now" reminders={grouped.now} emoji="🔔" />
        <ReminderGroup title="Today" reminders={grouped.today} emoji="📅" />
        <ReminderGroup
          title="Tomorrow"
          reminders={grouped.tomorrow}
          emoji="🌅"
        />
        <ReminderGroup
          title="This Week"
          reminders={grouped.thisWeek}
          emoji="📆"
        />
        <ReminderGroup title="Later" reminders={grouped.later} emoji="🗓️" />

        {/* Empty State */}
        {activeReminders.length === 0 && (
          <View
            style={{
              backgroundColor: C.sand,
              borderRadius: 16,
              padding: 40,
              alignItems: "center",
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔔</Text>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 8,
              }}
            >
              No reminders scheduled
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 20,
                marginBottom: 16,
              }}
            >
              Create a routine to generate reminders automatically
            </Text>
          </View>
        )}
      </RefreshableScrollView>

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
    </View>
  );
}
