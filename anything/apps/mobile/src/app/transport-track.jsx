import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { ArrowLeft, MapPin, Navigation, Radio } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import MapLocationView from "@/components/Map/MapLocationView";
import { useTripTrack, usePostTripLocation } from "@/hooks/useTransport";
import { isValidCoord } from "@/utils/walkBuddies";

// Transport LIVE-GPS screen (ticket 2.70). The owner watches the assigned driver move toward
// dropoff on a real Apple map (2.68 MapLocationView): pickup + dropoff markers, the live driver
// marker (latest ping), the travelled polyline, a travelled/elapsed readout, and a LIVE indicator;
// it live-polls the /track read every 5s while en_route (the walk-live 2.7 shape). On completion it
// shows the final route summary. When the screen is opened in driver mode (mode=driver + providerId),
// it also renders a "Share live location" control that posts the device's GPS while en_route.
// Real data only — no simulated movement.

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function metresToMiles(m) {
  if (m == null) return null;
  return Math.round((Number(m) / 1609.34) * 100) / 100;
}

export default function TransportTrackScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const providerId = Array.isArray(params.providerId)
    ? params.providerId[0]
    : params.providerId;
  const isDriver = params.mode === "driver";

  const { data, isLoading } = useTripTrack(tripId, { live: true });
  const trip = data?.trip;
  const locations = useMemo(
    () =>
      (data?.locations ?? []).filter((p) => isValidCoord(p.lat, p.lng)),
    [data],
  );

  const isEnRoute = trip?.status === "en_route";
  const isDone = trip?.status === "completed";

  const pickup =
    trip && isValidCoord(trip.pickup_lat, trip.pickup_lng)
      ? { lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng), title: t("transport.pickup") }
      : null;
  const dropoff =
    trip && isValidCoord(trip.dropoff_lat, trip.dropoff_lng)
      ? { lat: Number(trip.dropoff_lat), lng: Number(trip.dropoff_lng), title: t("transport.dropoff") }
      : null;
  const latest = locations.length
    ? {
        lat: Number(locations[locations.length - 1].lat),
        lng: Number(locations[locations.length - 1].lng),
        title: t("transport.driver"),
      }
    : null;

  const markers = [pickup, dropoff, latest].filter(Boolean);
  const polyline = locations.map((p) => ({
    lat: Number(p.lat),
    lng: Number(p.lng),
  }));

  // Travelled distance (sum of the ping path) + elapsed (first→last ping).
  const travelledM = useMemo(() => {
    let sum = 0;
    for (let i = 1; i < polyline.length; i++) {
      sum += haversineMeters(polyline[i - 1], polyline[i]);
    }
    return sum;
  }, [polyline]);
  const elapsedMin = useMemo(() => {
    if (locations.length < 2) return null;
    const t0 = new Date(locations[0].recorded_at).getTime();
    const t1 = new Date(locations[locations.length - 1].recorded_at).getTime();
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
    return Math.max(0, Math.round((t1 - t0) / 60000));
  }, [locations]);

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
          <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
            {isDone ? t("transport.completedTitle") : t("transport.trackTitle")}
          </Text>
          {trip?.status ? (
            <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
              {trip.pickup_address} → {trip.dropoff_address}
            </Text>
          ) : null}
        </View>
        {isEnRoute ? <LiveDot label={t("transport.live")} /> : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {isLoading && !trip ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : !trip ? (
          <EmptyState
            title={t("transport.notFoundTitle")}
            body={t("transport.notFoundBody")}
          />
        ) : (
          <>
            <View testID="track-map" style={{ marginBottom: 16 }}>
              <MapLocationView
                points={markers}
                polyline={polyline}
                height={260}
              />
            </View>

            {locations.length === 0 ? (
              <Text
                testID="track-waiting"
                style={{
                  fontSize: 13,
                  color: COLORS.mutedBrown,
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                {isEnRoute ? t("transport.waiting") : t("transport.noRoute")}
              </Text>
            ) : (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <Stat
                  label={t("transport.travelled")}
                  value={
                    travelledM > 0 ? `${metresToMiles(travelledM)} mi` : "—"
                  }
                />
                <Stat
                  label={t("transport.elapsed")}
                  value={elapsedMin != null ? `${elapsedMin} min` : "—"}
                />
                <Stat label={t("transport.pings")} value={String(locations.length)} />
              </View>
            )}

            {isDriver && providerId ? (
              <DriverShareBar
                providerId={providerId}
                tripId={tripId}
                enRoute={isEnRoute}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Driver-side live sharing. While the trip is en_route, posts the device's GPS every ~8s. Degrades
// cleanly if permission is denied (a clear message, no crash) and stops the instant the trip leaves
// en_route or the user stops it.
function DriverShareBar({ providerId, tripId, enRoute }) {
  const { t } = useTranslation();
  const post = usePostTripLocation();
  const [sharing, setSharing] = useState(false);
  const [denied, setDenied] = useState(false);
  const timer = useRef(null);

  const stop = () => {
    setSharing(false);
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const pushOnce = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({});
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      if (isValidCoord(lat, lng)) {
        await post.mutateAsync({ providerId, tripId, lat, lng });
      }
    } catch (err) {
      console.warn("[DriverShareBar] post error", err?.message);
    }
  };

  const start = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setDenied(true);
      return;
    }
    setDenied(false);
    setSharing(true);
    await pushOnce();
    timer.current = setInterval(pushOnce, 8000);
  };

  // Stop automatically once the trip is no longer en_route, and clean up on unmount.
  useEffect(() => {
    if (!enRoute && sharing) stop();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [enRoute, sharing]);

  if (!enRoute) {
    return (
      <Text
        testID="driver-not-enroute"
        style={{ fontSize: 13, color: COLORS.mutedBrown, textAlign: "center" }}
      >
        {t("transport.notEnRoute")}
      </Text>
    );
  }

  return (
    <View>
      <TouchableOpacity
        testID="driver-share-toggle"
        onPress={sharing ? stop : start}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: sharing ? "#C2410C" : COLORS.coral,
          borderRadius: 14,
          paddingVertical: 14,
        }}
      >
        {sharing ? (
          <Radio size={18} color="#FFF" />
        ) : (
          <Navigation size={18} color="#FFF" />
        )}
        <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 15 }}>
          {sharing ? t("transport.stopSharing") : t("transport.shareLive")}
        </Text>
      </TouchableOpacity>
      {sharing ? (
        <Text
          testID="driver-sharing"
          style={{
            fontSize: 12,
            color: COLORS.mutedBrown,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          {t("transport.sharing")}
        </Text>
      ) : null}
      {denied ? (
        <Text
          testID="driver-denied"
          style={{
            fontSize: 12,
            color: "#C2410C",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          {t("transport.locationDenied")}
        </Text>
      ) : null}
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

function LiveDot({ label }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: COLORS.coral + "20",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <View
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.coral }}
      />
      <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.coral }}>
        {label}
      </Text>
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
      <MapPin size={32} color={COLORS.mutedBrown} />
      <Text
        style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 12 }}
      >
        {title}
      </Text>
      <Text
        style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 6, textAlign: "center" }}
      >
        {body}
      </Text>
    </View>
  );
}
