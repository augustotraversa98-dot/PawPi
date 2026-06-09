import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { X, CheckCircle, Edit, Trash2, FileText } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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

export default function VetAppointmentDetailModal({
  visible,
  onClose,
  appointment,
  onComplete,
}) {
  const queryClient = useQueryClient();
  const [visitNotes, setVisitNotes] = useState("");
  const [showNotesInput, setShowNotesInput] = useState(false);

  if (!appointment) return null;

  // Mark as completed mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/vet-appointments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: appointment.id,
          status: "completed",
          notes: visitNotes
            ? `${appointment.notes || ""}\n\nVisit notes: ${visitNotes}`.trim()
            : appointment.notes,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to complete appointment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vet-appointments"] });
      queryClient.invalidateQueries({
        queryKey: ["vet-appointment-reminders"],
      });
      Alert.alert(
        "✅ Completed",
        "Appointment marked as completed and added to vet record",
      );
      setVisitNotes("");
      setShowNotesInput(false);
      onComplete?.();
      onClose();
    },
    onError: (error) => {
      console.error("[VetApptDetail] Complete error:", error);
      Alert.alert("Error", error.message || "Could not complete appointment");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/vet-appointments?id=${appointment.id}`,
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
      Alert.alert("Deleted", "Appointment has been removed");
      onComplete?.();
      onClose();
    },
    onError: (error) => {
      console.error("[VetApptDetail] Delete error:", error);
      Alert.alert("Error", error.message || "Could not delete appointment");
    },
  });

  const handleMarkCompleted = () => {
    if (!showNotesInput) {
      setShowNotesInput(true);
    } else {
      completeMutation.mutate();
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete appointment?",
      "This will remove the appointment reminder. Past vet history will stay saved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete appointment",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  const formatDateTime = () => {
    try {
      const date = new Date(
        `${appointment.appointment_date}T${appointment.appointment_time}`,
      );
      return date.toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return `${appointment.appointment_date} at ${appointment.appointment_time}`;
    }
  };

  const isPending = completeMutation.isPending || deleteMutation.isPending;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.cream }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
              🩺 Vet Appointment
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown }}>
              Appointment details
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            disabled={isPending}
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
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Appointment Title */}
          <View
            style={{
              backgroundColor: "#4DB8E8" + "10",
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              borderWidth: 1.5,
              borderColor: "#4DB8E8" + "40",
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 8,
              }}
            >
              {appointment.title}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: C.mutedBrown,
                fontWeight: "600",
              }}
            >
              📅 {formatDateTime()}
            </Text>
          </View>

          {/* Appointment Info */}
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: C.peach,
              marginBottom: 16,
            }}
          >
            {appointment.clinic && (
              <InfoRow label="Clinic" value={appointment.clinic} />
            )}
            {appointment.veterinarian && (
              <InfoRow label="Veterinarian" value={appointment.veterinarian} />
            )}
            {appointment.reason_for_visit && (
              <InfoRow label="Reason" value={appointment.reason_for_visit} />
            )}
            {appointment.notes && (
              <InfoRow label="Notes" value={appointment.notes} multiline />
            )}
          </View>

          {/* Visit Notes Input (shown when preparing to complete) */}
          {showNotesInput && (
            <View
              style={{
                backgroundColor: C.sand,
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
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
                <FileText size={18} color={C.sage} />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginLeft: 8,
                  }}
                >
                  Add visit notes (optional)
                </Text>
              </View>
              <TextInput
                value={visitNotes}
                onChangeText={setVisitNotes}
                placeholder="e.g., Rabies vaccine administered, next visit in 1 year..."
                placeholderTextColor={C.mutedBrown}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 14,
                  color: C.warmBrown,
                  textAlignVertical: "top",
                  minHeight: 90,
                }}
              />
            </View>
          )}
        </ScrollView>

        {/* Action Buttons */}
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
          {/* Mark Completed */}
          <TouchableOpacity
            onPress={handleMarkCompleted}
            disabled={isPending}
            style={{
              backgroundColor: isPending ? C.mutedBrown : C.sage,
              borderRadius: 14,
              paddingVertical: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {completeMutation.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <CheckCircle size={18} color="#FFF" />
                <Text
                  style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}
                >
                  {showNotesInput
                    ? "Confirm & mark completed"
                    : "Mark as completed"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Delete */}
          {!showNotesInput && (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={isPending}
              style={{
                backgroundColor: C.sand,
                borderRadius: 14,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: C.coral,
              }}
            >
              {deleteMutation.isPending ? (
                <ActivityIndicator color={C.coral} />
              ) : (
                <>
                  <Trash2 size={16} color={C.coral} />
                  <Text
                    style={{ fontSize: 14, fontWeight: "700", color: C.coral }}
                  >
                    Delete appointment
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Cancel (when showing notes input) */}
          {showNotesInput && (
            <TouchableOpacity
              onPress={() => {
                setShowNotesInput(false);
                setVisitNotes("");
              }}
              disabled={isPending}
              style={{
                backgroundColor: C.sand,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: C.peach,
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: C.mutedBrown }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Helper component
function InfoRow({ label, value, multiline }) {
  return (
    <View
      style={{
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#FFE5D9" + "60",
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: "#8B7355",
          marginBottom: 4,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: "#3B241B",
          lineHeight: multiline ? 20 : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
