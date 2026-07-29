import React, { useEffect, useRef, useState } from "react";
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
import { useDebouncedValue } from "@/hooks/useSearch";
import { reverseGeocode, forwardGeocode } from "@/utils/geocoding";

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
 * Address autofill (ticket N1): once a dropped/dragged pin settles, the coordinates
 * are reverse-geocoded (debounced — never on every drag frame) and the resolved
 * "street, city" is shown in the pin readout, and — when showAddress is on — written
 * into the address field via onAddressChange. Symmetrically, submitting/blurring the
 * address field forward-geocodes the typed text and moves the pin there; a miss shows
 * an inline "couldn't find that address" message instead of crashing or no-opping.
 * Both directions degrade to the plain manual lat/lng path when permission is denied
 * or geocoding returns nothing.
 *
 * Props:
 *   value: { lat, lng } | null            — current pin
 *   onChange({ lat, lng })                — fired on tap / drag / "My location" / a
 *                                            successful address forward-geocode
 *   height?: number                       — map height (default 220)
 *   showAddress?: boolean                 — render an editable address text field
 *   address?: string                      — controlled address text (with showAddress)
 *   onAddressChange?(text)                — address text handler; also receives the
 *                                            reverse-geocoded address once a new pin
 *                                            settles
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
  const [resolvedAddress, setResolvedAddress] = useState(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [addressNotFound, setAddressNotFound] = useState(false);

  const hasPin = value && isValidCoord(value.lat, value.lng);
  const pinKey = hasPin ? `${value.lat},${value.lng}` : null;
  const debouncedPinKey = useDebouncedValue(pinKey, 450);
  const isFirstPin = useRef(true);

  // Reverse-geocode the pin once it SETTLES (ticket N1) — debounced so a drag doesn't
  // fire a lookup per frame, and skipped on the very first render so opening the
  // picker with an already-saved pin (edit flow) never clobbers an existing address.
  // Never throws / never blocks: a denied permission or no match just leaves the
  // coordinate readout showing, exactly like before this feature existed.
  useEffect(() => {
    if (isFirstPin.current) {
      isFirstPin.current = false;
      return;
    }
    if (!debouncedPinKey) {
      setResolvedAddress(null);
      return;
    }
    const [lat, lng] = debouncedPinKey.split(",").map(Number);
    let cancelled = false;
    reverseGeocode(lat, lng).then((addr) => {
      if (cancelled) return;
      setResolvedAddress(addr);
      if (addr && showAddress && onAddressChange) {
        onAddressChange(addr);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPinKey]);

  const handleMapPress = (e) => {
    const { latitude, longitude } = e?.nativeEvent?.coordinate || {};
    if (isValidCoord(latitude, longitude)) {
      onChange?.({ lat: latitude, lng: longitude });
    }
  };

  const handleAddressChangeText = (text) => {
    setAddressNotFound(false);
    onAddressChange?.(text);
  };

  // Forward-geocode the typed address on submit/blur and move the pin there
  // (ticket N1). A miss surfaces the inline fallback message rather than crashing
  // or silently doing nothing; the manual-entry text itself is always preserved.
  const submitAddress = async () => {
    const query = (address || "").trim();
    if (!query) {
      setAddressNotFound(false);
      return;
    }
    setResolvingAddress(true);
    const coords = await forwardGeocode(query);
    setResolvingAddress(false);
    if (coords) {
      setAddressNotFound(false);
      setRegion({
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
      onChange?.(coords);
    } else {
      setAddressNotFound(true);
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
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: addressNotFound ? 4 : 8,
            }}
          >
            <TextInput
              testID={`${testID}-address`}
              value={address}
              onChangeText={handleAddressChangeText}
              onSubmitEditing={submitAddress}
              onBlur={submitAddress}
              placeholder={t("map.addressPlaceholder")}
              placeholderTextColor={C.mutedBrown}
              style={{
                flex: 1,
                backgroundColor: C.card,
                borderWidth: 1.5,
                borderColor: addressNotFound ? C.coral : C.peach,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: C.warmBrown,
              }}
            />
            {resolvingAddress ? (
              <ActivityIndicator
                testID={`${testID}-address-loading`}
                size="small"
                color={C.coral}
              />
            ) : null}
          </View>
          {addressNotFound ? (
            <Text
              testID={`${testID}-address-error`}
              style={{ fontSize: 12, color: C.coral, marginBottom: 8 }}
            >
              {t("map.addressNotFound")}
            </Text>
          ) : null}
        </>
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
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, color: C.mutedBrown, flex: 1 }}
          >
            {hasPin
              ? resolvedAddress ||
                `${t("map.pinned")} · ${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`
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
