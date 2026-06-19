import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { ArrowLeft, Plus, Users, Navigation, CalendarDays } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { Card, GlassSurface, PressableScale } from "@/components/ui";
import MapLocationView from "@/components/Map/MapLocationView";
import { useEvents, useRsvpEvent, useCancelEvent } from "@/hooks/useEvents";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { isValidCoord } from "@/utils/walkBuddies";
import {
  addEventToCalendar,
  removeSurfaceEventFromCalendar,
} from "@/utils/calendarIntegration";

// Community Events / meetups (ticket 2.74). Upcoming published events on a 2.68 Apple map + a list;
// RSVP toggle (going/not_going) with a live attendee count; "Directions" to Apple Maps; hosts can
// cancel their own event; a "+" opens the create form (2.68 map picker). Empty states; real data only.

function fmtWhen(startsAt) {
  if (!startsAt) return "";
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return String(startsAt);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function openDirections(e) {
  if (!isValidCoord(e.lat, e.lng)) return;
  const q = `${e.lat},${e.lng}`;
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${q}`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  Linking.openURL(url);
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [coord, setCoord] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({});
        if (active && isValidCoord(pos?.coords?.latitude, pos?.coords?.longitude)) {
          setCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        /* location is optional — fall back to the un-filtered list */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const { data: events = [], isLoading } = useEvents(coord || {});
  const rsvp = useRsvpEvent();
  const cancel = useCancelEvent();

  const markers = events
    .filter((e) => isValidCoord(e.lat, e.lng))
    .map((e) => ({ lat: Number(e.lat), lng: Number(e.lng), title: e.title }));

  const toggleRsvp = async (e) => {
    const next = e.my_rsvp === "going" ? "not_going" : "going";
    // Un-RSVP: remove any device calendar event and clear the stored id (2.80).
    if (next === "not_going" && e.my_calendar_event_id) {
      try {
        await removeSurfaceEventFromCalendar(e.my_calendar_event_id);
      } catch {
        /* calendar removal is best-effort — never block the RSVP change */
      }
      rsvp.mutate(
        { eventId: e.id, status: next, calendar_event_id: null },
        { onError: (err) => Alert.alert(t("events.couldNotRsvp"), err.message || "") },
      );
      return;
    }
    rsvp.mutate(
      { eventId: e.id, status: next },
      { onError: (err) => Alert.alert(t("events.couldNotRsvp"), err.message || "") },
    );
  };

  // Add (or update) the event in the device calendar — only meaningful once "going" (2.80).
  // Calendar is optional: a denied permission shows a clean message and never blocks.
  const addToCalendar = async (e) => {
    if (e.my_rsvp !== "going") {
      Alert.alert(t("calendar.permissionTitle"), t("calendar.rsvpFirst"));
      return;
    }
    const result = await addEventToCalendar(e, e.my_calendar_event_id);
    if (result.success) {
      rsvp.mutate({ eventId: e.id, status: "going", calendar_event_id: result.eventId });
      Alert.alert(
        e.my_calendar_event_id ? t("calendar.updated") : t("calendar.added"),
        e.title,
      );
    } else if (result.error === "permission_denied") {
      Alert.alert(t("calendar.permissionTitle"), t("calendar.permissionBody"));
    } else {
      Alert.alert(t("calendar.permissionTitle"), t("calendar.couldNotAdd"));
    }
  };

  const confirmCancel = (e) => {
    Alert.alert(t("events.cancelTitle"), e.title, [
      { text: t("events.keep"), style: "cancel" },
      {
        text: t("events.cancelEvent"),
        style: "destructive",
        onPress: () => cancel.mutate(e.id),
      },
    ]);
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
          paddingTop: insets.top + SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { flex: 1, color: COLORS.warmBrown }]}>
          {t("events.title")}
        </Text>
        <PressableScale
          testID="event-create-button"
          onPress={() => router.push("/event-create")}
          style={{ backgroundColor: COLORS.coral, width: 40, height: 40, borderRadius: RADIUS.chip, justifyContent: "center", alignItems: "center" }}
        >
          <Plus size={22} color="#fff" />
        </PressableScale>
      </GlassSurface>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {isLoading ? (
          <ActivityIndicator color={COLORS.coral} style={{ marginTop: SPACING.xxl }} />
        ) : events.length === 0 ? (
          <Card
            testID="events-empty"
            radius={RADIUS.card}
            style={{ padding: 28, alignItems: "center", marginTop: SPACING.sm }}
          >
            <CalendarDays size={28} color={COLORS.mutedBrown} />
            <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.sm, textAlign: "center" }]}>
              {t("events.empty")}
            </Text>
          </Card>
        ) : (
          <>
            {markers.length > 0 && (
              <View style={{ marginBottom: SPACING.lg }}>
                <MapLocationView points={markers} height={200} />
              </View>
            )}
            {events.map((e) => (
              <Card
                key={e.id}
                testID={`event-${e.id}`}
                radius={RADIUS.control}
                style={{ padding: SPACING.md, marginBottom: SPACING.sm }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[TYPE.headline, { flex: 1, color: COLORS.warmBrown, fontWeight: "800" }]}>
                    {e.title}
                  </Text>
                  {/* Report this event / block the host (T4) — hidden on your own event. */}
                  <ModerationMenu
                    targetType="event"
                    targetId={e.id}
                    authorUserId={e.host_user_id}
                    isOwn={!!e.is_host}
                    iconSize={18}
                  />
                </View>
                <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 2 }]}>
                  {fmtWhen(e.starts_at)}
                  {e.location_name ? ` · ${e.location_name}` : ""}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.xs }}>
                  <Users size={13} color={COLORS.mutedBrown} />
                  <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                    {e.attendee_count ?? 0} {t("events.going")}
                    {e.host_username ? ` · ${t("events.by")} @${e.host_username}` : ""}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm, alignItems: "center" }}>
                  <PressableScale
                    testID={`event-rsvp-${e.id}`}
                    onPress={() => toggleRsvp(e)}
                    style={{
                      backgroundColor: e.my_rsvp === "going" ? COLORS.sageDark : COLORS.coral,
                      borderRadius: RADIUS.control,
                      paddingHorizontal: SPACING.lg,
                      paddingVertical: SPACING.sm,
                    }}
                  >
                    <Text style={[TYPE.callout, { color: "#fff", fontWeight: "800" }]}>
                      {e.my_rsvp === "going" ? t("events.goingYes") : t("events.rsvp")}
                    </Text>
                  </PressableScale>
                  {e.my_rsvp === "going" && (
                    <PressableScale
                      testID={`event-add-calendar-${e.id}`}
                      onPress={() => addToCalendar(e)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <CalendarDays size={15} color={COLORS.sageDark} />
                      <Text style={[TYPE.subhead, { color: COLORS.sageDark, fontWeight: "700" }]}>
                        {e.my_calendar_event_id ? t("calendar.added") : t("calendar.addToCalendar")}
                      </Text>
                    </PressableScale>
                  )}
                  {isValidCoord(e.lat, e.lng) && (
                    <PressableScale
                      testID={`event-directions-${e.id}`}
                      onPress={() => openDirections(e)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <Navigation size={15} color={COLORS.sageDark} />
                      <Text style={[TYPE.callout, { color: COLORS.sageDark, fontWeight: "700" }]}>{t("events.directions")}</Text>
                    </PressableScale>
                  )}
                  {e.is_host && (
                    <PressableScale testID={`event-cancel-${e.id}`} onPress={() => confirmCancel(e)}>
                      <Text style={[TYPE.callout, { color: "#C2410C", fontWeight: "700" }]}>{t("events.cancel")}</Text>
                    </PressableScale>
                  )}
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
