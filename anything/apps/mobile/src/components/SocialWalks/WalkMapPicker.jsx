import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Crosshair, MapPin } from "lucide-react-native";
import { isValidCoord } from "@/utils/walkBuddies";

const C = {
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
};

const DEFAULT_REGION = {
  latitude: 40.7128,
  longitude: -74.006,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/**
 * WalkMapPicker — drop the meeting pin for a social walk (ticket 2.43).
 *
 * Tap the map to place/move the marker; "Use my location" centers on the device.
 * Calls `onPick({ lat, lng })` whenever the pin moves. Self-contained so the create
 * screen can be tested with this child mocked.
 */
export default function WalkMapPicker({ coord, onPick, testID = "walk-map-picker" }) {
  const [locating, setLocating] = useState(false);
  const [region, setRegion] = useState(
    coord && isValidCoord(coord.lat, coord.lng)
      ? {
          latitude: coord.lat,
          longitude: coord.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }
      : DEFAULT_REGION,
  );

  const handleMapPress = (e) => {
    const { latitude, longitude } = e?.nativeEvent?.coordinate || {};
    if (isValidCoord(latitude, longitude)) {
      onPick({ lat: latitude, lng: longitude });
    }
  };

  const useMyLocation = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      if (isValidCoord(lat, lng)) {
        setRegion({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
        onPick({ lat, lng });
      }
    } catch (err) {
      console.warn("[WalkMapPicker] location error", err?.message);
    } finally {
      setLocating(false);
    }
  };

  const hasPin = coord && isValidCoord(coord.lat, coord.lng);

  return (
    <View testID={testID}>
      <View
        style={{
          height: 220,
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
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={handleMapPress}
        >
          {hasPin && (
            <Marker
              testID={`${testID}-marker`}
              coordinate={{ latitude: coord.lat, longitude: coord.lng }}
              draggable
              onDragEnd={handleMapPress}
            />
          )}
        </MapView>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <MapPin size={14} color={hasPin ? C.coral : C.mutedBrown} />
          <Text style={{ fontSize: 12, color: C.mutedBrown }}>
            {hasPin
              ? `Pinned · ${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`
              : "Tap the map to drop a meeting pin"}
          </Text>
        </View>
        <TouchableOpacity
          testID={`${testID}-locate`}
          onPress={useMyLocation}
          disabled={locating}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: C.sage,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: locating ? 0.6 : 1,
          }}
        >
          {locating ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Crosshair size={14} color="#FFF" />
          )}
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>
            My location
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
