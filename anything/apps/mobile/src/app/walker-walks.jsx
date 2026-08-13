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
import { useTranslation } from "react-i18next";
import { ArrowLeft, Footprints, Play, QrCode, History, ChevronRight, Check, Clock } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useMyProviders,
  useProviderBookings,
  useCheckInWalk,
  useTrackWalk,
  useFinishWalk,
  useRedeemWalkPickup,
  useProviderWalkRequests,
  useAcceptWalkRequest,
} from "@/hooks/useProviders";
import StartWalkModal from "@/components/Health/WalkActivity/StartWalkModal";
import WalkerLiveMap from "@/components/Health/WalkActivity/WalkerLiveMap";
import PickupScannerModal from "@/components/Providers/PickupScannerModal";

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

  const { t } = useTranslation();
  const checkIn = useCheckInWalk();
  const track = useTrackWalk();
  const finish = useFinishWalk();
  const redeemPickup = useRedeemWalkPickup(provider?.id);
  const [scanOpen, setScanOpen] = useState(false);

  // Incoming "request a walk" requests targeted at this walker (ticket C1).
  const { data: walkRequests } = useProviderWalkRequests(provider?.id);
  const accept = useAcceptWalkRequest(provider?.id);
  const [acceptingId, setAcceptingId] = useState(null);

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

  // QR pickup (ticket B3): the walker scans the owner's QR → capture current GPS → redeem (deduct a
  // credit + create the in_progress session) → drop straight into the existing live-walk tracking.
  const handleScanned = async (token) => {
    if (redeemPickup.isPending) return;
    // Best-effort current point — the redeem still works without coords (server captures null).
    let lat = null;
    let lng = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
    } catch {
      // proceed without coords
    }
    try {
      const res = await redeemPickup.mutateAsync({ token, lat, lng });
      const sessionId = res?.session_id;
      if (!sessionId) throw new Error(t("walkPickup.redeemError", "Couldn't start the walk"));
      setScanOpen(false);
      setRoutePoints(lat != null ? [{ lat, lng, t: Date.now() }] : []);
      setPermissionDenied(lat == null);
      setActive({ sessionId, booking: null });
      startTracking(sessionId);
    } catch (e) {
      if (e?.status === 409) {
        Alert.alert(
          t("walkPickup.noCreditsTitle", "No walks left"),
          t("walkPickup.noCreditsBody", "Ask the owner to buy a pack before this walk."),
        );
      } else if (e?.status === 401 || e?.status === 403) {
        Alert.alert(
          t("walkPickup.badCodeTitle", "Invalid code"),
          t("walkPickup.badCodeBody", "That QR isn't a valid pickup code for your business."),
        );
      } else {
        Alert.alert(t("walkPickup.redeemErrorTitle", "Couldn't scan"), e?.message);
      }
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

  // Accept an incoming request (ticket C1): atomically creates a confirmed booking + opens a chat.
  // A 409 means it was cancelled or claimed by another walker → a distinct "no longer available".
  const handleAccept = async (request) => {
    if (accept.isPending) return;
    setAcceptingId(request.id);
    try {
      await accept.mutateAsync({ requestId: request.id });
      Alert.alert(
        t("walkRequests.acceptedTitle", "Walk accepted"),
        t(
          "walkRequests.acceptedBody",
          "A confirmed walk was added to your agenda and a chat opened with the owner.",
        ),
      );
    } catch (e) {
      if (e?.status === 409) {
        Alert.alert(
          t("walkRequests.takenTitle", "No longer available"),
          t("walkRequests.takenBody", "This request was cancelled or accepted by someone else."),
        );
      } else {
        Alert.alert(t("walkRequests.acceptErrorTitle", "Couldn't accept"), e?.message);
      }
    } finally {
      setAcceptingId(null);
    }
  };

  const openRequests = (walkRequests ?? []).filter((r) => r.status === "open");

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
        {/* Scan a credit-walk pickup QR (ticket B3) — starts the walk + spends a credit. */}
        {provider ? (
          <TouchableOpacity
            onPress={() => setScanOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("walkPickup.scan", "Scan pickup")}
            testID="walker-scan-pickup"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: COLORS.coral,
              borderRadius: 14,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <QrCode size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 13 }}>
              {t("walkPickup.scan", "Scan")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      >
        {/* Incoming requests (ticket C1) — owners asking THIS walker for a walk. Accept creates a
            confirmed booking + opens a chat. Shown first (time-sensitive). */}
        {provider && openRequests.length > 0 ? (
          <View style={{ marginBottom: 12 }} testID="incoming-requests">
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                color: COLORS.mutedBrown,
                letterSpacing: 0.6,
                marginBottom: 8,
              }}
            >
              {t("walkRequests.incomingTitle", "Incoming requests")}
            </Text>
            {openRequests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                busy={accept.isPending && acceptingId === r.id}
                onAccept={() => handleAccept(r)}
                t={t}
              />
            ))}
          </View>
        ) : null}

        {/* Walk history (ticket B5) — past finished walks with route + pickup on the map. */}
        {provider ? (
          <TouchableOpacity
            onPress={() => router.push("/walker-history")}
            accessibilityRole="button"
            testID="walker-history-link"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: COLORS.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.peach,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <History size={20} color={COLORS.coral} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.warmBrown }}>
              {t("walkHistory.link", "Walk history")}
            </Text>
            <ChevronRight size={18} color={COLORS.mutedBrown} />
          </TouchableOpacity>
        ) : null}

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
              t={t}
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

      {/* QR pickup scanner (ticket B3) — scan the owner's code to start a credit walk. */}
      <PickupScannerModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={handleScanned}
        busy={redeemPickup.isPending}
        t={t}
      />
    </View>
  );
}

function BookingCard({ booking, onStart, busy, t }) {
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}
            >
              {booking.pet_name || "Dog"}
            </Text>
            {/* "Uses a walk" badge (ticket B4) — a scheduled pay-with-credit walk. */}
            {booking.pay_with_credit ? (
              <View
                testID={`booking-credit-badge-${booking.id}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                  backgroundColor: COLORS.sand,
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Footprints size={12} color={COLORS.coral} />
                <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.coral }}>
                  {t("walkSchedule.usesWalk", "Uses a walk")}
                </Text>
              </View>
            ) : null}
          </View>
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

function RequestCard({ request, onAccept, busy, t }) {
  const scheduled = request.when_type === "scheduled" && request.scheduled_at;
  const whenLabel = scheduled
    ? String(request.scheduled_at).slice(0, 16).replace("T", " ")
    : t("walkRequests.now", "Now");
  return (
    <View
      testID={`request-card-${request.id}`}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.coral,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>
            {request.pet_name || t("walkRequests.aDog", "A dog")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
            <Clock size={12} color={COLORS.mutedBrown} />
            <Text style={{ fontSize: 13, color: COLORS.mutedBrown }}>
              {request.owner_name ? `${request.owner_name} · ` : ""}
              {whenLabel}
            </Text>
          </View>
          {request.note ? (
            <Text style={{ fontSize: 13, color: COLORS.warmBrown, marginTop: 6 }}>
              {request.note}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onAccept}
          disabled={busy}
          testID={`accept-request-${request.id}`}
          accessibilityRole="button"
          accessibilityLabel={t("walkRequests.accept", "Accept")}
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
          <Check size={16} color="#FFF" />
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFF" }}>
            {t("walkRequests.accept", "Accept")}
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
