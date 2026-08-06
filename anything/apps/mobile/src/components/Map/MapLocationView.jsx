import React from "react";
import { View, Text } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { MapPin } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { isValidCoord } from "@/utils/walkBuddies";

const C = {
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  mutedBrown: "#8B7355",
};

function toPoints(points) {
  if (!points) return [];
  const arr = Array.isArray(points) ? points : [points];
  return arr.filter((p) => p && isValidCoord(p.lat, p.lng));
}

function regionFor(pts) {
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.02),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.02),
  };
}

/**
 * MapLocationView — read-only display of a saved location or route (ticket 2.68).
 *
 * Renders one or more markers and an optional route Polyline on a real map
 * (PROVIDER_DEFAULT = Apple on iOS). Detail screens use this to SHOW a pinned
 * location or a walk/transport route. When there are no valid points it shows a
 * neutral empty state — never fake coordinates.
 *
 * Props:
 *   points: [{ lat, lng, ... }] | { lat, lng }  — marker(s) to render
 *   markers?: same shape as points               — alias/extra markers (merged)
 *   polyline?: [{ lat, lng }]                     — route line to draw
 *   height?: number                               — default 200
 *   interactive?: boolean                         — default false (scroll/zoom locked)
 *   onMarkerPress?: (index, point) => void        — ADDITIVE (Services Hub P3): makes
 *       markers tappable and reports which one. Absent → markers are not pressable and
 *       behaviour is unchanged for existing callers (places/events/transport/adoption).
 *   selectedIndex?: number                        — ADDITIVE: highlights that marker
 *       (coral pin). Absent/-1 → all markers use the default pin.
 *   center?: { lat, lng }                          — ADDITIVE: recenters the map on this point
 *       (e.g. a searched location) regardless of the markers, remounting so it moves live. Absent →
 *       the region is derived from the markers/polyline as before.
 *   onRegionChange?: (region, details) => void     — ADDITIVE: reports the visible region once a
 *       pan/zoom settles (react-native-maps' onRegionChangeComplete; `details.isGesture` tells a
 *       user move from a programmatic one). Absent → not wired, behaviour unchanged.
 *   testID?: string
 */
export default function MapLocationView({
  points,
  markers,
  polyline,
  height = 200,
  interactive = false,
  onMarkerPress,
  selectedIndex = -1,
  center,
  onRegionChange,
  testID = "map-location-view",
}) {
  const { t } = useTranslation();
  const allMarkers = [...toPoints(points), ...toPoints(markers)];
  const line = toPoints(polyline);
  // An explicit center (a searched location) wins over the marker-derived region so the map shows
  // that area even when it has no pins yet.
  const centerPt = center && isValidCoord(center.lat, center.lng) ? center : null;
  const region = centerPt
    ? {
        latitude: centerPt.lat,
        longitude: centerPt.lng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }
    : regionFor(allMarkers.length ? allMarkers : line);

  if (!region) {
    return (
      <View
        testID={`${testID}-empty`}
        style={{
          height,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: C.peach,
          backgroundColor: C.card,
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <MapPin size={20} color={C.mutedBrown} />
        <Text style={{ fontSize: 13, color: C.mutedBrown }}>
          {t("map.noLocation")}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={{
        height,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: C.peach,
      }}
    >
      <MapView
        testID={`${testID}-map`}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        // Remount on a new center so the map jumps to a freshly searched location (initialRegion
        // only applies at mount). No center → stable key, behaviour unchanged.
        key={centerPt ? `c-${centerPt.lat}-${centerPt.lng}` : undefined}
        initialRegion={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        onRegionChangeComplete={
          onRegionChange ? (r, details) => onRegionChange(r, details) : undefined
        }
      >
        {allMarkers.map((p, i) => (
          <Marker
            key={`m-${i}`}
            testID={`${testID}-marker-${i}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.title}
            description={p.description}
            pinColor={i === selectedIndex ? C.coral : undefined}
            onPress={
              onMarkerPress ? () => onMarkerPress(i, p) : undefined
            }
          />
        ))}
        {line.length >= 2 && (
          <Polyline
            testID={`${testID}-polyline`}
            coordinates={line.map((p) => ({
              latitude: p.lat,
              longitude: p.lng,
            }))}
            strokeColor={C.coral}
            strokeWidth={4}
          />
        )}
      </MapView>
    </View>
  );
}
