import React, { useState } from "react";
import { View, Text, ScrollView, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  Bell,
  PawPrint,
  Megaphone,
  MapPin,
  Utensils,
  Target,
  ChevronRight,
  ShieldCheck,
  FileText,
  CalendarCheck,
  Dog,
  Footprints,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface, PawMark } from "@/components/ui";
import useSocialPetStore from "@/store/socialPetStore";
import {
  handleNotificationTap,
  getNotificationDisplayInfo,
} from "@/utils/handleNotificationTap";
import {
  useNotifications,
  useMarkNotificationsRead,
} from "@/hooks/useNotifications";
import { useAllCareAccessGrants } from "@/hooks/useCareAccessGrants";
import { useRecentVetNotes } from "@/hooks/useRecentVetNotes";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { formatDisplayDate, formatDisplayTime } from "@/utils/canonicalDateTime";

// A vet-authored note stays in the bell for this long, then ages out (there is no
// read-state store yet — see useRecentVetNotes). Keeps the signal fresh, not spammy.
const VET_NOTE_WINDOW_MS = 1000 * 60 * 60 * 24 * 14;

const FILTER_OPTIONS = [
  "All",
  "Requests",
  "Bookings",
  "Walks",
  "Feeding",
  "Paws",
  "Barks",
  "Training",
];

// The four booking-lifecycle notification types (0080). They share one deep-link
// target (the booking summary), one icon, and the "Bookings" filter chip.
const BOOKING_TYPES = new Set([
  "booking_requested",
  "booking_confirmed",
  "booking_declined",
  "booking_cancelled",
]);

// Adoption-application lifecycle types (0086). The shelter moved the owner's application to
// under_review / approved / declined. They share one deep-link (the owner's Applications list),
// one icon, and a per-type localized title interpolating the dog's name from the JSON body.
const ADOPTION_TYPES = new Set([
  "adoption_under_review",
  "adoption_approved",
  "adoption_declined",
]);

// Walk-request lifecycle types (C1/0092). walk_request_accepted → the OWNER (deep-links to the
// created booking via subject_ref = booking id); walk_request_targeted / _broadcast / _taken → the
// WALKER (deep-links to the walker workspace via subject_ref = request id).
const WALK_REQUEST_TYPES = new Set([
  "walk_request_targeted",
  "walk_request_broadcast",
  "walk_request_accepted",
  "walk_request_taken",
]);

// Map a pending care-access grant (a vet/business asking to see a pet's record)
// into the screen's item shape. Tagged _source:"access" so a tap routes to the
// Data Access trust screen where the owner can approve/deny. Owner-scoped by the
// route, reactive via React Query, so it survives restart and clears on decision.
// Map a vet-authored note into a bell item (Flow A awareness). Tagged
// _source:"vetNote" so a tap opens the Health tab where the Vet Record lives.
function mapVetNote(n, petName, t) {
  return {
    id: `vetnote-${n.id}`,
    _source: "vetNote",
    type: "vetNote",
    title: n.vet_name, // guaranteed non-null for vet notes (see provider notes route)
    message: t("notifications.vetNoteBody", {
      pet: petName || t("common.yourPet"),
    }),
    timestamp: n.created_at,
    read: false,
  };
}

function mapAccessGrant(g, t) {
  return {
    id: `access-${g.id}`,
    _source: "access",
    type: "access",
    title: g.provider_name || t("notifications.accessProviderFallback"),
    message: t("notifications.accessRequestBody", {
      pet: g.pet_name || t("common.yourPet"),
    }),
    timestamp: g.created_at,
    read: false, // a pending request is always unread until acted on
  };
}

// Build the localized title/message for a booking-lifecycle notification (0080). The
// server stores a compact JSON body ({ service, provider, date, time }); we parse it and
// interpolate a per-type template in the RECIPIENT's language, formatting the date/time
// in-locale. If the payload is missing/unparseable we fall back to a generic per-type
// title. TITLE = the interpolated lifecycle line; MESSAGE = a "tap to view" hint.
function bookingDisplay(n, t) {
  let payload = null;
  try {
    payload = n.body ? JSON.parse(n.body) : null;
  } catch (e) {
    payload = null;
  }
  if (!payload) {
    return {
      title: t(`notifications.${n.type}Fallback`),
      message: t("notifications.bookingHint"),
    };
  }
  const when = [formatDisplayDate(payload.date), formatDisplayTime(payload.time)]
    .filter(Boolean)
    .join(" · ");
  const title = t(`notifications.${n.type}`, {
    service: payload.service || t("notifications.bookingServiceFallback"),
    provider: payload.provider || t("notifications.bookingProviderFallback"),
    date: when,
  });
  return { title, message: t("notifications.bookingHint") };
}

