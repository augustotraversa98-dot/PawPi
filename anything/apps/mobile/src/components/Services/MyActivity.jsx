import React, { useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  MessageSquare,
  Footprints,
  Home,
  Heart,
  Calendar,
  ShoppingBag,
  RefreshCw,
  Clock,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useMyBookings,
  useUnreadCount,
  useWalkSessions,
  useDaycareStays,
  useSittingVisits,
  useShopOrders,
  useShopSubscriptions,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useSavedPlaces } from "@/hooks/usePlaces";
import { formatDisplayDate } from "@/utils/canonicalDateTime";

// My Activity — the consolidated owner surface for bookings, reservations, appointments,
// messages and shopping. It ONLY surfaces + LINKS INTO existing management screens; it
// duplicates NO management UI. Real data + empty states only — never a fabricated count/row.
//
// Rendered as the "My Activity" pane of the Services tab (below the [Discover | My Activity]
// toggle) AND by the thin /service/activity wrapper (which adds a back header) so existing
// deep-links still work. Primary source: useMyBookings() (GET /api/me/bookings — owner-scoped
// upcoming/past across ALL services); the pet-scoped + shop hooks add the live/active rows.

// A stay is "active" while it's booked or the dog is checked in (matches daycare.jsx).
const isActiveStay = (s) => s?.status === "booked" || s?.status === "checked_in";
// A sitting visit is "active" until it's completed or cancelled.
const isActiveVisit = (v) => v?.status !== "completed" && v?.status !== "cancelled";

// Route an UPCOMING booking to its detail. A telehealth booking keeps its own consult screen
// (the join surface) ONLY when a session actually exists; a pending/no-session telehealth
// booking has nothing there yet, so it opens the read-only booking summary like every other
// capability instead of dead-ending on an empty consults screen. Everything else opens the
// read-only booking summary (where/what was booked, notes, "Share clinic history") — NOT the
// storefront Book CTA.
function openBooking(router, booking) {
  if (booking.capability === "telehealth" && booking.telehealth_session_status != null) {
    router.push("/service/telehealth");
    return;
  }
  router.push({
    pathname: "/service/booking-summary",
    params: { id: booking.id },
  });
}

