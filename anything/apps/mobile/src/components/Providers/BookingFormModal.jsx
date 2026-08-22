import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useBookProvider, useBookingCheckout } from "@/hooks/useProviders";
import {
  addBookingToCalendar,
  addTelehealthToCalendar,
} from "@/utils/calendarIntegration";
import BookingSlotPicker from "@/components/Providers/BookingSlotPicker";
import { formatMoney } from "@/utils/money";
import {
  isSlotCapability,
  IN_PERSON_SLOT_CAPABILITIES,
  slotZonedParts,
} from "@/utils/providerSlots";

// Per-capability copy so the SAME modal serves vet / grooming / walking / daycare /
// sitting / training (ticket 2.4 — generalize the book flow to any capability). Falls
// back to a generic "service" label for any capability not listed. (The old per-capability
// "reason" chips were removed — the free-text Notes field replaces them.)
const CAPABILITY_COPY = {
  vet: {
    icon: "🏥",
    noun: "appointment",
  },
  groomer: {
    icon: "✂️",
    noun: "grooming",
    // Grooming is naturally a recurring cycle (ticket 2.6). Offer "every 6 weeks" so the
    // booking carries a recurrence_rule (2.4) and the EXISTING reminder engine nudges the
    // owner to re-book — no new reminder path. iCal RRULE; INTERVAL=6 weeks.
    recurrence: { label: "Repeat every 6 weeks", rule: "FREQ=WEEKLY;INTERVAL=6" },
  },
  walker: {
    icon: "🐾",
    noun: "walk",
    // Walking supports both on-demand (a one-off slot — leave Repeat off) and a RECURRING
    // weekly pack walk (ticket 2.7). Opting in carries a weekly recurrence_rule (2.4) so
    // the EXISTING reminder engine nudges the owner — no new reminder path. iCal RRULE.
    recurrence: { label: "Repeat weekly (pack walk)", rule: "FREQ=WEEKLY;INTERVAL=1" },
  },
  daycare: { icon: "🏠", noun: "daycare" },
  sitter: { icon: "🧸", noun: "sitting" },
  trainer: { icon: "🎓", noun: "training" },
};

