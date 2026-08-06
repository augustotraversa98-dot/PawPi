import React from "react";
import { View, Text, ScrollView, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, MapPin, Navigation, Heart } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { useSavedPlaces, useUnsavePlace } from "@/hooks/usePlaces";
import { isValidCoord } from "@/utils/walkBuddies";

// Saved pet-friendly places — the user's favorites list. Discovery itself now flows through the
// UNIFIED Services Discover pane (providers + places over /api/services/discover), and favorites are
// SAVED from the place detail screen (/service/place). The old live-Google browser (the paid Places
// proxy / usePlacesSearch) is RETIRED — this screen is just the Saved list, reachable from the
// Services "My Activity" pane. saved_places.place_id is text, so it holds our own place ids.

function openDirections(place) {
  const q = isValidCoord(place?.lat, place?.lng)
    ? `${place.lat},${place.lng}`
    : encodeURIComponent(place?.address || place?.name || "");
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${q}`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  Linking.openURL(url);
}

export default function SavedPlacesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const { data: saved = [] } = useSavedPlaces();
  const unsave = useUnsavePlace();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
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
          {t("places.savedTitle")}
        </Text>
      </GlassSurface>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {saved.length === 0 ? (
          <Card
            testID="places-saved-empty"
            level="none"
            radius={RADIUS.control}
            borderColor={COLORS.peach}
            style={{ padding: SPACING.xxl + SPACING.xs, alignItems: "center", marginTop: SPACING.sm }}
          >
            <MapPin size={28} color={COLORS.mutedBrown} />
            <Text
              style={[
                TYPE.subhead,
                { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.sm + 2, textAlign: "center" },
              ]}
            >
              {t("places.noSaved")}
            </Text>
          </Card>
        ) : (
          saved.map((p) => (
            <Card
              key={p.id}
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
                    <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 2 }]}>
                      {p.address}
                    </Text>
                  ) : null}
                </View>
                <PressableScale
                  testID={`place-remove-${p.place_id}`}
                  onPress={() => unsave.mutate(p.id)}
                  accessibilityLabel={t("places.remove")}
                  hitSlop={8}
                >
                  <Heart size={20} color={COLORS.coral} fill={COLORS.coral} />
                </PressableScale>
              </View>
              <PressableScale
                testID={`place-directions-${p.place_id}`}
                onPress={() => openDirections(p)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm + 2 }}
              >
                <Navigation size={15} color={COLORS.sageDark} />
                <Text style={[TYPE.subhead, { color: COLORS.sageDark, fontWeight: "700" }]}>
                  {t("places.directions")}
                </Text>
              </PressableScale>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}