// Build the localized title/message for an adoption-application notification (0086). The server
// stores a compact JSON body ({ dog }); parse it and interpolate a per-type template in the
// RECIPIENT's language. TITLE = the lifecycle line; MESSAGE = a "tap to view" hint.
function adoptionDisplay(n, t) {
  let payload = null;
  try {
    payload = n.body ? JSON.parse(n.body) : null;
  } catch (e) {
    payload = null;
  }
  const dog = payload?.dog || t("notifications.adoptionDogFallback");
  return {
    title: t(`notifications.${n.type}`, { dog }),
    message: t("notifications.adoptionHint"),
  };
}

// Build the localized title/message for a walk-request notification (C1). walk_request_accepted
// carries the booking JSON body ({ service, provider, date, time }); the others carry { when_type,
// note } and use their per-type fallback line.
function walkRequestDisplay(n, t) {
  let payload = null;
  try {
    payload = n.body ? JSON.parse(n.body) : null;
  } catch (e) {
    payload = null;
  }
  if (n.type === "walk_request_accepted") {
    return {
      title: t("notifications.walk_request_accepted", {
        provider: payload?.provider || t("notifications.bookingProviderFallback"),
      }),
      message: t("notifications.bookingHint"),
    };
  }
  return {
    title: t(`notifications.${n.type}Fallback`),
    message: t("notifications.walkRequestHint"),
  };
}

// Build the localized title/message for a weekly-digest notification (E11). The server stores a
// compact JSON body ({ pet, walks, ring_days, streak, state }); parse it and render an honest per-state
// line in the recipient's language — a quiet/empty week is warm, never a shame frame.
function weeklyDigestDisplay(n, t) {
  let payload = null;
  try {
    payload = n.body ? JSON.parse(n.body) : null;
  } catch {
    payload = null;
  }
  const name = payload?.pet || t("notifications.weeklyDigestPetFallback");
  const state = payload?.state || "rich";
  const title = t("notifications.weeklyDigestTitle", { name });
  let message;
  if (state === "empty") message = t("notifications.weeklyDigestEmpty", { name });
  else if (state === "quiet") message = t("notifications.weeklyDigestQuiet", { name });
  else
    message = t("notifications.weeklyDigestRich", {
      name,
      walks: payload?.walks ?? 0,
      ring: payload?.ring_days ?? 0,
    });
  return { title, message };
}

// Build the localized title/message for a win-back notification (E12). The server stores a compact JSON
// body ({ hook, pet, friend, milestone_kind, in_days }); parse it and render a WARM per-hook line in the
// recipient's language — a lapsed owner is never guilt-tripped.
function winbackDisplay(n, t) {
  let payload = null;
  try {
    payload = n.body ? JSON.parse(n.body) : null;
  } catch {
    payload = null;
  }
  const name = payload?.pet || t("notifications.winbackPetFallback");
  const title = t("notifications.winbackTitle", { name });
  const hook = payload?.hook || "memory";
  let message;
  if (hook === "milestone" && payload?.milestone_kind === "birthday")
    message = t("notifications.winbackBirthday", { name, days: payload?.in_days ?? 0 });
  else if (hook === "milestone")
    message = t("notifications.winbackGotcha", { name, days: payload?.in_days ?? 0 });
  else if (hook === "friend" && payload?.friend)
    message = t("notifications.winbackFriend", { name, friend: payload.friend });
  else message = t("notifications.winbackMemory", { name });
  return { title, message };
}

