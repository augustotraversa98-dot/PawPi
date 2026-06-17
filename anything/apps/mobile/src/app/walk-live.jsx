import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Svg, { Polyline, Circle } from "react-native-svg";
import { ArrowLeft, MapPin } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { useWalkSessions } from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";

// Owner's LIVE WALK WATCH + REPORT (ticket 2.7). Polls /api/pets/[id]/walk-sessions (the
// shared useWalkSessions hook, live mode = 5s) so the route grows in real time while the
// walk is in_progress; when the walker finishes, the same screen shows the WALK REPORT
// (distance/duration/route/potty/notes). The route is drawn from the REAL {lat,lng,t}
// points the walker posted — no map API key is configured, so we render a lightweight,
// self-contained SVG polyline of the normalized track (no fake routes, no external map).
export default function WalkLiveScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams();
  const sessionIdStr = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  // Live-poll the owner's sessions; isolate the one we're watching. We keep polling even
  // when finished (cheap) — the query stops being "live" naturally once the route stops
  // changing, but the simplest correct behaviour is to poll while this screen is open.
  const { data: sessions, isLoading } = useWalkSessions(petId, { live: true });
  const session = (sessions ?? []).find(
    (s) => String(s.id) === String(sessionIdStr),
  );

  const isLive = session?.status === "in_progress";
  const isFinished = session?.status === "finished";

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
            style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}
          >
            {isLive ? "Walk in progress" : "Walk report"}
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            {session?.walker_name || session?.provider_name || "Your walker"}
            {currentPet?.name ? ` · ${currentPet.name}` : ""}
          </Text>
        </View>
        {isLive ? <LiveDot /> : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {isLoading && !session ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : !session ? (
          <EmptyState
            title="Walk not found"
            body="This walk is no longer available."
          />
        ) : (
          <>
            <RoutePreview route={session.route} live={isLive} />
            <StatsRow session={session} />
            {isFinished ? <Report session={session} /> : null}
            {isLive ? (
              <Text
                style={{
                  fontSize: 13,
                  color: COLORS.mutedBrown,
                  textAlign: "center",
                  marginTop: 16,
                }}
              >
                Updating live — the route refreshes as {currentPet?.name || "your dog"} walks.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function metresToMiles(m) {
  if (m == null) return null;
  return Math.round((Number(m) / 1609.34) * 100) / 100;
}

// Normalize the lat/lng points into a 0..1 box and draw an SVG polyline. Real data only:
// an empty/short track renders an empty state, never a fake path.
function RoutePreview({ route, live }) {
  const points = Array.isArray(route) ? route : [];
  const W = 320;
  const H = 200;

  if (points.length < 2) {
    return (
      <View
        style={{
          height: H,
          borderRadius: 18,
          backgroundColor: COLORS.sand,
          borderWidth: 1,
          borderColor: COLORS.peach,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <MapPin size={28} color={COLORS.mutedBrown} />
        <Text
          style={{
            fontSize: 13,
            color: COLORS.mutedBrown,
            marginTop: 8,
            textAlign: "center",
            paddingHorizontal: 24,
          }}
        >
          {live
            ? "Waiting for the first GPS points…"
            : "No route was recorded for this walk."}
        </Text>
      </View>
    );
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;
  const pad = 16;

  const xy = points.map((p) => {
    const x = pad + ((p.lng - minLng) / spanLng) * (W - 2 * pad);
    // Invert lat so north is up.
    const y = pad + ((maxLat - p.lat) / spanLat) * (H - 2 * pad);
    return [x, y];
  });
  const polyPoints = xy.map(([x, y]) => `${x},${y}`).join(" ");
  const [sx, sy] = xy[0];
  const [ex, ey] = xy[xy.length - 1];

  return (
    <View
      style={{
        height: H,
        borderRadius: 18,
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.peach,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Polyline
          points={polyPoints}
          fill="none"
          stroke={COLORS.coral}
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={sx} cy={sy} r={6} fill={COLORS.sage} />
        <Circle cx={ex} cy={ey} r={6} fill={COLORS.coral} />
      </Svg>
    </View>
  );
}

function StatsRow({ session }) {
  const miles = metresToMiles(session.distance_m);
  const mins =
    session.duration_s != null
      ? Math.round(session.duration_s / 60)
      : session.started_at && session.status === "in_progress"
        ? Math.max(
            0,
            Math.round(
              (Date.now() - new Date(session.started_at).getTime()) / 60000,
            ),
          )
        : null;
  const pts = Array.isArray(session.route) ? session.route.length : 0;

  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
      <Stat label="Distance" value={miles != null ? `${miles} mi` : "—"} />
      <Stat label="Time" value={mins != null ? `${mins} min` : "—"} />
      <Stat label="GPS points" value={String(pts)} />
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

function Report({ session }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "800",
          color: COLORS.warmBrown,
          marginBottom: 10,
        }}
      >
        Summary
      </Text>
      <Row label="Potty">
        <Text style={{ fontSize: 14, color: COLORS.warmBrown }}>
          {session.potty_pee ? "💦 Pee" : ""}
          {session.potty_pee && session.potty_poo ? "  " : ""}
          {session.potty_poo ? "💩 Poo" : ""}
          {!session.potty_pee && !session.potty_poo ? "None recorded" : ""}
        </Text>
      </Row>
      {session.notes ? (
        <Row label="Notes">
          <Text style={{ fontSize: 14, color: COLORS.warmBrown }}>
            {session.notes}
          </Text>
        </Row>
      ) : null}
      <Text
        style={{
          fontSize: 12,
          color: COLORS.mutedBrown,
          marginTop: 12,
          fontStyle: "italic",
        }}
      >
        This walk was added to your pet's Health timeline.
      </Text>
    </View>
  );
}

function Row({ label, children }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          fontSize: 12,
          color: COLORS.mutedBrown,
          marginBottom: 4,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function LiveDot() {
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
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: COLORS.coral,
        }}
      />
      <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.coral }}>
        LIVE
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
