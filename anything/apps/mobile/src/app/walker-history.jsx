import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Footprints, ChevronDown, ChevronRight, MapPin } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import MapLocationView from "@/components/Map/MapLocationView";
import { useMyProviders, useWalkerWalkHistory } from "@/hooks/useProviders";
import { isValidCoord } from "@/utils/walkBuddies";

// WALKER walk history (ticket B5) — a walker's finished walks, newest-first: dog + date + duration
// + distance, expandable to the real route drawn on the map (MapLocationView), the pickup marker
// (from B3), and any walk photos. Read-only over the existing walk-sessions read (participant-
// scoped RLS is the guard). No fake routes: a session with no captured route renders gracefully.
export default function WalkerHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const { data: providers, isLoading: loadingProviders } = useMyProviders();
  const provider = (providers ?? [])[0] ?? null;
  const {
    data: sessions,
    isLoading,
    isError,
    refetch,
  } = useWalkerWalkHistory(provider?.id);

  const [expandedId, setExpandedId] = useState(null);
  const list = sessions ?? [];

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
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>
            {t("walkHistory.title", "Walk history")}
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            {provider ? provider.name : t("walkHistory.subtitle", "Your past walks")}
          </Text>
        </View>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      >
        {loadingProviders || isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : !provider ? (
          <EmptyState
            title={t("walkHistory.noWorkspaceTitle", "No walker workspace")}
            body={t("walkHistory.noWorkspaceBody", "You're not active staff of a walking provider yet.")}
          />
        ) : isError ? (
          <EmptyState
            title={t("walkHistory.errorTitle", "Couldn't load history")}
            body={t("walkHistory.errorBody", "Pull down to try again.")}
          />
        ) : list.length === 0 ? (
          <EmptyState
            title={t("walkHistory.emptyTitle", "No past walks yet")}
            body={t("walkHistory.emptyBody", "Finished walks will show here with their route and pickup point.")}
          />
        ) : (
          list.map((s) => (
            <HistoryCard
              key={s.id}
              session={s}
              expanded={expandedId === s.id}
              onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
              t={t}
            />
          ))
        )}
      </RefreshableScrollView>
    </View>
  );
}

function metresToKm(m) {
  if (m == null) return null;
  return Math.round((Number(m) / 1000) * 100) / 100;
}

function HistoryCard({ session, expanded, onToggle, t }) {
  const km = metresToKm(session.distance_m);
  const mins = session.duration_s != null ? Math.round(Number(session.duration_s) / 60) : null;
  const date = session.ended_at || session.created_at;
  const route = (Array.isArray(session.route) ? session.route : []).filter(
    (p) => p && isValidCoord(p.lat, p.lng),
  );
  const hasPickup = isValidCoord(session.pickup_lat, session.pickup_lng);
  const photos = Array.isArray(session.photo_urls) ? session.photo_urls : [];

  // Markers: start of route + the pickup point (from B3). Polyline = the full route.
  const markers = [];
  if (hasPickup) {
    markers.push({ lat: Number(session.pickup_lat), lng: Number(session.pickup_lng), title: t("walkHistory.pickup", "Pickup") });
  } else if (route.length > 0) {
    markers.push({ lat: route[0].lat, lng: route[0].lng, title: t("walkHistory.start", "Start") });
  }

  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="button"
        testID={`history-row-${session.id}`}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
            marginRight: 12,
          }}
        >
          <Footprints size={20} color={COLORS.coral} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>
            {session.pet_name || t("walkHistory.dog", "Dog")}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}>
            {date ? new Date(date).toLocaleDateString() : ""}
            {mins != null ? ` · ${mins} min` : ""}
            {km != null ? ` · ${km} km` : ""}
          </Text>
        </View>
        {expanded ? (
          <ChevronDown size={18} color={COLORS.mutedBrown} />
        ) : (
          <ChevronRight size={18} color={COLORS.mutedBrown} />
        )}
      </TouchableOpacity>

      {expanded ? (
        <View style={{ marginTop: 12 }}>
          {route.length >= 2 ? (
            <View
              style={{ height: 200, borderRadius: 14, overflow: "hidden", backgroundColor: COLORS.sand }}
              testID={`history-map-${session.id}`}
            >
              <MapLocationView
                polyline={route.map((p) => ({ lat: p.lat, lng: p.lng }))}
                markers={markers}
                points={markers}
              />
            </View>
          ) : (
            <View
              testID={`history-noroute-${session.id}`}
              style={{
                paddingVertical: 20,
                alignItems: "center",
                backgroundColor: COLORS.sand,
                borderRadius: 14,
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <MapPin size={18} color={COLORS.mutedBrown} />
              <Text style={{ fontSize: 13, color: COLORS.mutedBrown }}>
                {t("walkHistory.noRoute", "No route recorded")}
              </Text>
            </View>
          )}

          {photos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 12 }}
              contentContainerStyle={{ gap: 8 }}
            >
              {photos.map((uri, i) => (
                <Image
                  key={`${session.id}-photo-${i}`}
                  testID={`history-photo-${session.id}-${i}`}
                  source={{ uri }}
                  style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: COLORS.sand }}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function EmptyState({ title, body }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 32,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Footprints size={32} color={COLORS.mutedBrown} />
      <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 12 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 6, textAlign: "center" }}>
        {body}
      </Text>
    </View>
  );
}
