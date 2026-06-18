import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import MapLocationPicker from "./MapLocationPicker";
import { isValidCoord } from "@/utils/walkBuddies";

const C = {
  card: "#FFFBF7",
  bg: "#FFF7F0",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
};

/**
 * LocationField — the standard drop-in form row for an address/location (ticket 2.68).
 *
 * Renders a labeled, tappable summary ("Set location on map"). Tapping opens the
 * shared MapLocationPicker in a full-screen modal; "Done" writes the chosen
 * { lat, lng, address? } back through onChange. This is what every NEW form should
 * use for a location field so the Apple-Maps picker is reused, never re-rolled.
 *
 * Props:
 *   value: { lat, lng, address? } | null
 *   onChange({ lat, lng, address })
 *   label?: string
 *   showAddress?: boolean   — also collect an editable address line (default true)
 *   testID?: string
 */
export default function LocationField({
  value,
  onChange,
  label,
  showAddress = true,
  testID = "location-field",
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draftCoord, setDraftCoord] = useState(
    value && isValidCoord(value.lat, value.lng)
      ? { lat: value.lat, lng: value.lng }
      : null,
  );
  const [draftAddr, setDraftAddr] = useState(value?.address || "");

  const hasValue =
    (value && isValidCoord(value.lat, value.lng)) || !!value?.address;

  const openSheet = () => {
    setDraftCoord(
      value && isValidCoord(value.lat, value.lng)
        ? { lat: value.lat, lng: value.lng }
        : null,
    );
    setDraftAddr(value?.address || "");
    setOpen(true);
  };

  const save = () => {
    onChange?.({
      lat: draftCoord?.lat ?? null,
      lng: draftCoord?.lng ?? null,
      address: draftAddr.trim() || null,
    });
    setOpen(false);
  };

  const summary = hasValue
    ? value.address ||
      `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`
    : t("map.setOnMap");

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

      <TouchableOpacity
        testID={`${testID}-open`}
        onPress={openSheet}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: C.card,
          borderWidth: 1.5,
          borderColor: C.peach,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 12,
        }}
      >
        <MapPin size={16} color={hasValue ? C.coral : C.mutedBrown} />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 14,
            color: hasValue ? C.warmBrown : C.mutedBrown,
          }}
        >
          {summary}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
            }}
          >
            <TouchableOpacity
              testID={`${testID}-close`}
              onPress={() => setOpen(false)}
            >
              <X size={22} color={C.warmBrown} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 16, fontWeight: "800", color: C.warmBrown }}
            >
              {label || t("map.setOnMap")}
            </Text>
            <TouchableOpacity testID={`${testID}-done`} onPress={save}>
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: C.coral }}
              >
                {t("common.done")}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: 16 }}>
            <MapLocationPicker
              testID={`${testID}-picker`}
              value={draftCoord}
              onChange={setDraftCoord}
              showAddress={showAddress}
              address={draftAddr}
              onAddressChange={setDraftAddr}
              height={320}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
