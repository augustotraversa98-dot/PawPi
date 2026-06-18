import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Crosshair, MapPin } from "lucide-react-native";
import { useTranslation } from "react-i18next";
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
 * MapLocationPicker — the SHARED, reusable location picker (ticket 2.68).
 *
 * Generalizes the old WalkMapPicker so every location/address section can drop
 * the SAME Apple-Maps picker (PROVIDER_DEFAULT = Apple on iOS, no key; Google on
 * web via the maps.web polyfill). Tap-to-drop + draggable marker + "My location"
 * (expo-location, graceful when denied) + a pinned-coords readout.
 *
 * Props:
 *   value: { lat, lng } | null            — current pin
 *   onChange({ lat, lng })                — fired on tap / drag / "My location"
 *   height?: number                       — map height (default 220)
 *   showAddress?: boolean                 — render an editable address text field
 *   address?: string                      — controlled address text (with showAddress)
 *   onAddressChange?(text)                — address text handler
 *   label?: string                        — optional field label above the map
 *   testID?: string
 */
export default function MapLocationPicker({
  value,
  onChange,
  height = 220,
  showAddress = false,
  address = "",
  onAddressChange,
  label,
  testID = "map-location-picker",
}) {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [region, setRegion] = useState(
    value && isValidCoord(value.lat, value.lng)
      ? {
          latitude: value.lat,
          longitude: value.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }
      : DEFAULT_REGION,
  );

  const handleMapPress = (e) => {
    const { latitude, longitude } = e?.nativeEvent?.coordinate || {};
    if (isValidCoord(latitude, longitude)) {
      onChange?.({ lat: latitude, lng: longitude });
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
        onChange?.({ lat, lng });
      }
    } catch (err) {
      console.warn("[MapLocationPicker] location error", err?.message);
    } finally {
      setLocating(false);
    }
  };

  const hasPin = value && isValidCoord(value.lat, value.lng);

  return (
    <View testID={testID}>
      {label ? (
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: C.warmBrown,
            marginBottom: 6,
          }}
        >
          {label}
        </Text>
      ) : null}

      {showAddress ? (
        <TextInput
          testID={`${testID}-address`}
          value={address}
          onChangeText={onAddressChange}
          placeholder={t("map.addressPlaceholder")}
          placeholderTextColor={C.mutedBrown}
          style={{
            backgroundColor: C.card,
            borderWidth: 1.5,
            borderColor: C.peach,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
            color: C.warmBrown,
            marginBottom: 8,
          }}
        />
      ) : null}

      <View
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
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={handleMapPress}
        >
          {hasPin && (
            <Marker
              testID={`${testID}-marker`}
              coordinate={{ latitude: value.lat, longitude: value.lng }}
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
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}
        >
          <MapPin size={14} color={hasPin ? C.coral : C.mutedBrown} />
          <Text style={{ fontSize: 12, color: C.mutedBrown }}>
            {hasPin
              ? `${t("map.pinned")} · ${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`
              : t("map.tapToDrop")}
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
            {t("map.myLocation")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