// Map a DB social notification (ticket 2.26) into the screen's item shape, tagged
// _source:"db" so tap-through + mark-read use the API path (reminders use the store).
// Booking-lifecycle types (0080) branch to a localized, deep-linkable booking item.
const TYPE_LABEL = { paw: "New paw", bark: "New bark", follow: "New follower" };
// E6/E7 engagement notifications — rendered from localized copy (EN+ES), not the server's body string.
const ENGAGEMENT_TYPES = new Set(["welcome", "pack_invite", "pack_accepted", "boop"]);
// BN2 business (provider-facing) notifications — rendered from localized copy (EN+ES) via the
// bizNotifBell.* keys, NOT the server's JSON body (which the client localizes). A provider/staff
// account sees these in its bell.
const BUSINESS_TYPES = new Set([
  "biz_booking",
  "biz_booking_change",
  "biz_order",
  "biz_message",
  "biz_adoption_application",
  "biz_review",
  "biz_payout",
  "biz_post_engagement",
  "biz_follow",
]);
function mapDbNotification(n, t) {
  if (WALK_REQUEST_TYPES.has(n.type)) {
    const { title, message } = walkRequestDisplay(n, t);
    const accepted = n.type === "walk_request_accepted";
    return {
      id: `db-${n.id}`,
      _source: "db",
      _dbId: n.id,
      type: n.type,
      title,
      message,
      timestamp: n.created_at,
      read: !!n.read_at,
      avatar: null,
      // accepted → subject_ref is the booking id (owner opens the booking); the walker-facing
      // types → subject_ref is the request id (walker opens their workspace).
      relatedBookingId: accepted ? n.subject_ref : null,
      relatedWalkRequestId: accepted ? null : n.subject_ref,
      relatedPetId: null,
      relatedPostId: null,
    };
  }
  if (BOOKING_TYPES.has(n.type)) {
    const { title, message } = bookingDisplay(n, t);
    return {
      id: `db-${n.id}`,
      _source: "db",
      _dbId: n.id,
      type: n.type,
      title,
      message,
      timestamp: n.created_at,
      read: !!n.read_at,
      avatar: null,
      // subject_ref = the appointment id → deep-link to the booking summary.
      relatedBookingId: n.subject_ref,
      relatedPetId: null,
      relatedPostId: null,
    };
  }
  if (ADOPTION_TYPES.has(n.type)) {
    const { title, message } = adoptionDisplay(n, t);
    return {
      id: `db-${n.id}`,
      _source: "db",
      _dbId: n.id,
      type: n.type,
      title,
      message,
      timestamp: n.created_at,
      read: !!n.read_at,
      avatar: null,
      // subject_ref = the application id → deep-link to the owner's Applications list.
      relatedApplicationId: n.subject_ref,
      relatedBookingId: null,
      relatedPetId: null,
      relatedPostId: null,
    };
  }
  if (n.type === "weekly_digest") {
    const { title, message } = weeklyDigestDisplay(n, t);
    return {
      id: `db-${n.id}`,
      _source: "db",
      _dbId: n.id,
      type: n.type,
      title,
      message,
      timestamp: n.created_at,
      read: !!n.read_at,
      avatar: null,
      relatedWeeklyDigest: true, // tap → the "Rex's Week" screen
      relatedBookingId: null,
      relatedPetId: null,
      relatedPostId: null,
    };
  }
  if (n.type === "winback") {
    const { title, message } = winbackDisplay(n, t);
    return {
      id: `db-${n.id}`,
      _source: "db",
      _dbId: n.id,
      type: n.type,
      title,
      message,
      timestamp: n.created_at,
      read: !!n.read_at,
      avatar: null,
      relatedWelcomeBack: true, // tap → the "Welcome back" screen
      relatedBookingId: null,
      relatedPetId: null,
      relatedPostId: null,
    };
  }
  if (BUSINESS_TYPES.has(n.type)) {
    return {
      id: `db-${n.id}`,
      _source: "db",
      _dbId: n.id,
      type: n.type,
      title: t(`bizNotifBell.${n.type}`),
      message: t(`bizNotifBell.${n.type}Message`),
      timestamp: n.created_at,
      read: !!n.read_at,
      avatar: n.actor_avatar || null,
      // subject_ref meaning varies by type (booking/application/post/provider id); the business
      // hub surfaces the detail — the bell renders the localized headline + marks read.
      relatedBookingId: null,
      relatedPetId: null,
      relatedPostId: null,
    };
  }
  const isEngagement = ENGAGEMENT_TYPES.has(n.type);
  return {
    id: `db-${n.id}`,
    _source: "db",
    _dbId: n.id,
    type: n.type,
    title:
      n.type === "welcome"
        ? t("notifications.welcomeTitle")
        : n.actor_username
          ? `@${n.actor_username}`
          : "Someone",
    message: isEngagement
      ? t(`notifications.${n.type}`)
      : n.body || TYPE_LABEL[n.type] || "New activity",
    timestamp: n.created_at,
    read: !!n.read_at,
    avatar: n.actor_avatar || null,
    // follow taps to the pet; paw/bark relate to a post (returns to the feed).
    relatedPetId: n.type === "follow" ? n.subject_ref : null,
    relatedPostId: n.type === "follow" ? null : n.subject_ref,
  };
}

