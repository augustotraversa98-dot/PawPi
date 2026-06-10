import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  Calendar,
  TrendingUp,
  AlertCircle,
  Bell,
  ChevronRight,
  ChevronDown,
  Play,
  CheckCircle,
  Camera,
  Scale,
  Eye,
  X,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import useRemindersStore from "@/store/remindersStore";
import useRoutinesStore from "@/store/routinesStore";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  getTimeDisplay,
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
import WellnessLogModal from "./WellnessCheck/WellnessLogModal";
import FeedingIssueModal from "./FeedingIssueModal";
import { useVetAppointmentReminders } from "@/hooks/useVetAppointmentReminders";
import { useTodayReminders } from "@/hooks/useTodayReminders";
import { sectionTodayReminders } from "@/utils/reminderSections";
import { formatScheduledTime } from "@/utils/scheduledTimeFormat";
import {
  LOG_FLOWS,
  routeReminderLog,
  buildMedicalCareLogPayload,
  buildQuickFoodLogPayload,
} from "@/utils/reminderLogFlow";

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

// When Overdue holds more than this many items it defaults to collapsed so it
// doesn't push "Due Soon"/"Next Up" off-screen; the user can still expand it.
const OVERDUE_COLLAPSE_THRESHOLD = 5;

export default function HealthToday() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();
  const { reminders, completeReminder, snoozeReminder } = useRemindersStore();
  const loadRoutines = useRoutinesStore((s) => s.loadRoutines);
  const [loadedPetId, setLoadedPetId] = useState(null);
  // Fetch vet appointment reminders
  const { data: vetAppointmentReminders = [] } = useVetAppointmentReminders();
  // Reconciled Overdue list (persistent types, DB-resolved + dismissals applied),
  // plus the reactive clock every section classifies against.
  const {
    overdue: overdueReminders,
    dismiss,
    now: reminderNowMs,
    refreshNow,
  } = useTodayReminders();

  // After a log/photo/wellness save, refetch the resolver sources so the acted-on
  // overdue instance drops out of the list immediately.
  const invalidateResolution = (keys) => {
    if (currentPet?.id == null) return;
    keys.forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key, currentPet.id] }),
    );
  };

  // Pull-to-refresh: advance the section clock (so a passed item reclassifies to
  // Overdue right now, not on the next minute tick), reload the active pet's
  // routines (rebuilds the reminders store + the deterministic Overdue list) and
  // refetch the resolver sources and vet-appointment reminders that
  // Overdue/countdowns are derived from.
  const handleRefresh = useCallback(async () => {
    if (currentPet?.id == null) return;
    refreshNow();
    await loadRoutines(currentPet.id);
    await Promise.all(
      [
        "reminder-dismissals",
        "wellness-logs",
        "weight-logs",
        "medical-care-logs",
        "photo-checks",
        "vet-appointment-reminders",
      ].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key, currentPet.id] }),
      ),
    );
  }, [currentPet?.id, loadRoutines, queryClient, refreshNow]);

  // Load the active pet's routines so the reminders store is populated/refreshed
  // for whichever dog is currently selected. Mirrors RoutinesTab's guard so a
  // pet switch rebuilds Today's reminders without needing the More tab.
  useEffect(() => {
    if (currentPet?.id && currentPet.id !== loadedPetId) {
      loadRoutines(currentPet.id);
      setLoadedPetId(currentPet.id);
    }
  }, [currentPet?.id, loadedPetId, loadRoutines]);
  const [overdueExpanded, setOverdueExpanded] = useState(null);
  const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [photoCheckModalVisible, setPhotoCheckModalVisible] = useState(false);
  const [photoCheckReminder, setPhotoCheckReminder] = useState(null);
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [issueReminder, setIssueReminder] = useState(null);
  // One config-driven modal handles every wellness check type.
  const [wellnessReminder, setWellnessReminder] = useState(null);
  const [feedingIssueReminder, setFeedingIssueReminder] = useState(null);

  // Auto-refresh countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, []);

  // Combine routine reminders with vet appointment reminders, scoped to the
  // active pet. The reminders store is a flat, multi-pet array (routines carry
  // one petId today), so we filter by the active pet's id to prevent any other
  // dog's reminders from showing here. Vet reminders are already pet-scoped by
  // their query, but we filter uniformly as a safety net.
  const activePetId = currentPet?.id != null ? String(currentPet.id) : null;
  const allReminders = activePetId
    ? [...reminders, ...vetAppointmentReminders].filter(
        (r) => String(r.petId) === activePetId,
      )
    : [];

  // Items shown in the dedicated Overdue section don't also belong in the
  // time-sensitive countdown — Overdue is their single home.
  const overdueIds = new Set(overdueReminders.map((r) => r.id));

  // Collapsible Overdue. `null` = auto (collapsed when long); once the user taps,
  // their choice sticks.
  const isOverdueExpanded =
    overdueExpanded ?? overdueReminders.length <= OVERDUE_COLLAPSE_THRESHOLD;

  // Due Soon (countdown cards) / Next Up — sectioned by the shared boundary
  // (isPastDue) against the same reactive clock that drives Overdue, so the
  // sections can never disagree about which side of "now" an instance is on.
  // A past-due persistent instance belongs to Overdue alone; a future one to
  // exactly one of Due Soon / Next Up.
  const { dueSoon: timeSensitiveReminders, nextUp } = sectionTodayReminders({
    reminders: allReminders,
    overdueIds,
    now: reminderNowMs,
  });
  const nextUpReminders = nextUp.slice(0, 3);

  // Single entry point for "log/done" on ANY reminder card — today's and Overdue
  // alike. routeReminderLog owns the per-type decision; this switch only executes
  // the flow it picks, so an overdue item can never take a per-type shortcut past
  // its detail flow.
  const handleComplete = async (reminder, extra) => {
    const route = routeReminderLog(reminder, extra);

    switch (route.flow) {
      case LOG_FLOWS.VET_APPOINTMENT:
        // Vet appointment completion is handled in VetAppointmentDetailModal
        // Just acknowledge here
        Alert.alert("✅ Done!", "Vet appointment marked as completed");
        return;

      case LOG_FLOWS.PHOTO_CAPTURE:
        // Open photo check capture modal instead of just completing
        setPhotoCheckReminder(reminder);
        setPhotoCheckModalVisible(true);
        return;

      // Wellness check: open the config-driven log modal. Persistence and
      // completion happen on save, so this stays a no-op until then.
      case LOG_FLOWS.WELLNESS_MODAL:
        setWellnessReminder(reminder);
        return;

      // The detail ask the today-cards present as buttons. Picking an option
      // re-enters handleComplete with that explicit action; Cancel saves and
      // completes nothing, so the item stays in place.
      case LOG_FLOWS.MEDICAL_CHOICE:
      case LOG_FLOWS.FEEDING_CHOICE:
        Alert.alert(reminder.title, "How did it go?", [
          ...route.options.map((option) => ({
            text: option.label,
            onPress: () => handleComplete(reminder, { action: option.action }),
          })),
          { text: "Cancel", style: "cancel" },
        ]);
        return;

      case LOG_FLOWS.MEDICAL_ISSUE:
        handleSomethingOff(reminder);
        return;

      // Medical Care: save a log entry, then complete only this reminder
      case LOG_FLOWS.MEDICAL_SAVE: {
        try {
          await saveMedicalCareLog(reminder, {
            status: route.status,
            notes: route.notes,
          });
        } catch (err) {
          console.error("[HealthToday] medical care log save failed", err);
          Alert.alert(
            "Could not save",
            "We couldn't save this entry. Please try again.",
          );
          return;
        }

        completeReminder(reminder.id);
        invalidateResolution(["medical-care-logs"]);
        Alert.alert(
          "✅ Saved",
          route.savedToVetRecord
            ? `${reminder.title} saved to vet record`
            : `${reminder.title} logged`,
        );
        return;
      }

      case LOG_FLOWS.FEEDING_ISSUE:
        setFeedingIssueReminder(reminder);
        return;

      // Feeding "as usual": same quick log FeedingCountdownCard performs.
      case LOG_FLOWS.FEEDING_SAVE: {
        try {
          const res = await fetch("/api/health/food-logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildQuickFoodLogPayload(reminder, reminder.petId),
            ),
          });
          if (!res.ok) throw new Error(`Save failed: ${res.statusText}`);
        } catch (err) {
          console.error("[HealthToday] food log save failed", err);
          Alert.alert(
            "Could not save",
            "We couldn't save this entry. Please try again.",
          );
          return;
        }

        queryClient.invalidateQueries({ queryKey: ["health", "food-logs"] });
        queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
        completeReminder(reminder.id);
        Alert.alert("✅ Logged", `${reminder.title} logged`);
        return;
      }

      // For other types, mark as complete immediately
      default:
        completeReminder(reminder.id);
        Alert.alert("✅ Done!", `${reminder.title} marked as complete`);
    }
  };

  // Wellness save succeeded: complete ONLY this reminder instance. Weight routes to
  // health_weight_logs, every other check to health_wellness_logs — refetch both so
  // an acted-on overdue wellness/weight instance reconciles out immediately.
  const handleWellnessSaved = (reminderId) => {
    completeReminder(reminderId);
    invalidateResolution(["wellness-logs", "weight-logs"]);
    Alert.alert("✅ Saved", `${wellnessReminder?.title || "Entry"} logged`);
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
      invalidateResolution(["medical-care-logs"]);
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
    // Logs against the instance's scheduled day (givenAt = scheduledAt) so
    // resolution clears exactly that instance — see buildMedicalCareLogPayload.
    const payload = buildMedicalCareLogPayload(reminder, {
      status,
      notes,
      reactionOrIssue,
    });
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
    invalidateResolution(["photo-checks"]);
  };

  // Skip/dismiss an overdue instance — durably recorded so it doesn't reappear after
  // a restart. Used only from the Overdue section.
  const handleSkipOverdue = async (reminder) => {
    try {
      await dismiss(reminder);
    } catch (err) {
      console.error("[HealthToday] dismiss failed", err);
      Alert.alert(
        "Could not skip",
        "We couldn't skip this reminder. Please try again.",
      );
    }
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
    <RefreshableScrollView
      refetch={handleRefresh}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      showsVerticalScrollIndicator={false}
    >
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

      {/* Overdue — past-due persistent items, distinct + above everything else */}
      {overdueReminders.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <TouchableOpacity
            onPress={() => setOverdueExpanded(!isOverdueExpanded)}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <AlertCircle
                size={18}
                color={C.coral}
                style={{ marginRight: 8 }}
              />
              <Text style={{ fontSize: 16, fontWeight: "700", color: C.coral }}>
                Overdue ({overdueReminders.length})
              </Text>
            </View>
            {isOverdueExpanded ? (
              <ChevronDown size={20} color={C.coral} />
            ) : (
              <ChevronRight size={20} color={C.coral} />
            )}
          </TouchableOpacity>

          {isOverdueExpanded && (
            <View style={{ gap: 10 }}>
              {overdueReminders.map((reminder) => {
              const config = REMINDER_TYPE_CONFIG[reminder.type];
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
                    borderColor: C.coral + "55",
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
                          color: C.coral,
                          fontWeight: "700",
                        }}
                      >
                        {formatScheduledTime(
                          reminder.scheduledAt ?? reminder.nextTriggerAt,
                          reminderNowMs,
                        )}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleComplete(reminder)}
                      style={{
                        flex: 1,
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
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: "#FFF",
                        }}
                      >
                        {action.label}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleSkipOverdue(reminder)}
                      style={{
                        paddingHorizontal: 14,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: C.peach,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <X size={15} color={C.mutedBrown} strokeWidth={2.5} />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: C.mutedBrown,
                        }}
                      >
                        Skip
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
          )}
        </View>
      )}

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
              // Scheduled clock time first (the card's anchor), relative
              // countdown as secondary context.
              const scheduledDisplay = formatScheduledTime(
                reminder.scheduledAt ?? reminder.nextTriggerAt,
                reminderNowMs,
              );
              const relativeDisplay = getTimeDisplay(reminder);
              const timeDisplay = scheduledDisplay
                ? `${scheduledDisplay} · ${relativeDisplay}`
                : relativeDisplay;
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
      {nextUpReminders.length === 0 &&
        timeSensitiveReminders.length === 0 &&
        overdueReminders.length === 0 && (
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

      {/* Wellness Check Log Modal (config-driven, all check types) */}
      <WellnessLogModal
        visible={!!wellnessReminder}
        reminder={wellnessReminder}
        onClose={() => setWellnessReminder(null)}
        onSaved={handleWellnessSaved}
      />

      {/* Feeding Issue Modal (saves its own food log; completes only on save) */}
      <FeedingIssueModal
        visible={!!feedingIssueReminder}
        reminder={feedingIssueReminder}
        petName={currentPet?.name}
        onClose={() => setFeedingIssueReminder(null)}
        onSaved={() => {
          if (feedingIssueReminder) completeReminder(feedingIssueReminder.id);
          setFeedingIssueReminder(null);
        }}
      />
    </RefreshableScrollView>
  );
}
