import React, { useCallback, useMemo } from "react";
import { View, Text, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CalendarClock, Check, X, Globe, PawPrint, User } from "lucide-react-native";
import { COLORS, TYPE, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import BusinessHeader from "@/components/Business/BusinessHeader";
import { useActiveProvider } from "@/hooks/useActiveProvider";
import { useProviderBookings, useBookingAction } from "@/hooks/useProviders";
import { bookingActions } from "@/utils/bookingActions";
import {
  toCanonicalDate,
  formatDisplayDate,
  formatDisplayTime,
} from "@/utils/canonicalDateTime";

// Business mode v2 → Bookings tab. An agenda of UPCOMING reservations for the active provider,
// chronological. Reuses the SAME provider-bookings read the web BookingsInbox uses
// (useProviderBookings → GET /api/providers/[id]/bookings). Read-mostly: a still-requested booking
// gets Confirm / Decline (the clean reuse of the existing status update, useBookingAction); every
// other action (reschedule, assign, records) stays on the web dashboard ("Manage on web").
//
// This agenda IS the calendar for MVP — a full month-grid calendar is intentionally deferred.

// Small status chip mirroring the web StatusBadge palette so the two surfaces read alike.
const STATUS_STYLE = {
  requested: { bg: "#FFF1E2", fg: "#B75D32" },
  confirmed: { bg: "#E5F4EC", fg: "#1F7A4D" },
  completed: { bg: "#EAF0F6", fg: "#33587A" },
  declined: { bg: "#FBE6E4", fg: "#B23B30" },
  cancelled: { bg: "#EFEAE6", fg: "#7A6254" },
};

function StatusChip({ status, t }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.requested;
  const label = t(`business.bookings.status.${status}`);
  return (
    <View
      style={{
        backgroundColor: style.bg,
        borderRadius: RADIUS.chip,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text
        accessibilityRole="text"
        style={[TYPE.caption, { color: style.fg, fontWeight: "700", letterSpacing: 0 }]}
      >
        {label}
      </Text>
    </View>
  );
}

function BookingCard({ booking, t, onConfirm, onDecline, acting }) {
  const acts = bookingActions(booking);
  const when = [
    formatDisplayDate(booking.appointment_date),
    booking.appointment_time ? formatDisplayTime(booking.appointment_time) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      testID={`business-booking-${booking.id}`}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: RADIUS.card,
        borderWidth: 1,
        borderColor: COLORS.peach,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, fontWeight: "700" }]}>
          {when}
        </Text>
        <StatusChip status={booking.booking_status} t={t} />
      </View>

      <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: 6 }]} numberOfLines={1}>
        {booking.service_name || booking.title || t("business.bookings.noService")}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.lg, marginTop: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <PawPrint size={14} color={COLORS.mutedBrown} />
          <Text style={[TYPE.subhead, { color: COLORS.warmBrown }]} numberOfLines={1}>
            {booking.pet_name || t("business.bookings.noPet")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}>
          <User size={14} color={COLORS.mutedBrown} />
          <Text style={[TYPE.subhead, { color: COLORS.mutedBrown }]} numberOfLines={1}>
            {booking.owner_name || ""}
          </Text>
        </View>
      </View>

      {/* Confirm / Decline — only for a still-requested booking (clean reuse of the status update). */}
      {acts.canConfirm || acts.canDecline ? (
        <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.md }}>
          {acts.canConfirm ? (
            <PressableScale
              onPress={() => onConfirm(booking)}
              disabled={acting}
              accessibilityRole="button"
              testID={`business-booking-confirm-${booking.id}`}
              style={{
                flex: 1,
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.chip,
                paddingVertical: SPACING.sm,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: acting ? 0.6 : 1,
              }}
            >
              <Check size={16} color="#FFF" />
              <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "700" }]}>
                {t("business.bookings.confirm")}
              </Text>
            </PressableScale>
          ) : null}
          {acts.canDecline ? (
            <PressableScale
              onPress={() => onDecline(booking)}
              disabled={acting}
              accessibilityRole="button"
              testID={`business-booking-decline-${booking.id}`}
              style={{
                flex: 1,
                backgroundColor: COLORS.sand,
                borderRadius: RADIUS.chip,
                paddingVertical: SPACING.sm,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: acting ? 0.6 : 1,
              }}
            >
              <X size={16} color={COLORS.mutedBrown} />
              <Text style={[TYPE.callout, { color: COLORS.warmBrown, fontWeight: "700" }]}>
                {t("business.bookings.decline")}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function BusinessBookings() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id;

  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useProviderBookings(providerId);
  const bookingAction = useBookingAction(providerId);

  // Upcoming + active only (requested/confirmed, date >= today), chronological. Declined/
  // cancelled/completed are hidden from the agenda (the booking-status-clarity convention);
  // deep history stays on the web dashboard.
  const upcoming = useMemo(() => {
    const today = toCanonicalDate(new Date());
    return bookings
      .filter(
        (b) =>
          (b.booking_status === "requested" || b.booking_status === "confirmed") &&
          typeof b.appointment_date === "string" &&
          b.appointment_date >= today,
      )
      .sort((a, b) => {
        const ka = `${a.appointment_date}T${a.appointment_time || "00:00"}`;
        const kb = `${b.appointment_date}T${b.appointment_time || "00:00"}`;
        return ka < kb ? -1 : ka > kb ? 1 : Number(a.id) - Number(b.id);
      });
  }, [bookings]);

  const acting = bookingAction.isPending;

  const runAction = useCallback(
    (appointmentId, action) => {
      bookingAction.mutate(
        { appointmentId, action },
        {
          onError: (err) =>
            Alert.alert(t("business.bookings.actionError"), err?.message),
        },
      );
    },
    [bookingAction, t],
  );

  const onConfirm = useCallback(
    (booking) => runAction(booking.id, "confirm"),
    [runAction],
  );

  const onDecline = useCallback(
    (booking) => {
      Alert.alert(
        t("business.bookings.declineTitle"),
        t("business.bookings.declineBody"),
        [
          { text: t("business.bookings.cancel"), style: "cancel" },
          {
            text: t("business.bookings.decline"),
            style: "destructive",
            onPress: () => runAction(booking.id, "decline"),
          },
        ],
      );
    },
    [runAction, t],
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <BusinessHeader
        businessName={activeProvider?.name || t("business.home.fallbackName")}
        logoUri={activeProvider?.logo_url}
        title={t("business.bookings.title")}
        subtitle={t("business.bookings.subtitle")}
      />

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <View style={{ alignItems: "center", paddingVertical: SPACING.huge }}>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown, marginBottom: SPACING.md }]}>
            {t("business.bookings.loadError")}
          </Text>
          <PressableScale
            onPress={() => refetch()}
            accessibilityRole="button"
            testID="business-bookings-retry"
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.xl,
              paddingVertical: SPACING.sm,
            }}
          >
            <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "700" }]}>
              {t("business.bookings.retry")}
            </Text>
          </PressableScale>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + 90 }}>
          {upcoming.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: SPACING.huge }}>
              <CalendarClock size={40} color={COLORS.mutedBrown} />
              <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.md }]}>
                {t("business.bookings.emptyTitle")}
              </Text>
              <Text
                style={[
                  TYPE.callout,
                  { color: COLORS.mutedBrown, marginTop: SPACING.sm, textAlign: "center" },
                ]}
              >
                {t("business.bookings.emptyBody")}
              </Text>
            </View>
          ) : (
            upcoming.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                t={t}
                acting={acting}
                onConfirm={onConfirm}
                onDecline={onDecline}
              />
            ))
          )}

          {/* Manage-on-web note: reschedule/assign/history + everything else lives on the extranet. */}
          <View
            style={{
              marginTop: SPACING.lg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.sm,
            }}
          >
            <Globe size={16} color={COLORS.sageDark} />
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
              {t("business.bookings.manageOnWeb")}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