const NotificationIcon = ({ type }) => {
  if (BOOKING_TYPES.has(type)) {
    return <CalendarCheck size={18} color={COLORS.sageDark} />;
  }
  if (ADOPTION_TYPES.has(type)) {
    return <Dog size={18} color={COLORS.coral} />;
  }
  if (WALK_REQUEST_TYPES.has(type)) {
    return <Footprints size={18} color={COLORS.coral} />;
  }
  if (type === "weekly_digest") {
    return <CalendarCheck size={18} color={COLORS.coral} />;
  }
  if (type === "winback") {
    return <PawPrint size={18} color={COLORS.coral} fill={COLORS.coral} />;
  }
  switch (type) {
    case "walk":
      return <MapPin size={18} color={COLORS.sage} />;
    case "feeding":
      return <Utensils size={18} color={COLORS.coral} />;
    case "paw":
      return <PawPrint size={18} color={COLORS.coral} fill={COLORS.coral} />;
    case "bark":
      return <Megaphone size={18} color={COLORS.terracotta} />;
    case "training":
      return <Target size={18} color={COLORS.sageDark} />;
    case "access":
      return <ShieldCheck size={18} color={COLORS.sageDark} />;
    case "vetNote":
      return <FileText size={18} color={COLORS.terracotta} />;
    default:
      return <Bell size={18} color={COLORS.mutedBrown} />;
  }
};

const formatTimestamp = (timestamp) => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
};

