import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Car, MapPin, MessageCircle, Navigation, CalendarDays } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import MapLocationPicker from "@/components/Map/MapLocationPicker";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useDiscoverProviders, useStartThread } from "@/hooks/useProviders";
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

const STATUS_LABEL = {
  requested: "Requested",
  confirmed: "Confirmed",
  en_route: "On the way",
  completed: "Completed",
  cancelled: "Cancelled",
};

function Chip({ selected, label, onPress, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? COLORS.coral : COLORS.peach,
        backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
      }}
    >
      <Text style={{ color: selected ? COLORS.coral : COLORS.warmBrown, fontWeight: "700", fontSize: 13 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function TransportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const { data: providers = [], isLoading, isError, refetch } = useDiscoverProviders("transport");
  const { data: trips = [] } = useTransportTrips(currentPet?.id ?? null);
  const book = useBookTransport();
  const cancel = useCancelTransport();
  const setTripCal = useSetTripCalendarEvent();
  const startThread = useStartThread();
  // aliased to `tr` — this screen already uses `t` as the trip variable in trips.map/messageProvider
  const { t: tr } = useTranslation();

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
      Alert.alert("Trip requested", "The transport provider will confirm and assign a driver.");
      setProvider(null);
      setPickupAddr("");
      setDropoffAddr("");
      setNotes("");
    } catch (e) {
      Alert.alert("Couldn't book", e.message || "Please try again.");
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
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>Transport 🚕</Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Book a pet-taxi: pickup and dropoff
          </Text>
        </View>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60 }}
      >
        {/* Provider picker */}
        <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.mutedBrown, marginBottom: 8 }}>
          TRANSPORT PROVIDERS NEAR YOU
        </Text>
        {isLoading ? (
          <Text style={{ color: COLORS.mutedBrown }}>Loading…</Text>
        ) : isError ? (
          <Text style={{ color: COLORS.mutedBrown }}>Couldn't load providers.</Text>
        ) : providers.length === 0 ? (
          <Text testID="providers-empty" style={{ color: COLORS.mutedBrown }}>
            No transport providers available yet.
          </Text>
        ) : (
          providers.map((p) => (
            <TouchableOpacity
              key={p.id}
              testID={`provider-${p.id}`}
              onPress={() => setProvider(p)}
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: COLORS.card,
                borderRadius: 14,
                padding: 14,
                marginBottom: 8,
                borderWidth: provider?.id === p.id ? 2 : 1,
                borderColor: provider?.id === p.id ? COLORS.coral : COLORS.peach,
              }}
            >
              <Car size={20} color={COLORS.coral} />
              <Text style={{ flex: 1, fontWeight: "800", color: COLORS.warmBrown }}>{p.name}</Text>
            </TouchableOpacity>
          ))
        )}

        {/* Booking form */}
        {provider && (
          <View
            testID="booking-form"
            style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1, borderColor: COLORS.peach }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginBottom: 10 }}>
              Book {provider.name}
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.mutedBrown, fontWeight: "700", marginBottom: 4 }}>Date</Text>
                <DateField value={date} onChange={setDate} testID="trip-date" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.mutedBrown, fontWeight: "700", marginBottom: 4 }}>Time</Text>
                <TimeField value={time} onChange={setTime} testID="trip-time" />
              </View>
            </View>

            <Text style={{ color: COLORS.mutedBrown, fontWeight: "700", marginTop: 12, marginBottom: 4 }}>
              <MapPin size={13} color={COLORS.mutedBrown} /> Pickup
            </Text>
            <TextInput
              testID="pickup-address"
              value={pickupAddr}
              onChangeText={setPickupAddr}
              placeholder="Pickup address"
              placeholderTextColor={COLORS.mutedBrown}
              style={{ backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, color: COLORS.warmBrown }}
            />
            <View style={{ height: 140, marginTop: 8, borderRadius: 12, overflow: "hidden" }}>
              <MapLocationPicker value={pickupCoord} onChange={setPickupCoord} testID="pickup-map" />
            </View>

            <Text style={{ color: COLORS.mutedBrown, fontWeight: "700", marginTop: 12, marginBottom: 4 }}>
              <MapPin size={13} color={COLORS.mutedBrown} /> Dropoff
            </Text>
            <TextInput
              testID="dropoff-address"
              value={dropoffAddr}
              onChangeText={setDropoffAddr}
              placeholder="Dropoff address"
              placeholderTextColor={COLORS.mutedBrown}
              style={{ backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, color: COLORS.warmBrown }}
            />
            <View style={{ height: 140, marginTop: 8, borderRadius: 12, overflow: "hidden" }}>
              <MapLocationPicker value={dropoffCoord} onChange={setDropoffCoord} testID="dropoff-map" />
            </View>

            <Text style={{ color: COLORS.mutedBrown, fontWeight: "700", marginTop: 12, marginBottom: 6 }}>Trip</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip testID="type-one_way" label="One-way" selected={tripType === "one_way"} onPress={() => setTripType("one_way")} />
              <Chip testID="type-round_trip" label="Round-trip" selected={tripType === "round_trip"} onPress={() => setTripType("round_trip")} />
            </View>

            <TextInput
              testID="pet-size"
              value={petSize}
              onChangeText={setPetSize}
              placeholder="Pet size (e.g. small / medium / large)"
              placeholderTextColor={COLORS.mutedBrown}
              style={{ marginTop: 12, backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, color: COLORS.warmBrown }}
            />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <Text style={{ color: COLORS.warmBrown, fontWeight: "700" }}>Carrier needed</Text>
              <Switch testID="carrier" value={carrier} onValueChange={setCarrier} />
            </View>

            <TextInput
              testID="notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (gate code, temperament…)"
              placeholderTextColor={COLORS.mutedBrown}
              multiline
              style={{ marginTop: 12, backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, minHeight: 60, color: COLORS.warmBrown }}
            />

            <TouchableOpacity
              testID="book-transport"
              onPress={submit}
              disabled={!canBook || book.isPending}
              activeOpacity={0.85}
              style={{
                marginTop: 14,
                backgroundColor: canBook ? COLORS.coral : COLORS.peach,
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {book.isPending ? "Requesting…" : "Request pet-taxi"}
              </Text>
            </TouchableOpacity>
            <Text style={{ color: COLORS.mutedBrown, fontSize: 11, marginTop: 8, textAlign: "center" }}>
              The provider sets the fare and confirms. You can pay once it's confirmed (payments may
              not be set up yet).
            </Text>
          </View>
        )}

        {/* My trips */}
        <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.mutedBrown, marginTop: 20, marginBottom: 8 }}>
          MY TRIPS
        </Text>
        {trips.length === 0 ? (
          <Text testID="trips-empty" style={{ color: COLORS.mutedBrown }}>
            No trips yet.
          </Text>
        ) : (
          trips.map((t) => (
            <View
              key={t.id}
              style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.peach }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "800", color: COLORS.warmBrown }}>
                  {t.provider_name || "Provider"}
                </Text>
                <Text style={{ fontWeight: "800", color: COLORS.coral }}>
                  {STATUS_LABEL[t.status] || t.status}
                </Text>
              </View>
              <Text style={{ color: COLORS.mutedBrown, fontSize: 13, marginTop: 4 }}>
                {t.pickup_address} → {t.dropoff_address}
              </Text>
              {t.fare_amount != null && (
                <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 4 }}>
                  Fare: {t.fare_amount}
                </Text>
              )}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  testID={`message-${t.id}`}
                  onPress={() => messageProvider(t)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <MessageCircle size={16} color={COLORS.sageDark} />
                  <Text style={{ color: COLORS.sageDark, fontWeight: "700" }}>Message</Text>
                </TouchableOpacity>
                {(t.status === "requested" || t.status === "confirmed" || t.status === "en_route") && (
                  <TouchableOpacity
                    testID={`add-calendar-${t.id}`}
                    onPress={() => addTripToCalendar(t)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <CalendarDays size={16} color={COLORS.sageDark} />
                    <Text style={{ color: COLORS.sageDark, fontWeight: "700" }}>
                      {t.calendar_event_id ? tr("calendar.added") : tr("calendar.addToCalendar")}
                    </Text>
                  </TouchableOpacity>
                )}
                {t.status === "en_route" && (
                  <TouchableOpacity
                    testID={`track-${t.id}`}
                    onPress={() => router.push(`/transport-track?tripId=${t.id}`)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Navigation size={16} color={COLORS.coral} />
                    <Text style={{ color: COLORS.coral, fontWeight: "700" }}>Track live</Text>
                  </TouchableOpacity>
                )}
                {(t.status === "requested" || t.status === "confirmed") && (
                  <TouchableOpacity
                    testID={`cancel-${t.id}`}
                    onPress={() =>
                      Alert.alert("Cancel trip?", "", [
                        { text: "Keep", style: "cancel" },
                        { text: "Cancel trip", style: "destructive", onPress: () => cancelTrip(t) },
                      ])
                    }
                  >
                    <Text style={{ color: "#C2410C", fontWeight: "700" }}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </RefreshableScrollView>
    </View>
  );
}
