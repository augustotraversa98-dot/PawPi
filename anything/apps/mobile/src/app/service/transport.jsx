import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Car, MapPin, MessageCircle, Navigation, CalendarDays } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import MapLocationPicker from "@/components/Map/MapLocationPicker";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  useDiscoverProviders,
  useStartThread,
  useBookingCheckout,
} from "@/hooks/useProviders";
import {
  useTransportTrips,
  useBookTransport,
  useCancelTransport,
  useSetTripCalendarEvent,
} from "@/hooks/useTransport";
import {
  addTransportToCalendar,
  removeSurfaceEventFromCalendar,
} from "@/utils/calendarIntegration";

const statusLabel = (tr, status) =>
  ({
    requested: tr("transport.statusRequested"),
    confirmed: tr("transport.statusConfirmed"),
    en_route: tr("transport.statusEnRoute"),
    completed: tr("transport.statusCompleted"),
    cancelled: tr("transport.statusCancelled"),
  })[status] || status;

function Chip({ selected, label, onPress, testID }) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      style={{
        paddingHorizontal: SPACING.md,
        paddingVertical: 7,
        borderRadius: RADIUS.chip,
        borderWidth: 1,
        borderColor: selected ? COLORS.coral : COLORS.peach,
        backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
      }}
    >
      <Text style={[TYPE.subhead, { color: selected ? COLORS.coral : COLORS.warmBrown }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

export default function TransportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // aliased to `tr` — this screen uses `t` as the trip variable in trips.map/messageProvider
  const { t: tr } = useTranslation();
  const { data: currentPet } = useCurrentPet();
  const { data: providers = [], isLoading, isError, refetch } = useDiscoverProviders("transport");
  const { data: trips = [] } = useTransportTrips(currentPet?.id ?? null);
  const book = useBookTransport();
  const checkout = useBookingCheckout();
  const [payingId, setPayingId] = useState(null);
  const cancel = useCancelTransport();

  // Pay the provider-set fare of a confirmed trip via MercadoPago (pay-on-confirm).
  // Links the payment to the trip through the order's source_ref = "transport:<id>";
  // the trip's `paid` flag (from GET /api/transport-trips) flips once the payment lands.
  const payTrip = async (t) => {
    const cents = Math.round(Number(t.fare_amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      Alert.alert(tr("transport.noFareTitle"), tr("transport.noFareBody"));
      return;
    }
    setPayingId(t.id);
    try {
      const res = await checkout.mutateAsync({
        provider_id: t.provider_id,
        amount_cents: cents,
        source_ref: `transport:${t.id}`,
      });
      const url = res.checkoutUrl || res.deeplink;
      if (url) Linking.openURL(url).catch(() => {});
    } catch (e) {
      Alert.alert(tr("transport.couldNotStartPayment"), e.message || tr("common.pleaseTryAgain"));
    } finally {
      setPayingId(null);
    }
  };
  const setTripCal = useSetTripCalendarEvent();
  const startThread = useStartThread();

  const [provider, setProvider] = useState(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [pickupAddr, setPickupAddr] = useState("");
  const [pickupCoord, setPickupCoord] = useState(null);
  const [dropoffAddr, setDropoffAddr] = useState("");
  const [dropoffCoord, setDropoffCoord] = useState(null);
  const [tripType, setTripType] = useState("one_way");
  const [petSize, setPetSize] = useState("");
  const [carrier, setCarrier] = useState(false);
  const [notes, setNotes] = useState("");

  const canBook =
    provider && currentPet?.id && date && time && pickupAddr.trim() && dropoffAddr.trim();

  const submit = async () => {
    if (!canBook) return;
    try {
      await book.mutateAsync({
        providerId: provider.id,
        petId: currentPet.id,
        scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
        pickup_address: pickupAddr.trim(),
        pickup_lat: pickupCoord?.lat ?? null,
        pickup_lng: pickupCoord?.lng ?? null,
        dropoff_address: dropoffAddr.trim(),
        dropoff_lat: dropoffCoord?.lat ?? null,
        dropoff_lng: dropoffCoord?.lng ?? null,
        trip_type: tripType,
        pet_size: petSize.trim() || null,
        carrier_needed: carrier,
        notes: notes.trim() || null,
      });
      Alert.alert(tr("transport.tripRequestedTitle"), tr("transport.tripRequestedBody"));
      setProvider(null);
      setPickupAddr("");
      setDropoffAddr("");
      setNotes("");
    } catch (e) {
      Alert.alert(tr("transport.couldNotBook"), e.message || tr("common.pleaseTryAgain"));
    }
  };

  // Add (or update) the trip in the device calendar and persist the id on the underlying
  // booking (2.80). Calendar is optional — a denied permission shows a clean message and
  // never blocks. Requires the trip's booking_id to persist.
  const addTripToCalendar = async (trip) => {
    const result = await addTransportToCalendar(trip, trip.calendar_event_id);
    if (result.success) {
      if (trip.booking_id) {
        setTripCal.mutate({ bookingId: trip.booking_id, calendarEventId: result.eventId });
      }
      Alert.alert(
        trip.calendar_event_id ? tr("calendar.updated") : tr("calendar.added"),
        trip.provider_name || "",
      );
    } else if (result.error === "permission_denied") {
      Alert.alert(tr("calendar.permissionTitle"), tr("calendar.permissionBody"));
    } else {
      Alert.alert(tr("calendar.permissionTitle"), tr("calendar.couldNotAdd"));
    }
  };

  // Cancel a trip; first remove any device calendar event (the server also clears the
  // stored id on cancel). Calendar removal is best-effort and never blocks the cancel.
  const cancelTrip = async (trip) => {
    if (trip.calendar_event_id) {
      try {
        await removeSurfaceEventFromCalendar(trip.calendar_event_id);
      } catch {
        /* best-effort */
      }
    }
    cancel.mutate(trip.id);
  };

  const messageProvider = (t) => {
    startThread.mutate(
      { providerId: t.provider_id, booking_id: t.booking_id ?? undefined },
      {
        onSuccess: (res) => {
          const thread = res?.thread;
          if (!thread) return;
          router.push({
            pathname: "/provider-chat",
            params: {
              threadId: String(thread.id),
              providerName: t.provider_name || "Provider",
              ownerUserId: String(thread.owner_user_id),
            },
          });
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>{tr("transport.headerTitle")}</Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {tr("transport.headerSubtitle")}
          </Text>
        </View>
      </GlassSurface>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 60 }}
      >
        {/* Provider picker */}
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "800", marginBottom: SPACING.sm }]}>
          {tr("transport.providersNearYou")}
        </Text>
        {isLoading ? (
          <Text style={[TYPE.body, { color: COLORS.mutedBrown }]}>{tr("common.loading")}</Text>
        ) : isError ? (
          <Text style={[TYPE.body, { color: COLORS.mutedBrown }]}>{tr("transport.couldNotLoadProviders")}</Text>
        ) : providers.length === 0 ? (
          <Text testID="providers-empty" style={[TYPE.body, { color: COLORS.mutedBrown }]}>
            {tr("transport.noProvidersYet")}
          </Text>
        ) : (
          providers.map((p) => (
            <PressableScale
              key={p.id}
              testID={`provider-${p.id}`}
              onPress={() => setProvider(p)}
            >
              <Card
                level="sm"
                radius={RADIUS.control}
                borderColor={provider?.id === p.id ? COLORS.coral : COLORS.peach}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.sm,
                  padding: SPACING.lg - 2,
                  marginBottom: SPACING.sm,
                  borderWidth: provider?.id === p.id ? 2 : 1,
                }}
              >
                <Car size={20} color={COLORS.coral} />
                <Text style={[TYPE.headline, { flex: 1, fontWeight: "800", color: COLORS.warmBrown }]}>
                  {p.name}
                </Text>
              </Card>
            </PressableScale>
          ))
        )}

        {/* Booking form */}
        {provider && (
          <Card
            testID="booking-form"
            level="sm"
            radius={RADIUS.card}
            borderColor={COLORS.peach}
            style={{ padding: SPACING.lg, marginTop: SPACING.md }}
          >
            <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginBottom: SPACING.sm }]}>
              {tr("transport.bookProvider", { name: provider.name })}
            </Text>

            <View style={{ flexDirection: "row", gap: SPACING.md }}>
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.callout, { color: COLORS.mutedBrown, fontWeight: "700", marginBottom: SPACING.xs }]}>{tr("transport.date")}</Text>
                <DateField value={date} onChange={setDate} testID="trip-date" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.callout, { color: COLORS.mutedBrown, fontWeight: "700", marginBottom: SPACING.xs }]}>{tr("transport.time")}</Text>
                <TimeField value={time} onChange={setTime} testID="trip-time" />
              </View>
            </View>

            <Text style={[TYPE.callout, { color: COLORS.mutedBrown, fontWeight: "700", marginTop: SPACING.md, marginBottom: SPACING.xs }]}>
              <MapPin size={13} color={COLORS.mutedBrown} /> {tr("transport.pickup")}
            </Text>
            <TextInput
              testID="pickup-address"
              value={pickupAddr}
              onChangeText={setPickupAddr}
              placeholder={tr("transport.pickupPlaceholder")}
              placeholderTextColor={COLORS.mutedBrown}
              style={{ backgroundColor: COLORS.sand, borderRadius: RADIUS.sm, padding: SPACING.sm + 2, color: COLORS.warmBrown }}
            />
            <View style={{ height: 140, marginTop: SPACING.sm, borderRadius: RADIUS.sm, overflow: "hidden" }}>
              <MapLocationPicker value={pickupCoord} onChange={setPickupCoord} testID="pickup-map" />
            </View>

            <Text style={[TYPE.callout, { color: COLORS.mutedBrown, fontWeight: "700", marginTop: SPACING.md, marginBottom: SPACING.xs }]}>
              <MapPin size={13} color={COLORS.mutedBrown} /> {tr("transport.dropoff")}
            </Text>
            <TextInput
              testID="dropoff-address"
              value={dropoffAddr}
              onChangeText={setDropoffAddr}
              placeholder={tr("transport.dropoffPlaceholder")}
              placeholderTextColor={COLORS.mutedBrown}
              style={{ backgroundColor: COLORS.sand, borderRadius: RADIUS.sm, padding: SPACING.sm + 2, color: COLORS.warmBrown }}
            />
            <View style={{ height: 140, marginTop: SPACING.sm, borderRadius: RADIUS.sm, overflow: "hidden" }}>
              <MapLocationPicker value={dropoffCoord} onChange={setDropoffCoord} testID="dropoff-map" />
            </View>

            <Text style={[TYPE.callout, { color: COLORS.mutedBrown, fontWeight: "700", marginTop: SPACING.md, marginBottom: 6 }]}>{tr("transport.trip")}</Text>
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
              <Chip testID="type-one_way" label={tr("transport.oneWay")} selected={tripType === "one_way"} onPress={() => setTripType("one_way")} />
              <Chip testID="type-round_trip" label={tr("transport.roundTrip")} selected={tripType === "round_trip"} onPress={() => setTripType("round_trip")} />
            </View>

            <TextInput
              testID="pet-size"
              value={petSize}
              onChangeText={setPetSize}
              placeholder={tr("transport.petSizePlaceholder")}
              placeholderTextColor={COLORS.mutedBrown}
              style={{ marginTop: SPACING.md, backgroundColor: COLORS.sand, borderRadius: RADIUS.sm, padding: SPACING.sm + 2, color: COLORS.warmBrown }}
            />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.md }}>
              <Text style={[TYPE.body, { color: COLORS.warmBrown, fontWeight: "700" }]}>{tr("transport.carrierNeeded")}</Text>
              <Switch testID="carrier" value={carrier} onValueChange={setCarrier} />
            </View>

            <TextInput
              testID="notes"
              value={notes}
              onChangeText={setNotes}
              placeholder={tr("transport.notesPlaceholder")}
              placeholderTextColor={COLORS.mutedBrown}
              multiline
              style={{ marginTop: SPACING.md, backgroundColor: COLORS.sand, borderRadius: RADIUS.sm, padding: SPACING.sm + 2, minHeight: 60, color: COLORS.warmBrown }}
            />

            <PressableScale
              testID="book-transport"
              onPress={submit}
              disabled={!canBook || book.isPending}
              style={{
                marginTop: SPACING.lg - 2,
                backgroundColor: canBook ? COLORS.coral : COLORS.peach,
                borderRadius: RADIUS.control,
                paddingVertical: 13,
                alignItems: "center",
              }}
            >
              <Text style={[TYPE.headline, { color: "#fff", fontWeight: "800" }]}>
                {book.isPending ? tr("transport.requesting") : tr("transport.requestPetTaxi")}
              </Text>
            </PressableScale>
            <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "500", letterSpacing: 0, marginTop: SPACING.sm, textAlign: "center" }]}>
              {tr("transport.fareHint")}
            </Text>
          </Card>
        )}

        {/* My trips */}
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "800", marginTop: SPACING.xl, marginBottom: SPACING.sm }]}>
          {tr("transport.myTrips")}
        </Text>
        {trips.length === 0 ? (
          <Text testID="trips-empty" style={[TYPE.body, { color: COLORS.mutedBrown }]}>
            {tr("transport.noTripsYet")}
          </Text>
        ) : (
          trips.map((t) => (
            <Card
              key={t.id}
              level="sm"
              radius={RADIUS.control}
              borderColor={COLORS.peach}
              style={{ padding: SPACING.lg - 2, marginBottom: SPACING.sm }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
                  {t.provider_name || tr("transport.provider")}
                </Text>
                <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.coral }]}>
                  {statusLabel(tr, t.status)}
                </Text>
              </View>
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}>
                {t.pickup_address} → {t.dropoff_address}
              </Text>
              {t.fare_amount != null && (
                <Text style={[TYPE.body, { color: COLORS.warmBrown, fontWeight: "700", marginTop: SPACING.xs }]}>
                  {tr("transport.fare")}: {t.fare_amount}
                </Text>
              )}
              {t.paid ? (
                <Text
                  testID={`paid-${t.id}`}
                  style={[TYPE.body, { color: COLORS.sageDark, fontWeight: "800", marginTop: SPACING.xs }]}
                >
                  {tr("transport.paid")}
                </Text>
              ) : (t.status === "confirmed" || t.status === "en_route") &&
                t.fare_amount != null ? (
                <PressableScale
                  testID={`pay-${t.id}`}
                  onPress={() => payTrip(t)}
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: RADIUS.control,
                    paddingVertical: 10,
                    alignItems: "center",
                    marginTop: SPACING.sm,
                  }}
                >
                  <Text style={[TYPE.body, { color: "#fff", fontWeight: "800" }]}>
                    {payingId === t.id ? tr("transport.opening") : tr("transport.payFare")}
                  </Text>
                </PressableScale>
              ) : null}
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm }}>
                <PressableScale
                  testID={`message-${t.id}`}
                  onPress={() => messageProvider(t)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <MessageCircle size={16} color={COLORS.sageDark} />
                  <Text style={[TYPE.body, { color: COLORS.sageDark, fontWeight: "700" }]}>{tr("transport.message")}</Text>
                </PressableScale>
                {(t.status === "requested" || t.status === "confirmed" || t.status === "en_route") && (
                  <PressableScale
                    testID={`add-calendar-${t.id}`}
                    onPress={() => addTripToCalendar(t)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <CalendarDays size={16} color={COLORS.sageDark} />
                    <Text style={[TYPE.body, { color: COLORS.sageDark, fontWeight: "700" }]}>
                      {t.calendar_event_id ? tr("calendar.added") : tr("calendar.addToCalendar")}
                    </Text>
                  </PressableScale>
                )}
                {t.status === "en_route" && (
                  <PressableScale
                    testID={`track-${t.id}`}
                    onPress={() => router.push(`/transport-track?tripId=${t.id}`)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Navigation size={16} color={COLORS.coral} />
                    <Text style={[TYPE.body, { color: COLORS.coral, fontWeight: "700" }]}>{tr("transport.trackLive")}</Text>
                  </PressableScale>
                )}
                {(t.status === "requested" || t.status === "confirmed") && (
                  <PressableScale
                    testID={`cancel-${t.id}`}
                    onPress={() =>
                      Alert.alert(tr("transport.cancelTripTitle"), "", [
                        { text: tr("transport.keep"), style: "cancel" },
                        { text: tr("transport.cancelTrip"), style: "destructive", onPress: () => cancelTrip(t) },
                      ])
                    }
                  >
                    <Text style={[TYPE.body, { color: "#C2410C", fontWeight: "700" }]}>{tr("common.cancel")}</Text>
                  </PressableScale>
                )}
              </View>
            </Card>
          ))
        )}
      </RefreshableScrollView>
    </View>
  );
}