// The "Requests" and "Bookings" chips have localized labels; the other chips are
// pre-existing copy owned by the i18n extraction branch, so they pass through.
const FILTER_LABEL_KEYS = {
  Requests: "notifications.filterRequests",
  Bookings: "notifications.filterBookings",
};
function filterLabel(filter, t) {
  const key = FILTER_LABEL_KEYS[filter];
  return key ? t(key) : filter;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedFilter, setSelectedFilter] = useState("All");

  // Reminder notifications live in the local store (generated by the reminder engine);
  // social notifications come from the API. The bell merges BOTH (ticket 2.26).
  const storeNotifications = useSocialPetStore((state) => state.notifications);
  const markNotificationRead = useSocialPetStore(
    (state) => state.markNotificationRead,
  );
  const markAllNotificationsRead = useSocialPetStore(
    (state) => state.markAllNotificationsRead,
  );

  const { data: dbNotifications } = useNotifications();
  const markRead = useMarkNotificationsRead();

  // Pending care-access requests (a vet/business asking to see a pet's records)
  // are owner-scoped grants, not social notifications — they'd otherwise only be
  // visible if the owner manually opened More → Data Access. Surface them in the
  // bell so a request the owner would want to approve/deny is impossible to miss.
  const { data: careGrants } = useAllCareAccessGrants();

  // Vet-note awareness (Flow A): when a vet adds a note to the current pet's
  // record, surface it in the bell so the owner isn't left to discover it inside a
  // collapsed Vet Record section. Scoped to the current pet (the notes API is
  // per-pet) and bounded by recency so it ages out without a read-state store.
  const { data: currentPet } = useCurrentPet();
  const { data: vetNotes } = useRecentVetNotes(currentPet?.id);

  // Merge: local reminder notifications (those with a reminderId) + the real social
  // notifications from the API + pending care-access requests + recent vet notes,
  // newest first. No mock data.
  const reminderNotifs = (storeNotifications || []).filter((n) => n.reminderId);
  const socialNotifs = (dbNotifications || []).map((n) => mapDbNotification(n, t));
  const accessNotifs = (careGrants || [])
    .filter((g) => g.status === "pending")
    .map((g) => mapAccessGrant(g, t));
  const nowMs = Date.now();
  const vetNoteNotifs = (vetNotes || [])
    .filter(
      (n) =>
        n.vet_name &&
        n.created_at &&
        nowMs - new Date(n.created_at).getTime() < VET_NOTE_WINDOW_MS,
    )
    .map((n) => mapVetNote(n, currentPet?.name, t));
  const merged = [
    ...accessNotifs,
    ...vetNoteNotifs,
    ...socialNotifs,
    ...reminderNotifs,
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Filter notifications
  const filteredNotifications = merged.filter((notif) => {
    if (selectedFilter === "All") return true;
    if (selectedFilter === "Bookings") return BOOKING_TYPES.has(notif.type);
    const typeMap = {
      Requests: "access",
      Walks: "walk",
      Feeding: "feeding",
      Paws: "paw",
      Barks: "bark",
      Training: "training",
    };
    return notif.type === typeMap[selectedFilter];
  });

  const handleNotifTap = (notif) => {
    if (notif._source === "access") {
      // Take the owner to the trust screen to approve/deny the request.
      router.push("/(tabs)/more/data-access");
      return;
    }

    if (notif._source === "vetNote") {
      // Open the Health tab where the Vet Record (and the new note) lives.
      router.push("/(tabs)/health");
      return;
    }

    if (notif._source === "db") {
      if (!notif.read) markRead.mutate({ ids: [notif._dbId] });
      if (notif.relatedBookingId) {
        // Booking lifecycle → open the booking summary (id = appointment id).
        router.push({
          pathname: "/service/booking-summary",
          params: { id: String(notif.relatedBookingId) },
        });
      } else if (notif.relatedApplicationId) {
        // Adoption lifecycle → open the owner's Applications list.
        router.push({
          pathname: "/service/adoption",
          params: { tab: "applications" },
        });
      } else if (notif.relatedWalkRequestId) {
        // Walk request (walker-facing) → open the walker workspace's incoming list.
        router.push("/walker-walks");
      } else if (notif.relatedWeeklyDigest) {
        // Weekly digest (E11) → open the "Rex's Week" screen.
        router.push("/weekly-digest");
      } else if (notif.relatedWelcomeBack) {
        // Win-back (E12) → open the "Welcome back" screen.
        router.push("/welcome-back");
      } else if (notif.relatedPetId) {
        router.push({
          pathname: "/pet-profile",
          params: { petId: String(notif.relatedPetId) },
        });
      } else {
        router.back(); // paw/bark → back to the feed where the post lives
      }
      return;
    }

    // Reminder notification (local store).
    if (!notif.read) {
      markNotificationRead(notif.id);
    }
    if (notif.reminderId) {
      handleNotificationTap(notif);
    } else if (notif.relatedWalkId) {
      router.back();
    }
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead(); // local reminder notifications
    markRead.mutate({ all: true }); // real social notifications
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top + 6,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <PressableScale onPress={() => router.back()} accessibilityRole="button">
            <X size={22} color={COLORS.mutedBrown} />
          </PressableScale>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
            Notifications
          </Text>
          <PressableScale onPress={handleMarkAllRead} accessibilityRole="button">
            <Text style={[TYPE.subhead, { fontWeight: "700", color: COLORS.coral }]}>
              Mark all read
            </Text>
          </PressableScale>
        </View>
      </GlassSurface>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: "center",
          paddingHorizontal: SPACING.xl,
          paddingVertical: SPACING.lg,
          gap: SPACING.sm,
        }}
        style={{
          flexGrow: 0,
          borderBottomWidth: 1,
          borderBottomColor: MATERIALS.hairline,
          backgroundColor: COLORS.card,
        }}
      >
        {FILTER_OPTIONS.map((filter) => {
          const isSelected = selectedFilter === filter;
          return (
            <PressableScale
              key={filter}
              onPress={() => setSelectedFilter(filter)}
              accessibilityRole="button"
              style={{
                paddingHorizontal: SPACING.lg,
                paddingVertical: SPACING.sm,
                borderRadius: RADIUS.chip,
                backgroundColor: isSelected ? COLORS.coral : MATERIALS.surfaceSunken,
                borderWidth: 1,
                borderColor: isSelected ? COLORS.coral : MATERIALS.hairline,
              }}
            >
              <Text
                style={[
                  TYPE.subhead,
                  { fontWeight: "700", color: isSelected ? "#FFF" : COLORS.mutedBrown },
                ]}
              >
                {filterLabel(filter, t)}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      {/* Notifications list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {filteredNotifications.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <PawMark size={48} color={COLORS.coral} />
            <Text
              style={[
                TYPE.headline,
                { fontWeight: "700", color: COLORS.warmBrown, marginTop: SPACING.lg },
              ]}
            >
              No new notifications yet
            </Text>
            <Text
              style={[
                TYPE.callout,
                {
                  color: COLORS.mutedBrown,
                  marginTop: SPACING.sm,
                  textAlign: "center",
                  paddingHorizontal: SPACING.huge,
                },
              ]}
            >
              It's quiet here for now.
            </Text>
          </View>
        ) : (
          filteredNotifications.map((notif) => {
            const isReminder = !!notif.reminderId;
            const displayInfo = isReminder
              ? getNotificationDisplayInfo(notif)
              : null;

            return (
              <PressableScale
                key={notif.id}
                onPress={() => handleNotifTap(notif)}
                accessibilityRole="button"
                style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.md }}
              >
                <Card
                  level={notif.read ? "none" : "sm"}
                  radius={RADIUS.card}
                  color={notif.read ? COLORS.card : COLORS.sand}
                  borderColor={notif.read ? MATERIALS.hairline : COLORS.coral}
                  style={{
                    padding: SPACING.lg,
                    shadowColor: notif.read ? "transparent" : COLORS.coral,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: notif.read ? 0 : 0.1,
                    shadowRadius: 8,
                    elevation: notif.read ? 0 : 2,
                  }}
                >
                  <View style={{ flexDirection: "row", gap: SPACING.md }}>
                  {notif.avatar ? (
                    <Image
                      source={{ uri: notif.avatar }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        borderWidth: 2,
                        borderColor: COLORS.coral,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: displayInfo
                          ? displayInfo.color + "20"
                          : COLORS.peach,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>
                        {displayInfo ? (
                          displayInfo.icon
                        ) : (
                          <NotificationIcon type={notif.type} />
                        )}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: SPACING.xs,
                      }}
                    >
                      <Text
                        style={[
                          TYPE.callout,
                          {
                            fontWeight: "800",
                            color: COLORS.warmBrown,
                            flex: 1,
                            marginRight: SPACING.sm,
                          },
                        ]}
                      >
                        {notif.title}
                      </Text>
                      <Text
                        style={[
                          TYPE.caption,
                          { letterSpacing: 0, fontWeight: "500", color: COLORS.mutedBrown },
                        ]}
                      >
                        {formatTimestamp(notif.timestamp)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        TYPE.subhead,
                        {
                          fontWeight: "500",
                          color: COLORS.mutedBrown,
                          lineHeight: 19,
                          marginBottom: isReminder && notif.actionLabel ? SPACING.sm : 0,
                        },
                      ]}
                    >
                      {notif.message}
                    </Text>

                    {/* Action button for reminder notifications */}
                    {isReminder && notif.actionLabel && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: displayInfo?.color || COLORS.sage,
                          borderRadius: RADIUS.control,
                          paddingHorizontal: SPACING.md,
                          paddingVertical: SPACING.sm,
                          alignSelf: "flex-start",
                        }}
                      >
                        <Text
                          style={[
                            TYPE.footnote,
                            { fontWeight: "700", color: "#FFF", marginRight: SPACING.xs },
                          ]}
                        >
                          {notif.actionLabel}
                        </Text>
                        <ChevronRight size={14} color="#FFF" />
                      </View>
                    )}
                  </View>

                  {!notif.read && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: COLORS.coral,
                        position: "absolute",
                        top: 16,
                        right: 16,
                      }}
                    />
                  )}
                  </View>
                </Card>
              </PressableScale>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
