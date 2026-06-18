import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { ArrowLeft, MapPin, Star, Navigation, Heart } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import MapLocationView from "@/components/Map/MapLocationView";
import {
  usePlacesSearch,
  useSavedPlaces,
  useSavePlace,
  useUnsavePlace,
} from "@/hooks/usePlaces";
import { isValidCoord } from "@/utils/walkBuddies";

// Pet-friendly Places (ticket 2.73). Apple-map (2.68 MapLocationView) + a list of nearby pet-friendly
// places from the key-gated Google proxy; category filter; save/unsave favorites + a Saved tab;
// "Directions" hands off to Apple Maps. Degrades cleanly: "not set up yet" when the key is unset,
// a typed-area fallback message when location is denied, "no results" when a search returns nothing.

const CATEGORIES = [
  { key: "park", label: "Parks" },
  { key: "cafe", label: "Cafés" },
  { key: "restaurant", label: "Dining" },
  { key: "hotel", label: "Hotels" },
  { key: "beach", label: "Beaches" },
  { key: "pet_store", label: "Pet stores" },
  { key: "vet", label: "Vets" },
];

function openDirections(place) {
  const q = isValidCoord(place.lat, place.lng)
    ? `${place.lat},${place.lng}`
    : encodeURIComponent(place.name || "");
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${q}`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  Linking.openURL(url);
}

export default function PlacesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const [coord, setCoord] = useState(null);
  const [denied, setDenied] = useState(false);
  const [category, setCategory] = useState("park");
  const [tab, setTab] = useState("near"); // "near" | "saved"

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (active) setDenied(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        if (active && isValidCoord(pos?.coords?.latitude, pos?.coords?.longitude)) {
          setCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        if (active) setDenied(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const { data: search, isLoading } = usePlacesSearch({
    lat: coord?.lat ?? null,
    lng: coord?.lng ?? null,
    category,
  });
  const { data: saved = [] } = useSavedPlaces();
  const save = useSavePlace();
  const unsave = useUnsavePlace();

  const configured = search?.configured !== false;
  const places = search?.places ?? [];
  const savedIds = useMemo(
    () => new Set(saved.map((s) => s.place_id)),
    [saved],
  );
  const savedRowFor = (placeId) => saved.find((s) => s.place_id === placeId);

  const list = tab === "saved" ? saved : places;
  const markers = list.filter((p) => isValidCoord(p.lat, p.lng));

  const toggleSave = (p) => {
    const existing = savedRowFor(p.place_id);
    if (existing) {
      unsave.mutate(existing.id);
    } else {
      save.mutate({
        place_id: p.place_id,
        name: p.name,
        category: p.category || category,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        address: p.address ?? null,
      });
    }
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
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
          {t("places.title")}
        </Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        {[
          { k: "near", label: t("places.nearby") },
          { k: "saved", label: t("places.saved") },
        ].map(({ k, label }) => (
          <TouchableOpacity
            key={k}
            testID={`places-tab-${k}`}
            onPress={() => setTab(k)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: tab === k ? COLORS.coral : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            <Text style={{ fontWeight: "700", color: tab === k ? "#fff" : COLORS.warmBrown }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {tab === "near" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                testID={`places-cat-${c.key}`}
                onPress={() => setCategory(c.key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: category === c.key ? COLORS.coral : COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.peach,
                }}
              >
                <Text style={{ fontWeight: "700", color: category === c.key ? "#fff" : COLORS.warmBrown }}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Degrade-clean / permission / loading / empty states */}
        {tab === "near" && !configured ? (
          <Empty testID="places-unconfigured" body={t("places.notSetUp")} />
        ) : tab === "near" && denied && !coord ? (
          <Empty testID="places-denied" body={t("places.locationDenied")} />
        ) : tab === "near" && isLoading ? (
          <ActivityIndicator color={COLORS.coral} style={{ marginTop: 24 }} />
        ) : list.length === 0 ? (
          <Empty
            testID={tab === "saved" ? "places-saved-empty" : "places-empty"}
            body={tab === "saved" ? t("places.noSaved") : t("places.noResults")}
          />
        ) : (
          <>
            <View style={{ marginBottom: 16 }}>
              <MapLocationView points={markers} height={220} />
            </View>
            {list.map((p) => (
              <View
                key={p.place_id}
                testID={`place-${p.place_id}`}
                style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.peach }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontWeight: "800", color: COLORS.warmBrown }}>{p.name}</Text>
                    {p.address ? (
                      <Text style={{ color: COLORS.mutedBrown, fontSize: 13, marginTop: 2 }}>{p.address}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
                      {p.rating != null && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Star size={12} color={COLORS.coral} />
                          <Text style={{ color: COLORS.mutedBrown, fontSize: 12 }}>{p.rating}</Text>
                        </View>
                      )}
                      {p.open_now != null && (
                        <Text style={{ color: p.open_now ? COLORS.sageDark : "#C2410C", fontSize: 12, fontWeight: "700" }}>
                          {p.open_now ? t("places.openNow") : t("places.closed")}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    testID={`place-save-${p.place_id}`}
                    onPress={() => toggleSave(p)}
                    hitSlop={8}
                  >
                    <Heart
                      size={20}
                      color={COLORS.coral}
                      fill={savedIds.has(p.place_id) ? COLORS.coral : "none"}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  testID={`place-directions-${p.place_id}`}
                  onPress={() => openDirections(p)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}
                >
                  <Navigation size={15} color={COLORS.sageDark} />
                  <Text style={{ color: COLORS.sageDark, fontWeight: "700" }}>{t("places.directions")}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Empty({ body, testID }) {
  return (
    <View
      testID={testID}
      style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 28, alignItems: "center", borderWidth: 1, borderColor: COLORS.peach, marginTop: 8 }}
    >
      <MapPin size={28} color={COLORS.mutedBrown} />
      <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 10, textAlign: "center" }}>
        {body}
      </Text>
    </View>
  );
}
