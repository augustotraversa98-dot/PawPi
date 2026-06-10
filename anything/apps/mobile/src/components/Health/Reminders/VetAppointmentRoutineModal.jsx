import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { X, Plus, ChevronDown, ChevronUp, Calendar } from "lucide-react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  addVetAppointmentToCalendar,
  updateVetAppointmentInCalendar,
  deleteVetAppointmentFromCalendar,
} from "@/utils/calendarIntegration";

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

const REMINDER_TIMING_OPTIONS = [
  { value: "at_time", label: "At time of appointment" },
  { value: "1_hour_before", label: "1 hour before" },
  { value: "1_day_before", label: "1 day before" },
  { value: "2_days_before", label: "2 days before" },
  { value: "1_week_before", label: "1 week before" },
  { value: "custom", label: "Custom" },
];

export default function VetAppointmentRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine, // Not used - kept for backward compatibility
}) {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  const [appointments, setAppointments] = useState([]);
  const [expandedAppointmentId, setExpandedAppointmentId] = useState(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);

  // Form state for creating/editing
  const [formData, setFormData] = useState({
    title: "",
    appointmentDate: "",
    appointmentTime: "10:00",
    clinic: "",
    veterinarian: "",
    reasonForVisit: "",
    notes: "",
    reminderEnabled: true,
    timeSensitive: true,
    reminderTiming: "1_day_before",
    addToCalendar: false,
  });

  // Fetch appointments
  const { data: appointmentsData, isLoading } = useQuery({
    queryKey: ["vet-appointments", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { appointments: [] };
      const response = await fetch(
        `/api/vet-appointments?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch appointments");
      return response.json();
    },
    enabled: visible && !!currentPet?.id,
  });

  // Update local appointments when data changes
  useEffect(() => {
    if (appointmentsData?.appointments) {
      setAppointments(appointmentsData.appointments);
    }
  }, [appointmentsData]);

  // Create appointment mutation
  const createMutation = useMutation({
    mutationFn: async (appointmentData) => {
      let calendarEventId = null;

      // Try to add to calendar if requested
      if (appointmentData.addToCalendar) {
        const calendarResult = await addVetAppointmentToCalendar(
          appointmentData,
          currentPet?.name || "Your pet",
        );

        if (calendarResult.success) {
          calendarEventId = calendarResult.eventId;
        } else if (calendarResult.error === "permission_denied") {
          Alert.alert(
            "Calendar Permission",
            "Calendar access is needed to add this appointment. You can still save the reminder.",
          );
        } else {
          Alert.alert(
            "Calendar Unavailable",
            "Could not add to calendar, but the appointment will still be saved.",
          );
        }
      }

      const response = await fetch("/api/vet-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...appointmentData,
          calendarEventId,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create appointment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vet-appointments"] });
      queryClient.invalidateQueries({
        queryKey: ["vet-appointment-reminders"],
      });
      Alert.alert("Success", "Appointment created");
      resetForm();
    },
    onError: (error) => {
      console.error("[VetAppt] Create error:", error);
      Alert.alert("Error", error.message || "Could not create appointment");
    },
  });

  // Update appointment mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...appointmentData }) => {
      // Get the existing appointment to check for calendar_event_id
      const existingAppointment = appointments.find((a) => a.id === id);

      let calendarEventId = existingAppointment?.calendar_event_id || null;

      // Calendar handling
      if (appointmentData.addToCalendar) {
        if (calendarEventId) {
          // Update existing calendar event
          const updateResult = await updateVetAppointmentInCalendar(
            calendarEventId,
            appointmentData,
            currentPet?.name || "Your pet",
          );

          if (!updateResult.success) {
            Alert.alert(
              "Calendar Update Failed",
              "Appointment saved, but calendar could not be updated.",
            );
          }
        } else {
          // Create new calendar event
          const createResult = await addVetAppointmentToCalendar(
            appointmentData,
            currentPet?.name || "Your pet",
          );

          if (createResult.success) {
            calendarEventId = createResult.eventId;
          } else if (createResult.error !== "permission_denied") {
            Alert.alert(
              "Calendar Unavailable",
              "Could not add to calendar, but the appointment will still be saved.",
            );
          }
        }
      } else if (calendarEventId) {
        // User disabled calendar sync - remove from calendar
        await deleteVetAppointmentFromCalendar(calendarEventId);
        calendarEventId = null;
      }

      const response = await fetch("/api/vet-appointments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...appointmentData, calendarEventId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update appointment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vet-appointments"] });
      queryClient.invalidateQueries({
        queryKey: ["vet-appointment-reminders"],
      });
      Alert.alert("Success", "Appointment updated");
      resetForm();
      setEditingAppointmentId(null);
    },
    onError: (error) => {
      console.error("[VetAppt] Update error:", error);
      Alert.alert("Error", error.message || "Could not update appointment");
    },
  });

  // Delete appointment mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ appointmentId, deleteFromCalendar }) => {
      const appointment = appointments.find((a) => a.id === appointmentId);

      // Delete from calendar if requested and calendar_event_id exists
      if (deleteFromCalendar && appointment?.calendar_event_id) {
        await deleteVetAppointmentFromCalendar(appointment.calendar_event_id);
      }

      const response = await fetch(
        `/api/vet-appointments?id=${appointmentId}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete appointment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vet-appointments"] });
      queryClient.invalidateQueries({
        queryKey: ["vet-appointment-reminders"],
      });
      Alert.alert("Deleted", "Appointment removed");
    },
    onError: (error) => {
      console.error("[VetAppt] Delete error:", error);
      Alert.alert("Error", error.message || "Could not delete appointment");
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      appointmentDate: "",
      appointmentTime: "10:00",
      clinic: "",
      veterinarian: "",
      reasonForVisit: "",
      notes: "",
      reminderEnabled: true,
      timeSensitive: true,
      reminderTiming: "1_day_before",
      addToCalendar: false,
    });
    setExpandedAppointmentId(null);
  };

  const handleAddAppointment = () => {
    resetForm();
    const newId = `new_${Date.now()}`;
    setEditingAppointmentId(newId);
    setExpandedAppointmentId(newId);
  };

  const handleEditAppointment = (appointment) => {
    setFormData({
      title: appointment.title || "",
      appointmentDate: appointment.appointment_date || "",
      appointmentTime: appointment.appointment_time || "10:00",
      clinic: appointment.clinic || "",
      veterinarian: appointment.veterinarian || "",
      reasonForVisit: appointment.reason_for_visit || "",
      notes: appointment.notes || "",
      reminderEnabled: appointment.reminder_enabled ?? true,
      timeSensitive: appointment.time_sensitive ?? true,
      reminderTiming: appointment.reminder_timing || "1_day_before",
      addToCalendar: appointment.add_to_calendar ?? false,
    });
    setEditingAppointmentId(appointment.id);
    setExpandedAppointmentId(appointment.id);
  };

  const validateDate = (dateStr) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date);
  };

  const validateTime = (timeStr) => {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(timeStr);
  };

  const handleSaveAppointment = () => {
    // Validate required fields
    if (!formData.title.trim()) {
      Alert.alert("Validation Error", "Appointment title is required");
      return;
    }
    if (!formData.appointmentDate.trim()) {
      Alert.alert("Validation Error", "Date is required");
      return;
    }
    if (!validateDate(formData.appointmentDate)) {
      Alert.alert("Validation Error", "Please select a valid date");
      return;
    }
    if (!validateTime(formData.appointmentTime)) {
      Alert.alert("Validation Error", "Please select a time");
      return;
    }

    const appointmentData = {
      petId: currentPet.id,
      title: formData.title,
      appointmentDate: formData.appointmentDate,
      appointmentTime: formData.appointmentTime,
      clinic: formData.clinic || null,
      veterinarian: formData.veterinarian || null,
      reasonForVisit: formData.reasonForVisit || null,
      notes: formData.notes || null,
      reminderEnabled: formData.reminderEnabled,
      timeSensitive: formData.timeSensitive,
      reminderTiming: formData.reminderTiming,
      addToCalendar: formData.addToCalendar,
    };

    if (typeof editingAppointmentId === "number") {
      // Update existing
      updateMutation.mutate({ id: editingAppointmentId, ...appointmentData });
    } else {
      // Create new
      createMutation.mutate(appointmentData);
    }
  };

  const handleDeleteAppointment = (appointmentId) => {
    const appointment = appointments.find((a) => a.id === appointmentId);

    if (appointment?.calendar_event_id) {
      // Show options if appointment has calendar event
      Alert.alert(
        "Delete appointment?",
        "Also remove this from your phone calendar?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete appointment only",
            onPress: () =>
              deleteMutation.mutate({
                appointmentId,
                deleteFromCalendar: false,
              }),
          },
          {
            text: "Delete appointment and calendar event",
            style: "destructive",
            onPress: () =>
              deleteMutation.mutate({
                appointmentId,
                deleteFromCalendar: true,
              }),
          },
        ],
      );
    } else {
      // No calendar event, simple delete
      Alert.alert(
        "Delete appointment?",
        "This will remove the appointment reminder. Past vet history will stay saved.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete appointment",
            style: "destructive",
            onPress: () =>
              deleteMutation.mutate({
                appointmentId,
                deleteFromCalendar: false,
              }),
          },
        ],
      );
    }
  };

  const handleCancel = () => {
    resetForm();
    setEditingAppointmentId(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    try {
      const [hours, minutes] = timeStr.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  const isEditing = editingAppointmentId !== null;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal visible={visible} animationType="slide">
      <KeyboardAvoidingAnimatedView
        style={{ flex: 1, backgroundColor: C.cream }}
        behavior="padding"
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 20,
            paddingTop: 60,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 4,
              }}
            >
              🩺 Vet Appointments
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown }}>
              Manage upcoming vet visits
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: C.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <X size={20} color={C.warmBrown} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color={C.sage} />
            </View>
          ) : (
            <>
              {/* Editing/Creating Form */}
              {isEditing && (
                <View
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 2,
                    borderColor: C.sage,
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 16,
                    }}
                  >
                    {typeof editingAppointmentId === "number"
                      ? "Edit Appointment"
                      : "New Appointment"}
                  </Text>

                  {/* Title */}
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: C.mutedBrown,
                      marginBottom: 6,
                    }}
                  >
                    Appointment Title *
                  </Text>
                  <TextInput
                    value={formData.title}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, title: text }))
                    }
                    placeholder="e.g., Annual Checkup"
                    placeholderTextColor={C.mutedBrown}
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: C.warmBrown,
                      marginBottom: 12,
                    }}
                  />

                  {/* Date and Time — stacked so the inline pickers have full width */}
                  <View style={{ gap: 12, marginBottom: 12 }}>
                    <View>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: C.mutedBrown,
                          marginBottom: 6,
                        }}
                      >
                        Date *
                      </Text>
                      <DateField
                        value={formData.appointmentDate}
                        onChange={(date) =>
                          setFormData((prev) => ({
                            ...prev,
                            appointmentDate: date,
                          }))
                        }
                        fieldStyle={{
                          backgroundColor: C.sand,
                          borderWidth: 0,
                        }}
                      />
                    </View>
                    <View>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: C.mutedBrown,
                          marginBottom: 6,
                        }}
                      >
                        Time *
                      </Text>
                      <TimeField
                        value={formData.appointmentTime}
                        onChange={(time) =>
                          setFormData((prev) => ({
                            ...prev,
                            appointmentTime: time,
                          }))
                        }
                        fieldStyle={{
                          backgroundColor: C.sand,
                          borderWidth: 0,
                        }}
                      />
                    </View>
                  </View>

                  {/* Clinic */}
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: C.mutedBrown,
                      marginBottom: 6,
                    }}
                  >
                    Clinic (optional)
                  </Text>
                  <TextInput
                    value={formData.clinic}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, clinic: text }))
                    }
                    placeholder="Clinic name"
                    placeholderTextColor={C.mutedBrown}
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: C.warmBrown,
                      marginBottom: 12,
                    }}
                  />

                  {/* Veterinarian */}
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: C.mutedBrown,
                      marginBottom: 6,
                    }}
                  >
                    Veterinarian (optional)
                  </Text>
                  <TextInput
                    value={formData.veterinarian}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, veterinarian: text }))
                    }
                    placeholder="Dr. name"
                    placeholderTextColor={C.mutedBrown}
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 15,
                      color: C.warmBrown,
                      marginBottom: 12,
                    }}
                  />

                  {/* Reason for Visit */}
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: C.mutedBrown,
                      marginBottom: 6,
                    }}
                  >
                    Reason for Visit (optional)
                  </Text>
                  <TextInput
                    value={formData.reasonForVisit}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, reasonForVisit: text }))
                    }
                    placeholder="e.g., Annual checkup"
                    placeholderTextColor={C.mutedBrown}
                    multiline
                    numberOfLines={2}
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 14,
                      color: C.warmBrown,
                      textAlignVertical: "top",
                      minHeight: 60,
                      marginBottom: 12,
                    }}
                  />

                  {/* Notes */}
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: C.mutedBrown,
                      marginBottom: 6,
                    }}
                  >
                    Notes (optional)
                  </Text>
                  <TextInput
                    value={formData.notes}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, notes: text }))
                    }
                    placeholder="Additional notes..."
                    placeholderTextColor={C.mutedBrown}
                    multiline
                    numberOfLines={3}
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 14,
                      color: C.warmBrown,
                      textAlignVertical: "top",
                      minHeight: 70,
                      marginBottom: 12,
                    }}
                  />

                  {/* Reminder Timing */}
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: C.mutedBrown,
                      marginBottom: 6,
                    }}
                  >
                    Reminder Timing
                  </Text>
                  <View style={{ gap: 6, marginBottom: 12 }}>
                    {REMINDER_TIMING_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() =>
                          setFormData((prev) => ({
                            ...prev,
                            reminderTiming: option.value,
                          }))
                        }
                        style={{
                          backgroundColor:
                            formData.reminderTiming === option.value
                              ? C.sage + "20"
                              : C.sand,
                          borderRadius: 10,
                          padding: 12,
                          borderWidth: 1,
                          borderColor:
                            formData.reminderTiming === option.value
                              ? C.sage
                              : C.peach,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight:
                              formData.reminderTiming === option.value
                                ? "700"
                                : "600",
                            color:
                              formData.reminderTiming === option.value
                                ? C.sage
                                : C.warmBrown,
                          }}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Settings */}
                  <View
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: C.warmBrown,
                        }}
                      >
                        Reminder enabled
                      </Text>
                      <Switch
                        value={formData.reminderEnabled}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            reminderEnabled: value,
                          }))
                        }
                        trackColor={{ false: C.peach, true: C.sage + "60" }}
                        thumbColor={formData.reminderEnabled ? C.sage : C.peach}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: C.warmBrown,
                        }}
                      >
                        Time-sensitive
                      </Text>
                      <Switch
                        value={formData.timeSensitive}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            timeSensitive: value,
                          }))
                        }
                        trackColor={{ false: C.peach, true: C.coral + "60" }}
                        thumbColor={formData.timeSensitive ? C.coral : C.peach}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: C.warmBrown,
                        }}
                      >
                        Add to phone calendar
                      </Text>
                      <Switch
                        value={formData.addToCalendar}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            addToCalendar: value,
                          }))
                        }
                        trackColor={{ false: C.peach, true: "#4DB8E8" + "60" }}
                        thumbColor={
                          formData.addToCalendar ? "#4DB8E8" : C.peach
                        }
                      />
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TouchableOpacity
                      onPress={handleCancel}
                      disabled={isSaving}
                      style={{
                        flex: 1,
                        backgroundColor: C.sand,
                        borderRadius: 12,
                        paddingVertical: 14,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: C.peach,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: C.mutedBrown,
                        }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveAppointment}
                      disabled={isSaving}
                      style={{
                        flex: 1,
                        backgroundColor: isSaving ? C.mutedBrown : C.sage,
                        borderRadius: 12,
                        paddingVertical: 14,
                        alignItems: "center",
                      }}
                    >
                      {isSaving ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: "#FFF",
                          }}
                        >
                          {typeof editingAppointmentId === "number"
                            ? "Update"
                            : "Create"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Appointments List */}
              {!isEditing && (
                <>
                  {appointments.length === 0 ? (
                    // Empty State
                    <View
                      style={{
                        backgroundColor: C.card,
                        borderRadius: 16,
                        padding: 24,
                        borderWidth: 1.5,
                        borderColor: C.peach,
                        alignItems: "center",
                        marginBottom: 20,
                      }}
                    >
                      <Text style={{ fontSize: 48, marginBottom: 12 }}>🩺</Text>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: C.warmBrown,
                          marginBottom: 8,
                          textAlign: "center",
                        }}
                      >
                        No vet appointments yet
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          color: C.mutedBrown,
                          textAlign: "center",
                          lineHeight: 20,
                        }}
                      >
                        Add upcoming visits so Social Pet can remind you and
                        keep your dog's health history organized.
                      </Text>
                    </View>
                  ) : (
                    <>
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
                            fontSize: 15,
                            fontWeight: "700",
                            color: C.warmBrown,
                          }}
                        >
                          Upcoming Appointments
                        </Text>
                      </View>

                      {/* Appointment Cards */}
                      {appointments.map((appt) => {
                        const isExpanded = expandedAppointmentId === appt.id;
                        return (
                          <View
                            key={appt.id}
                            style={{
                              backgroundColor: C.card,
                              borderRadius: 16,
                              padding: 16,
                              borderWidth: 1.5,
                              borderColor: isExpanded ? C.sage : C.peach,
                              marginBottom: 12,
                            }}
                          >
                            {/* Appointment Header */}
                            <TouchableOpacity
                              onPress={() =>
                                setExpandedAppointmentId(
                                  isExpanded ? null : appt.id,
                                )
                              }
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  flex: 1,
                                }}
                              >
                                <View
                                  style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 21,
                                    backgroundColor: C.sage + "20",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    marginRight: 12,
                                  }}
                                >
                                  <Calendar size={20} color={C.sage} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={{
                                      fontSize: 16,
                                      fontWeight: "700",
                                      color: C.warmBrown,
                                      marginBottom: 2,
                                    }}
                                  >
                                    {appt.title}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      color: C.mutedBrown,
                                    }}
                                  >
                                    {formatDate(appt.appointment_date)} •{" "}
                                    {formatTime(appt.appointment_time)}
                                  </Text>
                                  {appt.clinic && (
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: C.mutedBrown,
                                        marginTop: 2,
                                      }}
                                    >
                                      📍 {appt.clinic}
                                    </Text>
                                  )}
                                </View>
                              </View>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronUp size={20} color={C.mutedBrown} />
                                ) : (
                                  <ChevronDown size={20} color={C.mutedBrown} />
                                )}
                              </View>
                            </TouchableOpacity>

                            {/* Expanded Content */}
                            {isExpanded && (
                              <View style={{ marginTop: 16 }}>
                                {appt.veterinarian && (
                                  <View style={{ marginBottom: 8 }}>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: C.mutedBrown,
                                        marginBottom: 2,
                                      }}
                                    >
                                      Veterinarian
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 14,
                                        fontWeight: "600",
                                        color: C.warmBrown,
                                      }}
                                    >
                                      {appt.veterinarian}
                                    </Text>
                                  </View>
                                )}
                                {appt.reason_for_visit && (
                                  <View style={{ marginBottom: 8 }}>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: C.mutedBrown,
                                        marginBottom: 2,
                                      }}
                                    >
                                      Reason
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 14,
                                        color: C.warmBrown,
                                      }}
                                    >
                                      {appt.reason_for_visit}
                                    </Text>
                                  </View>
                                )}
                                {appt.notes && (
                                  <View style={{ marginBottom: 8 }}>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: C.mutedBrown,
                                        marginBottom: 2,
                                      }}
                                    >
                                      Notes
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 14,
                                        color: C.warmBrown,
                                      }}
                                    >
                                      {appt.notes}
                                    </Text>
                                  </View>
                                )}
                                <View style={{ marginBottom: 8 }}>
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      color: C.mutedBrown,
                                      marginBottom: 2,
                                    }}
                                  >
                                    Reminder
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 14,
                                      fontWeight: "600",
                                      color: C.warmBrown,
                                    }}
                                  >
                                    {appt.reminder_enabled
                                      ? REMINDER_TIMING_OPTIONS.find(
                                          (o) =>
                                            o.value === appt.reminder_timing,
                                        )?.label || "Enabled"
                                      : "Disabled"}
                                  </Text>
                                </View>

                                {/* Action Buttons */}
                                <View
                                  style={{
                                    flexDirection: "row",
                                    gap: 10,
                                    marginTop: 12,
                                  }}
                                >
                                  <TouchableOpacity
                                    onPress={() => handleEditAppointment(appt)}
                                    style={{
                                      flex: 1,
                                      backgroundColor: C.sage,
                                      borderRadius: 12,
                                      paddingVertical: 12,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 14,
                                        fontWeight: "700",
                                        color: "#FFF",
                                      }}
                                    >
                                      Edit
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() =>
                                      handleDeleteAppointment(appt.id)
                                    }
                                    disabled={deleteMutation.isPending}
                                    style={{
                                      flex: 1,
                                      backgroundColor: C.coral,
                                      borderRadius: 12,
                                      paddingVertical: 12,
                                      alignItems: "center",
                                      opacity: deleteMutation.isPending
                                        ? 0.6
                                        : 1,
                                    }}
                                  >
                                    {deleteMutation.isPending ? (
                                      <ActivityIndicator
                                        color="#FFF"
                                        size="small"
                                      />
                                    ) : (
                                      <Text
                                        style={{
                                          fontSize: 14,
                                          fontWeight: "700",
                                          color: "#FFF",
                                        }}
                                      >
                                        Delete
                                      </Text>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </>
                  )}

                  {/* Add Appointment Button */}
                  <TouchableOpacity
                    onPress={handleAddAppointment}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: C.card,
                      borderRadius: 14,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: C.peach,
                      borderStyle: "dashed",
                    }}
                  >
                    <Plus size={20} color={C.sage} strokeWidth={2.5} />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: C.sage,
                        marginLeft: 8,
                      }}
                    >
                      Add appointment
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* Close Button - Fixed at bottom */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 20,
            paddingBottom: 30,
            borderTopWidth: 1,
            borderTopColor: C.peach,
            backgroundColor: C.cream,
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={{
              backgroundColor: C.warmBrown,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingAnimatedView>
    </Modal>
  );
}
