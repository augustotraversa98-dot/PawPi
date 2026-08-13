import React from "react";
import { View, Text } from "react-native";
import { MapPin, MapPinOff } from "lucide-react-native";
import MapLocationView from "@/components/Map/MapLocationView";
import { isValidCoord } from "@/utils/walkBuddies";

const C = {
  sand: "#F5EDE4",
  peach: "#FFE5D9",
  mutedBrown: "#8B7355",
};

// Walker's own live route map (ticket 2.102) — while a walk is active in walker-walks, the
// walker sees the SAME real Apple map (MapLocationView) of the track being recorded, driven
// by the very points being POSTed to the session, so they can confirm tracking is live.
// Real data only: no valid points yet → a "waiting" note; foreground location permission
// denied → a graceful "time still tracks, no map" note (no nag, no fake route).
export default function WalkerLiveMap({ points = [], permissionDenied = false }) {
  const valid = (Array.isArray(points) ? points : []).filter(
    (p) => p && isValidCoord(p.lat, p.lng),
  );

  if (permissionDenied) {
    return (
      <Note
        testID="walker-map-denied"
        icon={<MapPinOff size={22} color={C.mutedBrown} />}
        text="Location is off for this walk — the time still tracks, just no live map."
      />
    );
  }

  if (valid.length < 1) {
    return (
      <Note
        testID="walker-map-waiting"
        icon={<MapPin size={22} color={C.mutedBrown} />}
        text="Waiting for the first GPS points…"
      />
    );
  }

  const start = valid[0];
  const latest = valid[valid.length - 1];

  return (
    <View testID="walker-live-map" style={{ marginBottom: 20 }}>
      {/* Keyed on the point count so each posted point remounts the map and re-fits the
          region to the newest point — the route extends live as the walker moves. */}
      <MapLocationView
        key={`walker-route-${valid.length}`}
        polyline={valid}
        points={[
          { ...start, title: "Start" },
          { ...latest, title: "Now" },
        ]}
        height={200}
        interactive={false}
      />
    </View>
  );
}

function Note({ testID, icon, text }) {
  return (
    <View
      testID={testID}
      style={{
        height: 200,
        borderRadius: 16,
        backgroundColor: C.sand,
        borderWidth: 1,
        borderColor: C.peach,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
        paddingHorizontal: 24,
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 13,
          color: C.mutedBrown,
          marginTop: 8,
          textAlign: "center",
        }}
      >
        {text}
      </Text>
    </View>
  );
}
