import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
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
import {
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
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
      <GlassSurface
        intensity={BLUR.thick}
        style={{
          borderBottomWidth: 1,
          borderColor: MATERIALS.glassBorder,
        }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md + 2,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md + 2 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
          {t("places.title")}
        </Text>
      </GlassSurface>

      {/* Tabs */}
      <View style={{ flexDirection: "row", paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: SPACING.sm }}>
        {[
          { k: "near", label: t("places.nearby") },
          { k: "saved", label: t("places.saved") },
        ].map(({ k, label }) => (
          <PressableScale
            key={k}
            testID={`places-tab-${k}`}
            onPress={() => setTab(k)}
            style={{
              paddingHorizontal: SPACING.md + 2,
              paddingVertical: SPACING.sm,
              borderRadius: RADIUS.chip,
              backgroundColor: tab === k ? COLORS.coral : COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            <Text style={[TYPE.subhead, { fontWeight: "700", color: tab === k ? "#fff" : COLORS.warmBrown }]}>
              {label}
            </Text>
          </PressableScale>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {tab === "near" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: SPACING.md }}
            contentContainerStyle={{ gap: SPACING.sm }}
          >
            {CATEGORIES.map((c) => (
              <PressableScale
                key={c.key}
                testID={`places-cat-${c.key}`}
                onPress={() => setCategory(c.key)}
                style={{
                  paddingHorizontal: SPACING.md + 2,
                  paddingVertical: SPACING.sm,
                  borderRadius: RADIUS.chip,
                  backgroundColor: category === c.key ? COLORS.coral : COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.peach,
                }}
              >
                <Text style={[TYPE.subhead, { fontWeight: "700", color: category === c.key ? "#fff" : COLORS.warmBrown }]}>
                  {c.label}
                </Text>
              </PressableScale>
            ))}
          </ScrollView>
        )}

        {/* Degrade-clean / permission / loading / empty states */}
        {tab === "near" && !configured ? (
          <Empty testID="places-unconfigured" body={t("places.notSetUp")} />
        ) : tab === "near" && denied && !coord ? (
          <Empty testID="places-denied" body={t("places.locationDenied")} />
        ) : tab === "near" && isLoading ? (
          <ActivityIndicator color={COLORS.coral} style={{ marginTop: SPACING.xxl }} />
        ) : list.length === 0 ? (
          <Empty
            testID={tab === "saved" ? "places-saved-empty" : "places-empty"}
            body={tab === "saved" ? t("places.noSaved") : t("places.noResults")}
          />
        ) : (
          <>
            <View style={{ marginBottom: SPACING.lg }}>
              <MapLocationView points={markers} height={220} />
            </View>
            {list.map((p) => (
              <Card
                key={p.place_id}
                testID={`place-${p.place_id}`}
                level="none"
                radius={RADIUS.control - 2}
                borderColor={COLORS.peach}
                style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: SPACING.sm }}>
                    <Text style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown }]}>{p.name}</Text>
                    {p.address ? (
                      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 2 }]}>{p.address}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm + 2, marginTop: SPACING.xs }}>
                      {p.rating != null && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Star size={12} color={COLORS.coral} />
                          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>{p.rating}</Text>
                        </View>
                      )}
                      {p.open_now != null && (
                        <Text style={[TYPE.footnote, { color: p.open_now ? COLORS.sageDark : "#C2410C", fontWeight: "700" }]}>
                          {p.open_now ? t("places.openNow") : t("places.closed")}
                        </Text>
                      )}
                    </View>
                  </View>
                  <PressableScale
                    testID={`place-save-${p.place_id}`}
                    onPress={() => toggleSave(p)}
                    hitSlop={8}
                  >
                    <Heart
                      size={20}
                      color={COLORS.coral}
                      fill={savedIds.has(p.place_id) ? COLORS.coral : "none"}
                    />
                  </PressableScale>
                </View>
                <PressableScale
                  testID={`place-directions-${p.place_id}`}
                  onPress={() => openDirections(p)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm + 2 }}
                >
                  <Navigation size={15} color={COLORS.sageDark} />
                  <Text style={[TYPE.subhead, { color: COLORS.sageDark, fontWeight: "700" }]}>{t("places.directions")}</Text>
                </PressableScale>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Empty({ body, testID }) {
  return (
    <Card
      testID={testID}
      level="none"
      radius={RADIUS.control}
      borderColor={COLORS.peach}
      style={{ padding: SPACING.xxl + SPACING.xs, alignItems: "center", marginTop: SPACING.sm }}
    >
      <MapPin size={28} color={COLORS.mutedBrown} />
      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.sm + 2, textAlign: "center" }]}>
        {body}
      </Text>
    </Card>
  );
}
