import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { X, CheckCircle, Edit, Trash2, FileText, Star } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import WriteReviewModal from "@/components/Providers/WriteReviewModal";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";

export default function VetAppointmentDetailModal({
  visible,
  onClose,
  appointment,
  onComplete,
}) {
  const queryClient = useQueryClient();
  const [visitNotes, setVisitNotes] = useState("");
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [showReview, setShowReview] = useState(false);

  if (!appointment) return null;

  // A review can only be written after a COMPLETED appointment that was booked with a
  // provider (provider_id set). The backend re-checks (completed booking + one-per-booking),
  // so this is just the entry point — shown only when both conditions hold.
  const canReview =
    appointment.status === "completed" && appointment.provider_id != null;

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
        style={{ flex: 1, backgroundColor: COLORS.cream }}
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
            borderBottomColor: MATERIALS.hairline,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[TYPE.title2, { color: COLORS.warmBrown, marginBottom: SPACING.xs }]}
            >
              🩺 Vet Appointment
            </Text>
            <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
              Appointment details
            </Text>
          </View>
          <PressableScale
            onPress={onClose}
            disabled={isPending}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: MATERIALS.surfaceSunken,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <X size={20} color={COLORS.warmBrown} />
          </PressableScale>
        </View>

        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
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
                color: COLORS.warmBrown,
                marginBottom: 8,
              }}
            >
              {appointment.title}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: COLORS.mutedBrown,
                fontWeight: "600",
              }}
            >
              📅 {formatDateTime()}
            </Text>
          </View>

          {/* Appointment Info */}
          <Card level="sm" style={{ padding: SPACING.lg, marginBottom: SPACING.lg }}>
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
          </Card>

          {/* Visit Notes Input (shown when preparing to complete) */}
          {showNotesInput && (
            <View
              style={{
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: MATERIALS.hairline,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <FileText size={18} color={COLORS.sage} />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: COLORS.warmBrown,
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
                placeholderTextColor={COLORS.mutedBrown}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: MATERIALS.surface,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 14,
                  color: COLORS.warmBrown,
                  textAlignVertical: "top",
                  minHeight: 90,
                }}
              />
            </View>
          )}
        </KeyboardAwareScrollView>

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
            borderTopColor: MATERIALS.hairline,
            backgroundColor: COLORS.cream,
          }}
        >
          {/* Write a review — shown ONLY after a completed provider appointment */}
          {canReview && !showNotesInput && (
            <PressableScale
              onPress={() => setShowReview(true)}
              disabled={isPending}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.control,
                paddingVertical: SPACING.lg,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.sm,
                marginBottom: SPACING.md - 2,
              }}
            >
              <Star size={18} color="#FFF" fill="#FFF" />
              <Text style={[TYPE.headline, { fontWeight: "700", color: "#FFF" }]}>
                Write a review
              </Text>
            </PressableScale>
          )}

          {/* Mark Completed — hidden once already completed */}
          {appointment.status !== "completed" && (
            <PressableScale
              onPress={handleMarkCompleted}
              disabled={isPending}
              style={{
                backgroundColor: isPending ? COLORS.mutedBrown : COLORS.sage,
                borderRadius: RADIUS.control,
                paddingVertical: SPACING.lg,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.sm,
                marginBottom: SPACING.md - 2,
              }}
            >
              {completeMutation.isPending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <CheckCircle size={18} color="#FFF" />
                  <Text style={[TYPE.headline, { fontWeight: "700", color: "#FFF" }]}>
                    {showNotesInput
                      ? "Confirm & mark completed"
                      : "Mark as completed"}
                  </Text>
                </>
              )}
            </PressableScale>
          )}

          {/* Delete */}
          {!showNotesInput && (
            <PressableScale
              onPress={handleDelete}
              disabled={isPending}
              style={{
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: RADIUS.control,
                paddingVertical: SPACING.lg - 2,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.sm,
                borderWidth: 1,
                borderColor: COLORS.coral,
              }}
            >
              {deleteMutation.isPending ? (
                <ActivityIndicator color={COLORS.coral} />
              ) : (
                <>
                  <Trash2 size={16} color={COLORS.coral} />
                  <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.coral }]}>
                    Delete appointment
                  </Text>
                </>
              )}
            </PressableScale>
          )}

          {/* Cancel (when showing notes input) */}
          {showNotesInput && (
            <PressableScale
              onPress={() => {
                setShowNotesInput(false);
                setVisitNotes("");
              }}
              disabled={isPending}
              style={{
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: RADIUS.control,
                paddingVertical: SPACING.lg - 2,
                alignItems: "center",
                borderWidth: 1,
                borderColor: MATERIALS.hairline,
              }}
            >
              <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.mutedBrown }]}>
                Cancel
              </Text>
            </PressableScale>
          )}
        </View>

        <WriteReviewModal
          visible={showReview}
          onClose={() => setShowReview(false)}
          providerId={appointment.provider_id}
          providerName={appointment.title}
          petId={appointment.pet_id}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Helper component
function InfoRow({ label, value, multiline }) {
  return (
    <View
      style={{
        paddingVertical: SPACING.sm + 2,
        borderBottomWidth: 1,
        borderBottomColor: MATERIALS.hairline,
      }}
    >
      <Text
        style={[TYPE.footnote, { color: COLORS.mutedBrown, marginBottom: SPACING.xs, fontWeight: "600" }]}
      >
        {label}
      </Text>
      <Text
        style={[
          TYPE.callout,
          {
            fontWeight: "600",
            color: COLORS.warmBrown,
            lineHeight: multiline ? 20 : undefined,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
