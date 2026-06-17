import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert } from "react-native";
import { COLORS } from "@/constants/colors";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useBookProvider } from "@/hooks/useProviders";

// Per-capability copy so the SAME modal serves vet / grooming / walking / daycare /
// sitting / training (ticket 2.4 — generalize the book flow to any capability). Falls
// back to a generic "service" label for any capability not listed. Vet stays exactly as
// it was (icon, title, reason chips) so the existing flow is unchanged.
const CAPABILITY_COPY = {
  vet: {
    icon: "🏥",
    noun: "appointment",
    reasons: ["Checkup", "Vaccination", "Injury", "Dental", "Grooming"],
  },
  groomer: {
    icon: "✂️",
    noun: "grooming",
    reasons: ["Full groom", "Bath & tidy", "Nail trim", "De-shed"],
    // Grooming is naturally a recurring cycle (ticket 2.6). Offer "every 6 weeks" so the
    // booking carries a recurrence_rule (2.4) and the EXISTING reminder engine nudges the
    // owner to re-book — no new reminder path. iCal RRULE; INTERVAL=6 weeks.
    recurrence: { label: "Repeat every 6 weeks", rule: "FREQ=WEEKLY;INTERVAL=6" },
  },
  walker: { icon: "🐾", noun: "walk", reasons: ["30 min walk", "60 min walk", "Group walk", "Puppy walk"] },
  daycare: { icon: "🏠", noun: "daycare", reasons: ["Half day", "Full day", "Recurring"] },
  sitter: { icon: "🧸", noun: "sitting", reasons: ["Drop-in", "Overnight", "House sit"] },
  trainer: { icon: "🎓", noun: "training", reasons: ["Puppy basics", "Obedience", "Behaviour", "1-on-1"] },
};

const DEFAULT_COPY = { icon: "📅", noun: "service", reasons: [] };

function copyForCapability(capability) {
  return CAPABILITY_COPY[capability] ?? DEFAULT_COPY;
}

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
 * BookingFormModal — owner books the active pet with a provider, for ANY capability
 * (ticket 2.4). Posts to /api/providers/[id]/book via useBookProvider with the chosen
 * `capability` (default: the provider's primary type, else 'vet'). service_id /
 * provider_location_id are optional and, when sent, are ALWAYS ids that came from this
 * provider's profile (contract #2). Blocks (no POST) when there is no active pet,
 * mirroring the "pick a pet" guard used for barks. The vet flow is unchanged.
 */
export default function BookingFormModal({
  visible,
  onClose,
  provider,
  locations = [],
  services = [],
  capability,
}) {
  const { data: currentPet } = useCurrentPet();
  const book = useBookProvider();

  // The capability this booking is for: explicit prop, else the provider's primary
  // type, else 'vet' (the pre-2.4 default). Drives the copy + the booking payload.
  const resolvedCapability = capability ?? provider?.provider_type ?? "vet";
  const copy = copyForCapability(resolvedCapability);

  const [serviceId, setServiceId] = useState(null); // null = "General"
  const [locationId, setLocationId] = useState(null);
  const [date, setDate] = useState(""); // canonical YYYY-MM-DD from DateField
  const [time, setTime] = useState(""); // canonical HH:MM from TimeField
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState(false); // recurring cycle (2.6 grooming)

  const resetAndClose = () => {
    setServiceId(null);
    setLocationId(null);
    setDate("");
    setTime("");
    setReason("");
    setNotes("");
    setRepeat(false);
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
        `Choose when you'd like the ${copy.noun}.`,
      );
      return;
    }

    try {
      await book.mutateAsync({
        providerId: provider.id,
        petId: currentPet.id,
        // The capability this booking is for (default 'vet' keeps the prior behaviour).
        capability: resolvedCapability,
        // Only send ids when chosen; both are ids from THIS provider's profile.
        service_id: serviceId ?? undefined,
        provider_location_id: locationId ?? undefined,
        appointment_date: date,
        appointment_time: time,
        reason_for_visit: reason || undefined,
        notes: notes || undefined,
        // Recurring cycle (2.6): when the owner opts in, carry the capability's RRULE so
        // the booking recurs and the existing reminder engine nudges a re-book.
        recurrence_rule:
          repeat && copy.recurrence ? copy.recurrence.rule : undefined,
      });
      resetAndClose();
      Alert.alert(
        "Request sent!",
        `${provider.name} will confirm your ${copy.noun} soon.`,
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
      title={provider ? `Book with ${provider.name}` : `Book ${copy.noun}`}
      subtitle={
        currentPet?.id
          ? `For ${currentPet.name}`
          : `Add a pet to book a ${copy.noun}`
      }
      icon={copy.icon}
      ctaLabel={book.isPending ? "Sending…" : `Confirm ${copy.noun}`}
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

      {/* Reason (optional chips) — capability-specific; hidden when none defined. */}
      {copy.reasons.length > 0 && (
        <>
          <SectionLabel>Reason</SectionLabel>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 9,
              marginBottom: 18,
            }}
          >
            {copy.reasons.map((r) => (
              <Chip
                key={r}
                label={r}
                selected={reason === r}
                onPress={() => setReason((cur) => (cur === r ? "" : r))}
              />
            ))}
          </View>
        </>
      )}

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

      {/* Recurring cycle (2.6) — only when the capability defines one (e.g. grooming
          "every 6 weeks"). A simple opt-in chip; sets recurrence_rule on the booking. */}
      {copy.recurrence && (
        <View style={{ marginTop: 18 }}>
          <SectionLabel>Recurring</SectionLabel>
          <TouchableOpacity
            testID="booking-recurrence"
            onPress={() => setRepeat((v) => !v)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: repeat ? COLORS.coral : COLORS.sand,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: repeat ? COLORS.coral : COLORS.peach,
              paddingHorizontal: 14,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                fontWeight: "700",
                fontSize: 14,
                color: repeat ? "#FFF" : COLORS.mutedBrown,
              }}
            >
              {copy.recurrence.label}
            </Text>
            <Text style={{ fontSize: 16, color: repeat ? "#FFF" : COLORS.mutedBrown }}>
              {repeat ? "✓" : ""}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
