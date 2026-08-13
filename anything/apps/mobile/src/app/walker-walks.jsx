import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { ArrowLeft, Footprints, Play } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useMyProviders,
  useProviderBookings,
  useCheckInWalk,
  useTrackWalk,
  useFinishWalk,
} from "@/hooks/useProviders";
import StartWalkModal from "@/components/Health/WalkActivity/StartWalkModal";
import WalkerLiveMap from "@/components/Health/WalkActivity/WalkerLiveMap";

// WALKER workspace (ticket 2.7) — a provider's active walker-staff start, GPS-track, and
// finish a booked walk. REUSES the existing walk-activity UI (StartWalkModal — the same
// countdown/pause/finish surface the owner self-tracking uses) rather than building a new
// one. On check-in we create the live walk_session (useCheckInWalk); while the walk runs
// we capture device GPS (expo-location) and POST throttled points (useTrackWalk) so the
// OWNER watches the route grow live; on finish we write the report (useFinishWalk), which
// the backend routes into the pet's health timeline. No fake routes — points come from the
// real device; if location permission is denied the walk still tracks time, just no map.
export default function WalkerWalksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: providers, isLoading } = useMyProviders();
  // The first provider the walker works for (most walkers are staff of one business). The
  // bookings query filters to walker bookings below.
  const provider = (providers ?? [])[0] ?? null;
  const { data: bookings, refetch } = useProviderBookings(provider?.id);
  const walkerBookings = (bookings ?? []).filter(
    (b) => b.capability === "walker" && b.booking_status !== "cancelled",
  );

  const checkIn = useCheckInWalk();
  const track = useTrackWalk();
  const finish = useFinishWalk();

  // The active session being walked + its booking context.
  const [active, setActive] = useState(null); // { sessionId, booking }
  // The route being recorded, mirrored locally so the walker sees their OWN live map (same
  // points we POST to the session). Plus whether foreground location was denied (→ graceful
  // "no map" state; the timer still tracks). Both reset on each new check-in.
  const [routePoints, setRoutePoints] = useState([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const watchRef = useRef(null);

  // Start watching device GPS and post points throttled (every ~5s) to the session.
  const startTracking = async (sessionId) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // Time still tracks; the route map shows a graceful "no map" note (real data only).
        setPermissionDenied(true);
        return;
      }
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (loc) => {
          const point = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            t: loc.timestamp,
          };
          // Feed the walker's own live map + POST the point to the session (owner watch).
          setRoutePoints((prev) => [...prev, point]);
          track.mutate({
            providerId: provider.id,
            sessionId,
            points: [point],
          });
        },
      );
    } catch (e) {
      console.error("[walker-walks] location watch failed:", e?.message);
    }
  };

  const stopTracking = () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
  };

  useEffect(() => () => stopTracking(), []);

  const handleStart = async (booking) => {
    try {
      const res = await checkIn.mutateAsync({
        providerId: provider.id,
        petId: booking.pet_id,
        booking_id: booking.id,
      });
      const sessionId = res?.session?.id;
      if (!sessionId) throw new Error("No session created");
      setRoutePoints([]);
      setPermissionDenied(false);
      setActive({ sessionId, booking });
      startTracking(sessionId);
    } catch (e) {
      Alert.alert("Couldn't start walk", e?.message || "Please try again.");
    }
  };

  const handleComplete = async (walkData) => {
    stopTracking();
    const a = active;
    setActive(null);
    if (!a) return;
    try {
      await finish.mutateAsync({
        providerId: provider.id,
        sessionId: a.sessionId,
        duration_s: (walkData?.durationMinutes ?? 0) * 60,
        notes: walkData?.notes || null,
      });
      Alert.alert(
        "Walk finished",
        "The report was saved and added to the pet's health timeline.",
      );
      refetch();
    } catch (e) {
      Alert.alert("Couldn't finish walk", e?.message || "Please try again.");
    }
  };

  const handleCancel = () => {
    stopTracking();
    setActive(null);
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
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 14 }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}
          >
            Walks 🐾
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            {provider ? provider.name : "Your assigned walks"}
          </Text>
        </View>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      >
        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : !provider ? (
          <EmptyState
            title="No walker workspace"
            body="You're not active staff of a walking provider yet."
          />
        ) : walkerBookings.length === 0 ? (
          <EmptyState
            title="No walks booked"
            body="Booked walks from owners will appear here to check in."
          />
        ) : (
          walkerBookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              busy={checkIn.isPending}
              onStart={() => handleStart(b)}
            />
          ))
        )}
      </RefreshableScrollView>

      {/* Reuse the existing walk-activity timer UI for the live walk, with the walker's own
          live route map above the countdown so they can confirm tracking is live. */}
      <StartWalkModal
        visible={!!active}
        onClose={handleCancel}
        walk={{
          name: active?.booking?.title || "Walk",
          durationMinutes: 30,
          pace: "normal",
        }}
        petName={active?.booking?.pet_name || "the dog"}
        onWalkComplete={handleComplete}
        topContent={
          <WalkerLiveMap
            points={routePoints}
            permissionDenied={permissionDenied}
          />
        }
      />
    </View>
  );
}

function BookingCard({ booking, onStart, busy }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}
          >
            {booking.pet_name || "Dog"}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}>
            {booking.owner_name ? `${booking.owner_name} · ` : ""}
            {booking.appointment_date}
            {booking.appointment_time ? ` ${booking.appointment_time}` : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onStart}
          disabled={busy}
          style={{
            backgroundColor: COLORS.coral,
            borderRadius: 14,
            paddingVertical: 10,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Play size={16} color="#FFF" />
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFF" }}>
            Start
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmptyState({ title, body }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 28,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Footprints size={32} color={COLORS.mutedBrown} />
      <Text
        style={{
          fontSize: 16,
          fontWeight: "800",
          color: COLORS.warmBrown,
          marginTop: 12,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: COLORS.mutedBrown,
          marginTop: 6,
          textAlign: "center",
        }}
      >
        {body}
      </Text>
    </View>
  );
}