const DEFAULT_COPY = { icon: "📅", noun: "service" };

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
  capabilities = [],
  capability,
  // A specific service tapped in the storefront (feat/tap-service-to-book). When given, it is
  // preselected and the in-modal service selector is collapsed to a static line. Absent (the
  // bottom "Book" button) → the full selector renders exactly as before.
  service,
  // Ticket B4: schedule a walk against a prepaid pack. When true the booking is marked
  // pay_with_credit — NO checkout is taken (the credit is spent at pickup, B3) — and the copy
  // reflects "Uses 1 walk". Default false keeps every existing booking flow unchanged.
  payWithCredit = false,
}) {
  const { data: currentPet } = useCurrentPet();
  const book = useBookProvider();
  const checkout = useBookingCheckout();
  const { t } = useTranslation();

  // The capability this booking is for: explicit prop, else the provider's primary
  // type, else 'vet' (the pre-2.4 default). Drives the copy + the booking payload.
  const baseCapability = capability ?? provider?.provider_type ?? "vet";

  // Slot-based capabilities (vet/groomer/trainer/telehealth) use the OSDE-style slot picker
  // (PR-2); the rest (daycare/sitter/walker) keep the free-form date/time flow, unchanged.
  const slotBased = isSlotCapability(baseCapability);

  // Modality (Presencial / Videollamada) — only offered when the booking's base capability
  // is a presencial slot capability AND the provider ALSO holds telehealth. Presencial =
  // baseCapability; Videollamada = 'telehealth'. A single modality shows no tabs.
  const showModalityTabs =
    slotBased &&
    IN_PERSON_SLOT_CAPABILITIES.includes(baseCapability) &&
    capabilities.includes("telehealth");
  const [modality, setModality] = useState(baseCapability);
  // Re-sync the modality when the modal (re)opens or the base capability changes.
  useEffect(() => {
    setModality(baseCapability);
  }, [baseCapability, visible]);
  const activeCapability = showModalityTabs ? modality : baseCapability;

  const copy = copyForCapability(activeCapability);

  const [serviceId, setServiceId] = useState(null); // null = "General"
  // Once the user taps any service chip (incl. "General") we stop auto-preselecting so we
  // never override an explicit choice on a background re-fetch.
  const serviceTouched = useRef(false);
  const [locationId, setLocationId] = useState(null);
  const [date, setDate] = useState(""); // canonical YYYY-MM-DD from DateField (free-form flow)
  const [time, setTime] = useState(""); // canonical HH:MM from TimeField (free-form flow)
  // Slot-based flow: the chosen { start, end } (absolute-UTC) + the provider tz it came in.
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotTimeZone, setSlotTimeZone] = useState(null);
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState(false); // recurring cycle (2.6 grooming)
  const [addCal, setAddCal] = useState(false); // add to phone calendar (2.80)

  // Pay-at-request policy of the chosen service (migration 0070): drives both the heads-up in the
  // form and the checkout in handleConfirm. A 'none' policy — or a deposit/full policy with no
  // amount set — charges nothing (the booking stays free, exactly as before).
  const chosenService = services.find((s) => s.id === serviceId);
  const paymentPolicy = chosenService?.payment_policy ?? "none";
  const chargeCents =
    paymentPolicy === "full"
      ? Number(chosenService?.price_cents) || 0
      : paymentPolicy === "deposit"
        ? Number(chosenService?.deposit_cents) || 0
        : 0;
  const requiresPayment = paymentPolicy !== "none" && chargeCents > 0;

  // Amount to surface on the confirm CTA: the actual charge when a payment is taken at booking
  // (deposit/full), else the selected service's price as the informational total. Null when no
  // priced service is selected ("General") → the CTA shows no amount. Payment logic unchanged.
  const ctaAmountCents = requiresPayment
    ? chargeCents
    : chosenService?.price_cents ?? null;

  // A tapped storefront service (feat/tap-service-to-book) is preselected and the selector is
  // hidden. This takes precedence over the single-service auto-preselect below, and keys only
  // on `service`/`visible` (NOT `services`) so a background re-fetch never overrides it.
  useEffect(() => {
    if (visible && service?.id != null) {
      setServiceId(service.id);
    }
  }, [visible, service]);

  // A provider whose ONLY service requires payment must NOT be silently booked for free:
  // when there's exactly one active service, preselect it so its price/policy applies (the
  // user can still switch to "General"). Without this, the default "General" (serviceId=null)
  // books a FREE request even for a paid single-service vet — no charge, no MercadoPago.
  // Skipped when a `service` was explicitly passed (that effect owns the selection).
  useEffect(() => {
    if (
      visible &&
      !service &&
      !serviceTouched.current &&
      serviceId == null &&
      services.length === 1
    ) {
      setServiceId(services[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, services]);

  // Switching the service changes slot durations (30-min vs 1-hour grid), so any slot chosen
  // under the previous service no longer applies — drop it so the CTA re-gates on a fresh pick.
  useEffect(() => {
    setSelectedSlot(null);
    setSlotTimeZone(null);
  }, [serviceId]);

  const resetAndClose = () => {
    serviceTouched.current = false;
    setServiceId(null);
    setLocationId(null);
    setDate("");
    setTime("");
    setSelectedSlot(null);
    setSlotTimeZone(null);
    setNotes("");
    setRepeat(false);
    setAddCal(false);
    onClose?.();
  };

  const handleConfirm = async () => {
    // No active pet → block with a friendly message, never POST.
    if (!currentPet?.id) {
      Alert.alert(
        t("booking.noActivePetTitle"),
        t("booking.noActivePetBody"),
      );
      return;
    }
    // Resolve the appointment date/time. Slot-based: derive them (in the provider tz) from
    // the chosen absolute-UTC slot, and carry start_at/end_at. Free-form: the DateField/
    // TimeField values, no slot.
    let appointmentDate;
    let appointmentTime;
    let startAt;
    let endAt;
    if (slotBased) {
      if (!selectedSlot || !slotTimeZone) {
        Alert.alert(
          t("booking.pickSlotTitle"),
          t("booking.pickSlotBody"),
        );
        return;
      }
      const parts = slotZonedParts(selectedSlot.start, slotTimeZone);
      appointmentDate = parts.date;
      appointmentTime = parts.time;
      startAt = selectedSlot.start;
      endAt = selectedSlot.end;
    } else {
      if (!date || !time) {
        Alert.alert(
          t("booking.pickDateTimeTitle"),
          t("booking.pickDateTimeBody", { noun: copy.noun }),
        );
        return;
      }
      appointmentDate = date;
      appointmentTime = time;
    }

    // Add-to-calendar (2.80): OPTIONAL and best-effort. Create the device event up front
    // so its id is persisted with the booking; a denied permission or failure must NEVER
    // block the booking — we simply book without a calendar_event_id.
    let calendarEventId;
    if (addCal) {
      const selectedService = services.find((s) => s.id === serviceId);
      const item = {
        title: selectedService?.name,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        provider_name: provider?.name,
        notes: notes || undefined,
      };
      const result =
        activeCapability === "telehealth"
          ? await addTelehealthToCalendar(item, currentPet.name)
          : await addBookingToCalendar(item, currentPet.name);
      if (result.success) calendarEventId = result.eventId;
    }

    // A pay-with-credit walk (B4) never takes a checkout — the credit is spent at pickup (B3).
    const takePayment = requiresPayment && !payWithCredit;
    try {
      let orderId;
      let checkoutUrl;
      if (takePayment) {
        // The server derives the authoritative amount from the chosen service's payment_policy
        // (full → price, deposit → deposit) — we send the service id, NEVER a client amount, so a
        // tampered amount can't underpay (fail-closed checkout, 2026-08-21). The CTA still shows
        // chargeCents for display only.
        const checkoutRes = await checkout.mutateAsync({
          provider_id: provider.id,
          service_id: serviceId,
        });
        orderId = checkoutRes.order?.id;
        checkoutUrl = checkoutRes.checkoutUrl || checkoutRes.deeplink;
      }

      await book.mutateAsync({
        providerId: provider.id,
        petId: currentPet.id,
        // The capability this booking is for (default 'vet' keeps the prior behaviour); the
        // active modality when Presencial/Videollamada tabs are shown.
        capability: activeCapability,
        // Only send ids when chosen; both are ids from THIS provider's profile.
        service_id: serviceId ?? undefined,
        provider_location_id: locationId ?? undefined,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        // Slot-based booking: the discrete slot as absolute-UTC instants (PR-1's contract).
        // Free-form capabilities send neither, exactly as before.
        start_at: startAt,
        end_at: endAt,
        notes: notes || undefined,
        // Recurring cycle (2.6): when the owner opts in, carry the capability's RRULE so
        // the booking recurs and the existing reminder engine nudges a re-book.
        recurrence_rule:
          repeat && copy.recurrence ? copy.recurrence.rule : undefined,
        // Device calendar event id (2.80) — persisted on the booking row when added.
        calendar_event_id: calendarEventId,
        // Pay-at-request: links the pending payment order to the booking (0070).
        order_id: orderId,
        // Pay-with-credit walk (B4): the credit is charged at pickup, not now.
        pay_with_credit: payWithCredit ? true : undefined,
      });
      resetAndClose();
      if (payWithCredit) {
        Alert.alert(
          t("walkSchedule.bookedTitle", "Walk scheduled"),
          t(
            "walkSchedule.bookedBody",
            `${provider.name} will confirm your walk. One credit is used at pickup.`,
          ),
        );
      } else if (takePayment && checkoutUrl) {
        Alert.alert(
          t("booking.completePaymentTitle"),
          t("booking.completePaymentBody", { noun: copy.noun, provider: provider.name }),
        );
        Linking.openURL(checkoutUrl).catch(() => {});
      } else if (takePayment) {
        // Payment was required but no checkout URL came back — the charge could NOT be
        // started. The booking exists but is unpaid; never imply it's a normal free
        // request. Be honest so the owner knows nothing was charged.
        Alert.alert(
          t("booking.paymentFailedTitle"),
          t("booking.paymentFailedBody", { noun: copy.noun }),
        );
      } else {
        Alert.alert(
          t("booking.requestSentTitle"),
          t("booking.requestSentBody", { noun: copy.noun, provider: provider.name }),
        );
      }
    } catch (err) {
      // Surface backend 400/403/404 messages instead of swallowing them.
      Alert.alert(t("booking.couldntBook"), err?.message || t("common.pleaseTryAgain"));
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
      ctaLabel={(() => {
        if (book.isPending) return "Sending…";
        const base = slotBased ? t("booking.reserveSlot") : `Confirm ${copy.noun}`;
        // Show the selected service's amount on the CTA (charge for deposit/full, price for
        // pay-later); no amount when no priced service is selected.
        return ctaAmountCents != null
          ? `${base} · ${formatMoney(ctaAmountCents, provider?.currency)}`
          : base;
      })()}
      ctaColor={COLORS.coral}
      onCtaPress={handleConfirm}
      // Slot-based: the CTA stays disabled until a discrete slot is chosen (OSDE flow).
      ctaDisabled={book.isPending || (slotBased && !selectedSlot)}
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
            {t("booking.noActivePetInline")}
          </Text>
        </View>
      )}

      {/* Service — a tapped storefront service is preselected and shown as a static line
          (selector collapsed); otherwise the full "General" + per-service chip selector. */}
      {service ? (
        <Text
          testID="booking-service-preselected"
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: COLORS.warmBrown,
            marginTop: 4,
            marginBottom: 18,
          }}
        >
          {formatPrice(service.price_cents)
            ? `${t("booking.bookingService", { name: service.name })} · ${formatPrice(service.price_cents)}`
            : t("booking.bookingService", { name: service.name })}
        </Text>
      ) : (
        <>
          <SectionLabel>{t("booking.sectionService")}</SectionLabel>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 18 }}
          >
            <Chip
              label={t("booking.generalChip")}
              selected={serviceId == null}
              onPress={() => {
                serviceTouched.current = true;
                setServiceId(null);
              }}
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
                onPress={() => {
                  serviceTouched.current = true;
                  setServiceId(s.id);
                }}
                testID={`booking-service-${s.id}`}
              />
            ))}
          </View>
        </>
      )}

      {requiresPayment && (
        <View
          testID="booking-payment-note"
          style={{
            backgroundColor: COLORS.sand,
            borderRadius: 12,
            padding: 12,
            marginBottom: 18,
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <Text style={{ color: COLORS.mutedBrown, fontSize: 13 }}>
            {t(
              paymentPolicy === "deposit"
                ? "booking.depositRequired"
                : "booking.paymentRequired",
              { amount: formatPrice(chargeCents), noun: copy.noun },
            )}
          </Text>
        </View>
      )}

      {/* No-online-payment heads-up (Workstream B, 2026-08-21). When a chosen service takes no
          online payment (payment_policy 'none') and this isn't a prepaid-credit walk, make it clear
          the owner simply requests the booking and settles in person — no pay step, no MercadoPago. */}
      {!requiresPayment && !payWithCredit && chosenService && (
        <View
          testID="booking-pay-in-person-note"
          style={{
            backgroundColor: COLORS.sand,
            borderRadius: 12,
            padding: 12,
            marginBottom: 18,
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <Text style={{ color: COLORS.mutedBrown, fontSize: 13 }}>
            {t("booking.payInPersonNote", { provider: provider?.name })}
          </Text>
        </View>
      )}

      {/* Location (optional) */}
      {locations.length > 0 && (
        <>
          <SectionLabel>{t("booking.sectionLocation")}</SectionLabel>
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

      {/* When — slot-based capabilities (vet/groomer/trainer/telehealth) use the OSDE-style
          picker (modality tabs → month calendar → discrete slots). Non-slot capabilities keep
          the free-form DateField/TimeField, unchanged. */}
      {slotBased ? (
        <>
          {showModalityTabs && (
            <>
              <SectionLabel>{t("booking.modality")}</SectionLabel>
              <View style={{ flexDirection: "row", gap: 9, marginBottom: 16 }}>
                <Chip
                  label={t("booking.modalityInPerson")}
                  selected={modality !== "telehealth"}
                  onPress={() => {
                    setModality(baseCapability);
                    setSelectedSlot(null);
                    setSlotTimeZone(null);
                  }}
                  testID="booking-modality-presencial"
                />
                <Chip
                  label={t("booking.modalityVideo")}
                  selected={modality === "telehealth"}
                  onPress={() => {
                    setModality("telehealth");
                    setSelectedSlot(null);
                    setSlotTimeZone(null);
                  }}
                  testID="booking-modality-video"
                />
              </View>
            </>
          )}
          <SectionLabel>{t("booking.whenLabel")}</SectionLabel>
          <View style={{ marginBottom: 16 }}>
            <BookingSlotPicker
              key={activeCapability}
              providerId={provider?.id}
              capability={activeCapability}
              serviceId={serviceId}
              selected={selectedSlot}
              onSelect={(slot, tz) => {
                setSelectedSlot(slot);
                setSlotTimeZone(tz);
              }}
              t={t}
            />
          </View>
        </>
      ) : (
        <>
          <SectionLabel>{t("booking.sectionDate")}</SectionLabel>
          <View style={{ marginBottom: 16 }}>
            <DateField value={date} onChange={setDate} testID="booking-date" />
          </View>

          <SectionLabel>{t("booking.sectionTime")}</SectionLabel>
          <View style={{ marginBottom: 16 }}>
            <TimeField value={time} onChange={setTime} testID="booking-time" />
          </View>
        </>
      )}

      {/* Notes (optional) — replaces the old per-capability "reason" chips: free text is the
          single place the owner tells the provider what the visit is about. */}
      <SectionLabel>{t("booking.sectionNotes")}</SectionLabel>
      <TextInput
        placeholder={t("booking.notesPlaceholder")}
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
          <SectionLabel>{t("booking.sectionRecurring")}</SectionLabel>
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

      {/* Add to phone calendar (2.80) — optional opt-in; the device event id is persisted
          on the booking so an edit/cancel can update/remove it. Never blocks the booking. */}
      <View style={{ marginTop: 18 }}>
        <SectionLabel>{t("calendar.addToCalendar")}</SectionLabel>
        <TouchableOpacity
          testID="booking-add-calendar"
          onPress={() => setAddCal((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: addCal ? COLORS.coral : COLORS.sand,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: addCal ? COLORS.coral : COLORS.peach,
            paddingHorizontal: 14,
            paddingVertical: 13,
          }}
        >
          <Text
            style={{
              fontWeight: "700",
              fontSize: 14,
              color: addCal ? "#FFF" : COLORS.mutedBrown,
            }}
          >
            {t("calendar.addToCalendar")}
          </Text>
          <Text style={{ fontSize: 16, color: addCal ? "#FFF" : COLORS.mutedBrown }}>
            {addCal ? "✓" : ""}
          </Text>
        </TouchableOpacity>
      </View>
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
