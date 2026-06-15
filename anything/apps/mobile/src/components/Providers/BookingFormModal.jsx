import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert } from "react-native";
import { COLORS } from "@/constants/colors";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useBookProvider } from "@/hooks/useProviders";

const REASONS = ["Checkup", "Vaccination", "Injury", "Dental", "Grooming"];

function formatPrice(cents) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function SectionLabel({ children }) {
  return (
    <Text
      style={{
        fontSize: 14,
        fontWeight: "800",
        color: COLORS.warmBrown,
        marginBottom: 10,
        marginTop: 4,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * BookingFormModal — owner books the active pet with a provider.
 *
 * Posts to /api/providers/[id]/book via useBookProvider. service_id /
 * provider_location_id are optional and, when sent, are ALWAYS ids that came
 * from this provider's profile (contract #2). Blocks (no POST) when there is no
 * active pet, mirroring the "pick a pet" guard used for barks.
 */
export default function BookingFormModal({
  visible,
  onClose,
  provider,
  locations = [],
  services = [],
}) {
  const { data: currentPet } = useCurrentPet();
  const book = useBookProvider();

  const [serviceId, setServiceId] = useState(null); // null = "General"
  const [locationId, setLocationId] = useState(null);
  const [date, setDate] = useState(""); // canonical YYYY-MM-DD from DateField
  const [time, setTime] = useState(""); // canonical HH:MM from TimeField
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const resetAndClose = () => {
    setServiceId(null);
    setLocationId(null);
    setDate("");
    setTime("");
    setReason("");
    setNotes("");
    onClose?.();
  };

  const handleConfirm = async () => {
    // No active pet → block with a friendly message, never POST.
    if (!currentPet?.id) {
      Alert.alert(
        "No active pet",
        "Add or select a pet before booking an appointment.",
      );
      return;
    }
    if (!date || !time) {
      Alert.alert(
        "Pick a date and time",
        "Choose when you'd like the appointment.",
      );
      return;
    }

    try {
      await book.mutateAsync({
        providerId: provider.id,
        petId: currentPet.id,
        // Only send ids when chosen; both are ids from THIS provider's profile.
        service_id: serviceId ?? undefined,
        provider_location_id: locationId ?? undefined,
        appointment_date: date,
        appointment_time: time,
        reason_for_visit: reason || undefined,
        notes: notes || undefined,
      });
      resetAndClose();
      Alert.alert(
        "Request sent!",
        `${provider.name} will confirm your appointment soon.`,
      );
    } catch (err) {
      // Surface backend 400/403/404 messages instead of swallowing them.
      Alert.alert("Couldn't book", err?.message || "Please try again.");
    }
  };

  return (
    <KeyboardSafeFormModal
      visible={visible}
      onClose={resetAndClose}
      title={provider ? `Book with ${provider.name}` : "Book appointment"}
      subtitle={
        currentPet?.id
          ? `For ${currentPet.name}`
          : "Add a pet to book an appointment"
      }
      icon="🏥"
      ctaLabel={book.isPending ? "Sending…" : "Confirm appointment"}
      ctaColor={COLORS.coral}
      onCtaPress={handleConfirm}
      ctaDisabled={book.isPending}
      backgroundColor={COLORS.cream}
    >
      {!currentPet?.id && (
        <View
          style={{
            backgroundColor: COLORS.sand,
            borderRadius: 12,
            padding: 14,
            marginBottom: 18,
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <Text style={{ color: COLORS.mutedBrown, fontSize: 14 }}>
            You don't have an active pet yet. Add or select a pet first, then
            come back to book.
          </Text>
        </View>
      )}

      {/* Service (optional) */}
      <SectionLabel>Service</SectionLabel>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 18 }}
      >
        <Chip
          label="General"
          selected={serviceId == null}
          onPress={() => setServiceId(null)}
        />
        {services.map((s) => (
          <Chip
            key={s.id}
            label={
              formatPrice(s.price_cents)
                ? `${s.name} · ${formatPrice(s.price_cents)}`
                : s.name
            }
            selected={serviceId === s.id}
            onPress={() => setServiceId(s.id)}
            testID={`booking-service-${s.id}`}
          />
        ))}
      </View>

      {/* Location (optional) */}
      {locations.length > 0 && (
        <>
          <SectionLabel>Location</SectionLabel>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 9,
              marginBottom: 18,
            }}
          >
            <Chip
              label="Any"
              selected={locationId == null}
              onPress={() => setLocationId(null)}
            />
            {locations.map((l) => (
              <Chip
                key={l.id}
                label={l.name}
                selected={locationId === l.id}
                onPress={() => setLocationId(l.id)}
                testID={`booking-location-${l.id}`}
              />
            ))}
          </View>
        </>
      )}

      {/* Date + Time — shared canonical fields */}
      <SectionLabel>Date</SectionLabel>
      <View style={{ marginBottom: 16 }}>
        <DateField value={date} onChange={setDate} testID="booking-date" />
      </View>

      <SectionLabel>Time</SectionLabel>
      <View style={{ marginBottom: 16 }}>
        <TimeField value={time} onChange={setTime} testID="booking-time" />
      </View>

      {/* Reason for visit (optional chips) */}
      <SectionLabel>Reason for visit</SectionLabel>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 18 }}
      >
        {REASONS.map((r) => (
          <Chip
            key={r}
            label={r}
            selected={reason === r}
            onPress={() => setReason((cur) => (cur === r ? "" : r))}
          />
        ))}
      </View>

      {/* Notes (optional) */}
      <SectionLabel>Notes</SectionLabel>
      <TextInput
        placeholder="Describe symptoms or special needs…"
        placeholderTextColor={COLORS.mutedBrown}
        style={{
          backgroundColor: COLORS.card,
          borderRadius: 12,
          padding: 14,
          minHeight: 90,
          textAlignVertical: "top",
          color: COLORS.warmBrown,
          borderWidth: 1,
          borderColor: COLORS.peach,
        }}
        multiline
        value={notes}
        onChangeText={setNotes}
      />
    </KeyboardSafeFormModal>
  );
}

function Chip({ label, selected, onPress, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.coral : COLORS.peach,
        backgroundColor: selected ? COLORS.coral : COLORS.sand,
      }}
    >
      <Text
        style={{
          fontWeight: "700",
          color: selected ? "#FFF" : COLORS.mutedBrown,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