export default function MyActivity() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id ?? null;

  const bookings = useMyBookings();
  const unread = useUnreadCount();
  const walks = useWalkSessions(petId, { live: true });
  const daycare = useDaycareStays(petId);
  const sitting = useSittingVisits(petId);
  const orders = useShopOrders();
  const subs = useShopSubscriptions();
  const savedPlaces = useSavedPlaces();

  const upcoming = bookings.data?.upcoming ?? [];
  // Pending (requested) bookings the provider hasn't confirmed yet get their own section above
  // Upcoming, so a request awaiting acceptance is never mistaken for a confirmed booking.
  const pendingUpcoming = upcoming.filter((b) => b.booking_status === "requested");
  const confirmedUpcoming = upcoming.filter((b) => b.booking_status !== "requested");
  const past = bookings.data?.past ?? [];
  const unreadCount = unread.data ?? 0;
  const liveWalk = (walks.data ?? []).find((s) => s.status === "in_progress") ?? null;
  const activeStays = (daycare.data ?? []).filter(isActiveStay);
  const activeVisits = (sitting.data ?? []).filter(isActiveVisit);
  const orderList = orders.data ?? [];
  const activeSubs = (subs.data ?? []).filter((s) => s.status === "active");
  const savedCount = (savedPlaces.data ?? []).length;

  // Past is collapsed by default so it never grows into a long list (local-only, no persist).
  const [pastExpanded, setPastExpanded] = useState(false);

  // Spinner only while the primary aggregator loads (pet-scoped queries are disabled with no
  // pet, so they never hang; every count settles in as its query resolves).
  const loading = bookings.isLoading;

  const refetch = () => {
    bookings.refetch();
    unread.refetch();
    orders.refetch();
    subs.refetch();
    savedPlaces.refetch();
    if (petId != null) {
      walks.refetch();
      daycare.refetch();
      sitting.refetch();
    }
  };

  if (loading) {
    return (
      <View
        testID="activity-loading"
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator color={COLORS.coral} />
      </View>
    );
  }

  return (
    <RefreshableScrollView
      refetch={refetch}
      contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 40 }}
    >
      {/* Live walk — prominent, only when a walk is actually in progress. */}
      {liveWalk ? (
        <HubRow
          testID="activity-live-walk"
          Icon={Footprints}
          title={t("activity.liveWalk")}
          subtitle={t("activity.liveWalkSub")}
          accent
          onPress={() => router.push("/walk-live")}
        />
      ) : null}

      {/* Messages doorway — with the owner's unread badge. */}
      <HubRow
        testID="activity-messages"
        Icon={MessageSquare}
        title={t("activity.messages")}
        subtitle={
          unreadCount > 0
            ? t("activity.unread", { count: unreadCount })
            : t("activity.emptyMessages")
        }
        badge={unreadCount > 0 ? unreadCount : null}
        onPress={() => router.push("/provider-messages")}
      />

      {/* Pending requests — bookings the owner made that the provider hasn't confirmed yet.
          Shown ABOVE Upcoming so a request awaiting acceptance stands apart from a confirmed
          booking; hidden entirely when there are none. */}
      {pendingUpcoming.length > 0 ? (
        <>
          <SectionHeading
            testID="activity-pending-heading"
            text={t("activity.pendingRequests")}
          />
          {pendingUpcoming.slice(0, 5).map((b) => (
            <UpcomingBookingRow key={b.id} booking={b} />
          ))}
        </>
      ) : null}

      {/* Upcoming appointments & reservations across all services (useMyBookings). Pending
          (requested) bookings are pulled into their own section above; only confirmed/other
          bookings render here. */}
      <SectionHeading text={t("activity.upcoming")} />
      {confirmedUpcoming.length === 0 ? (
        <EmptyRow testID="activity-upcoming-empty" text={t("activity.emptyBookings")} />
      ) : (
        confirmedUpcoming.slice(0, 5).map((b) => (
          <UpcomingBookingRow key={b.id} booking={b} />
        ))
      )}

      {/* Daycare stays doorway → the daycare screen (active stays live there). Hidden when there
          are no active stays so the section shows no dead "no activity" clutter. */}
      {activeStays.length > 0 ? (
        <HubRow
          testID="activity-daycare"
          Icon={Home}
          title={t("activity.daycare")}
          subtitle={t("activity.active", { count: activeStays.length })}
          badge={activeStays.length}
          onPress={() => router.push("/service/daycare")}
        />
      ) : null}

      {/* Sitting visits doorway → the sitter-visits screen. Hidden when there are no active
          visits. */}
      {activeVisits.length > 0 ? (
        <HubRow
          testID="activity-sitting"
          Icon={Heart}
          title={t("activity.sitting")}
          subtitle={t("activity.active", { count: activeVisits.length })}
          badge={activeVisits.length}
          onPress={() => router.push("/sitter-visits")}
        />
      ) : null}

      {/* Saved places doorway → the favorites list (places are saved from the place detail screen;
          discovery flows through the unified Discover pane). Hidden when nothing is saved. */}
      {savedCount > 0 ? (
        <HubRow
          testID="activity-saved-places"
          Icon={MapPin}
          title={t("activity.savedPlaces")}
          subtitle={t("activity.savedPlacesSub")}
          onPress={() => router.push("/service/places")}
        />
      ) : null}

      {/* Shopping — orders + auto-reorder (both live in the shop screen; mirror My Hub). */}
      <SectionHeading text={t("activity.shopping")} />
      <HubRow
        testID="activity-orders"
        Icon={ShoppingBag}
        title={t("activity.orders")}
        subtitle={
          orderList.length > 0
            ? t("activity.orderCount", { count: orderList.length })
            : t("activity.emptyOrders")
        }
        badge={orderList.length > 0 ? orderList.length : null}
        onPress={() => router.push("/service/shop")}
      />
      <HubRow
        testID="activity-autoreorder"
        Icon={RefreshCw}
        title={t("activity.autoReorder")}
        subtitle={
          activeSubs.length > 0
            ? t("activity.active", { count: activeSubs.length })
            : t("activity.emptyAutoReorder")
        }
        badge={activeSubs.length > 0 ? activeSubs.length : null}
        onPress={() => router.push("/service/shop")}
      />

      {/* Past appointments & reservations (useMyBookings().past). Collapsed by default so it
          never grows into a long list; the heading shows a real count + a chevron. */}
      {past.length === 0 ? (
        <>
          <SectionHeading text={t("activity.past")} />
          <EmptyRow testID="activity-past-empty" text={t("activity.emptyPast")} />
        </>
      ) : (
        <>
          <PressableScale
            testID="activity-past-toggle"
            onPress={() => setPastExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t("activity.pastToggleA11y")}
            accessibilityState={{ expanded: pastExpanded }}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <View style={{ flex: 1 }}>
              <SectionHeading text={t("activity.pastCount", { count: past.length })} />
            </View>
            {pastExpanded ? (
              <ChevronUp size={18} color={COLORS.mutedBrown} />
            ) : (
              <ChevronDown size={18} color={COLORS.mutedBrown} />
            )}
          </PressableScale>
          {pastExpanded ? (
            <>
              {past.slice(0, 5).map((b) => (
                <PastBookingRow key={b.id} booking={b} />
              ))}
              {/* Past is capped at 5 here; the full history lives on its own screen. */}
              {past.length > 5 ? (
                <PressableScale
                  testID="activity-past-see-all"
                  onPress={() => router.push("/service/past-bookings")}
                  accessibilityRole="button"
                  style={{
                    paddingVertical: SPACING.sm + 2,
                    alignItems: "center",
                    marginBottom: SPACING.md,
                  }}
                >
                  <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>
                    {t("activity.pastSeeAll", { count: past.length })}
                  </Text>
                </PressableScale>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </RefreshableScrollView>
  );
}

// One UPCOMING/PENDING booking row → its detail (openBooking). Shared by the Pending-requests
// and Upcoming sections so both render identically and route the same way. A 'requested' booking
// carries a compact "Pending" badge so it reads as awaiting the provider's confirmation; a
// confirmed booking has none. Pulls router + t itself so it's self-contained.
export function UpcomingBookingRow({ booking }) {
  const router = useRouter();
  const { t } = useTranslation();
  const isPending = booking.booking_status === "requested";
  return (
    <HubRow
      testID={`activity-booking-${booking.id}`}
      Icon={Calendar}
      title={`${booking.provider_name || "Provider"} · ${booking.pet_name || "Pet"}`}
      subtitle={`${booking.service_name || booking.capability || "Booking"} · ${formatDisplayDate(
        booking.appointment_date,
      )}`}
      badge={isPending ? t("activity.pending") : null}
      onPress={() => openBooking(router, booking)}
    />
  );
}

// One PAST booking row → the read-only booking summary. Shared so the My Activity Past
// section and the full /service/past-bookings history render identically (same icon, title,
// subtitle and routing). Pulls router + t itself so it's self-contained.
export function PastBookingRow({ booking }) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <HubRow
      testID={`activity-past-${booking.id}`}
      Icon={Clock}
      title={`${booking.provider_name || "Provider"} · ${booking.pet_name || "Pet"}`}
      subtitle={`${t("activity.past")} · ${formatDisplayDate(booking.appointment_date)}`}
      onPress={() =>
        router.push({
          pathname: "/service/booking-summary",
          params: { id: booking.id },
        })
      }
    />
  );
}

function SectionHeading({ text, testID }) {
  return (
    <Text
      testID={testID}
      style={[
        TYPE.footnote,
        {
          color: COLORS.mutedBrown,
          fontWeight: "800",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginTop: SPACING.md,
          marginBottom: SPACING.sm,
        },
      ]}
    >
      {text}
    </Text>
  );
}

function HubRow({ testID, Icon, title, subtitle, badge, accent, onPress }) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{ marginBottom: SPACING.md }}
    >
      <Card
        level="sm"
        borderColor={accent ? COLORS.coral : COLORS.peach}
        style={{
          padding: SPACING.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
          borderWidth: accent ? 2 : undefined,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: RADIUS.control - 2,
            backgroundColor: accent ? COLORS.coral + "1F" : COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon size={20} color={COLORS.coral} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {badge != null ? (
          <View
            testID={testID ? `${testID}-badge` : undefined}
            style={{
              minWidth: 22,
              height: 22,
              paddingHorizontal: 6,
              borderRadius: 11,
              backgroundColor: COLORS.coral,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={[TYPE.caption, { color: "#fff", fontWeight: "800" }]}>
              {badge}
            </Text>
          </View>
        ) : null}
        <ChevronRight size={18} color={COLORS.peach} />
      </Card>
    </PressableScale>
  );
}

export function EmptyRow({ testID, text }) {
  return (
    <Card
      testID={testID}
      level="none"
      borderColor={COLORS.peach}
      style={{ padding: SPACING.lg, marginBottom: SPACING.md }}
    >
      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500" }]}>
        {text}
      </Text>
    </Card>
  );
}
