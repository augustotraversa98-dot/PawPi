import React, { useState } from "react";
import { View, Text, ActivityIndicator, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Star,
  ChevronRight,
  Store,
  MapPin,
  Navigation,
  MessageSquare,
  ShieldCheck,
  Check,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useBookingDetail, useStartThread } from "@/hooks/useProviders";
import {
  useCareAccessGrants,
  useCreateCareGrant,
  useUpdateGrant,
} from "@/hooks/useCareAccessGrants";
import WriteReviewModal from "@/components/Providers/WriteReviewModal";
import BookingStatusChip, {
  BOOKING_STATUSES,
} from "@/components/Providers/BookingStatusChip";
import { formatDisplayDate, formatDisplayTime } from "@/utils/canonicalDateTime";
import { deriveOpenNow } from "@/utils/providerHours";

// BOOKING DETAIL (My Activity → a booking, upcoming OR past). Shows WHAT service, WHAT was done
// (notes), status, when, provider, pet, the LOCATION (with directions + message provider), and
// WHAT WAS PAID — or a clean "Not recorded" state, never a fabricated number (real charges are
// parked; a sandbox order never settles). UPCOMING bookings add owner-initiated "Share clinic
// history" (create/revoke a care-access grant). COMPLETED bookings add "Leave a review" (reusing
// the existing WriteReviewModal; the backend re-checks the completed + one-per-booking gate).
// Links out to existing screens; rebuilds no management UI. No Book CTA.

// Mirrors more/hub.jsx money(): minor units → "ARS 100.00".
function money(cents, currency) {
  if (cents == null) return null;
  return `${currency || "ARS"} ${(cents / 100).toFixed(2)}`;
}

export default function BookingSummaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams();

  const { data: booking, isLoading, isError, refetch } = useBookingDetail(id);
  const [showReview, setShowReview] = useState(false);

  const providerId = booking?.provider_id ?? null;
  const petId = booking?.pet_id ?? null;
  const location = booking?.location ?? null;

  // Mirror VetAppointmentDetailModal's review gate exactly: a completed booking with a
  // provider. The backend re-checks; this only decides whether to OFFER the action.
  const canReview = booking?.status === "completed" && providerId != null;
  // Upcoming = not completed. Only upcoming bookings offer the "Share clinic history" action.
  const canShare = booking != null && booking.status !== "completed" && providerId != null && petId != null;

  // Current sharing state for THIS provider + pet (real data; empty until loaded).
  const { data: grants } = useCareAccessGrants(petId);
  const activeGrant = (grants ?? []).find(
    (g) => String(g.provider_id) === String(providerId) && g.status === "active",
  );
  const createGrant = useCreateCareGrant();
  const updateGrant = useUpdateGrant(petId);
  const { mutate: startThread, isPending: startingThread } = useStartThread();

  const paidLabel = booking
    ? money(booking.paid?.amount_cents, booking.paid?.currency)
    : null;

  const when = booking
    ? [formatDisplayDate(booking.appointment_date), formatDisplayTime(booking.appointment_time)]
        .filter(Boolean)
        .join(" · ")
    : "";

  // Open-now from the location's free-form hours (true/false/null — unknown shows nothing).
  const openNow = location?.hours_json ? deriveOpenNow(location.hours_json) : null;

  const openDirections = () => {
    const query =
      location?.lat != null && location?.lng != null
        ? `${location.lat},${location.lng}`
        : location?.address;
    if (!query) return;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    );
  };

  const messageProvider = () => {
    if (startingThread || providerId == null) return;
    startThread(
      { providerId },
      {
        onSuccess: (res) => {
          const thread = res?.thread;
          if (!thread) return;
          router.push({
            pathname: "/provider-chat",
            params: {
              threadId: String(thread.id),
              providerName: booking.provider_name || "Provider",
              ownerUserId: String(thread.owner_user_id),
            },
          });
        },
      },
    );
  };

  const shareRecords = () => {
    if (createGrant.isPending) return;
    createGrant.mutate(
      { petId, providerId },
      {
        onError: (e) =>
          Alert.alert(t("bookingSummary.shareErrorTitle"), e.message),
      },
    );
  };

  const revokeAccess = () => {
    if (!activeGrant || updateGrant.isPending) return;
    Alert.alert(t("bookingSummary.revokeTitle"), t("bookingSummary.revokeBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("bookingSummary.revoke"),
        style: "destructive",
        onPress: () =>
          updateGrant.mutate({ grantId: activeGrant.id, action: "revoke" }),
      },
    ]);
  };

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
        <PressableScale
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          style={{ marginRight: SPACING.md + 2 }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            {t("bookingSummary.title")}
          </Text>
        </View>
      </GlassSurface>

      {isLoading ? (
        <View
          testID="booking-summary-loading"
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError || !booking ? (
        <View
          testID="booking-summary-error"
          style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: SPACING.xl }}
        >
          <Store size={32} color={COLORS.mutedBrown} />
          <Text
            style={[
              TYPE.headline,
              { color: COLORS.warmBrown, fontWeight: "800", marginTop: SPACING.md },
            ]}
          >
            {t("bookingSummary.errorTitle")}
          </Text>
          <Text
            style={[
              TYPE.subhead,
              { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs, textAlign: "center" },
            ]}
          >
            {t("bookingSummary.errorBody")}
          </Text>
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 40 }}
        >
          <Card level="sm" borderColor={COLORS.peach} style={{ padding: SPACING.lg }}>
            <SummaryRow label={t("bookingSummary.service")} value={booking.service_name} />
            <SummaryRow label={t("bookingSummary.whatWasDone")} value={booking.notes} />
            {/* A recognized booking_status renders the styled status chip; a legacy/unknown
                status falls back to its raw lifecycle value so the row is never blank. */}
            <SummaryRow
              label={t("bookingSummary.status")}
              value={booking.booking_status || booking.status}
              valueNode={
                BOOKING_STATUSES.includes(booking.booking_status) ? (
                  <BookingStatusChip
                    status={booking.booking_status}
                    testID="booking-summary-status-chip"
                  />
                ) : undefined
              }
            />
            <SummaryRow label={t("bookingSummary.when")} value={when} />
            <SummaryRow label={t("bookingSummary.provider")} value={booking.provider_name} />
            <SummaryRow label={t("bookingSummary.pet")} value={booking.pet_name} />
            {/* Paid — the settled amount, or a clean empty state (never a fake number). */}
            <SummaryRow
              testID="booking-summary-paid"
              label={t("bookingSummary.paid")}
              value={paidLabel}
              emptyText={t("bookingSummary.notRecorded")}
             
              last
            />
          </Card>

          {/* Location — where it was booked, with directions + message provider. */}
          {location || providerId != null ? (
            <Card
              testID="booking-summary-location"
              level="sm"
              borderColor={COLORS.peach}
              style={{ padding: SPACING.lg, marginTop: SPACING.md }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                <MapPin size={18} color={COLORS.coral} />
                <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800", flex: 1 }]}>
                  {location?.name || booking.provider_name || t("bookingSummary.location")}
                </Text>
                {openNow === true ? (
                  <Text style={[TYPE.caption, { color: "#3FA34D", fontWeight: "800" }]}>
                    {t("discover.openNow")}
                  </Text>
                ) : openNow === false ? (
                  <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "800" }]}>
                    {t("bookingSummary.closedNow")}
                  </Text>
                ) : null}
              </View>
              {location?.address ? (
                <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}>
                  {location.address}
                </Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                {location && (location.address || (location.lat != null && location.lng != null)) ? (
                  <PressableScale
                    testID="booking-summary-directions"
                    onPress={openDirections}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: SPACING.md,
                      borderRadius: RADIUS.control,
                      borderWidth: 1,
                      borderColor: COLORS.peach,
                      backgroundColor: COLORS.card,
                    }}
                  >
                    <Navigation size={16} color={COLORS.coral} />
                    <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>
                      {t("bookingSummary.getDirections")}
                    </Text>
                  </PressableScale>
                ) : null}
                {providerId != null ? (
                  <PressableScale
                    testID="booking-summary-message"
                    onPress={messageProvider}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: SPACING.md,
                      borderRadius: RADIUS.control,
                      borderWidth: 1,
                      borderColor: COLORS.peach,
                      backgroundColor: COLORS.card,
                    }}
                  >
                    {startingThread ? (
                      <ActivityIndicator size="small" color={COLORS.coral} />
                    ) : (
                      <MessageSquare size={16} color={COLORS.coral} />
                    )}
                    <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>
                      {t("bookingSummary.messageProvider")}
                    </Text>
                  </PressableScale>
                ) : null}
              </View>
            </Card>
          ) : null}

          {/* Share clinic history — UPCOMING bookings with a provider only. */}
          {canShare ? (
            <Card
              testID="booking-summary-share"
              level="sm"
              borderColor={activeGrant ? "#3FA34D" : COLORS.peach}
              style={{ padding: SPACING.lg, marginTop: SPACING.md }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                <ShieldCheck size={18} color={COLORS.coral} />
                <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800", flex: 1 }]}>
                  {t("bookingSummary.shareTitle")}
                </Text>
              </View>
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}>
                {t("bookingSummary.shareBody")}
              </Text>

              {activeGrant ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md, marginTop: SPACING.md }}>
                  <View
                    testID="booking-summary-shared"
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}
                  >
                    <Check size={16} color="#3FA34D" />
                    <Text style={[TYPE.subhead, { color: "#3FA34D", fontWeight: "800" }]}>
                      {t("bookingSummary.shared")}
                    </Text>
                  </View>
                  <PressableScale
                    testID="booking-summary-revoke"
                    onPress={revokeAccess}
                    style={{ paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md }}
                  >
                    <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>
                      {t("bookingSummary.revoke")}
                    </Text>
                  </PressableScale>
                </View>
              ) : (
                <PressableScale
                  testID="booking-summary-share-cta"
                  onPress={shareRecords}
                  style={{
                    marginTop: SPACING.md,
                    backgroundColor: COLORS.coral,
                    borderRadius: RADIUS.control,
                    paddingVertical: SPACING.md + 2,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: SPACING.sm,
                  }}
                >
                  {createGrant.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <ShieldCheck size={16} color="#FFF" />
                  )}
                  <Text style={[TYPE.subhead, { color: "#FFF", fontWeight: "800" }]}>
                    {t("bookingSummary.shareRecords")}
                  </Text>
                </PressableScale>
              )}
            </Card>
          ) : null}

          {/* Leave a review — completed booking with a provider only. */}
          {canReview ? (
            <PressableScale
              testID="booking-summary-review"
              onPress={() => setShowReview(true)}
              style={{
                marginTop: SPACING.lg,
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.control,
                paddingVertical: SPACING.lg,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.sm,
              }}
            >
              <Star size={18} color="#FFF" fill="#FFF" />
              <Text style={[TYPE.headline, { fontWeight: "700", color: "#FFF" }]}>
                {t("bookingSummary.leaveReview")}
              </Text>
            </PressableScale>
          ) : null}

          {/* View provider — links out to the storefront. */}
          {booking.provider_slug ? (
            <PressableScale
              testID="booking-summary-view-provider"
              onPress={() =>
                router.push({
                  pathname: "/service/provider",
                  params: { slug: booking.provider_slug },
                })
              }
              style={{
                marginTop: SPACING.md,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                paddingVertical: SPACING.md,
              }}
            >
              <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.coral }]}>
                {t("bookingSummary.viewProvider")}
              </Text>
              <ChevronRight size={16} color={COLORS.coral} />
            </PressableScale>
          ) : null}
        </RefreshableScrollView>
      )}

      {booking ? (
        <WriteReviewModal
          visible={showReview}
          onClose={() => setShowReview(false)}
          providerId={booking.provider_id}
          providerName={booking.provider_name}
          petId={booking.pet_id}
        />
      ) : null}
    </View>
  );
}

function SummaryRow({ label, value, valueNode, emptyText, testID, last }) {
  const shown = value != null && value !== "";
  return (
    <View
      testID={testID}
      style={{
        paddingVertical: SPACING.sm + 2,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: COLORS.cream,
      }}
    >
      <Text
        style={[
          TYPE.caption,
          {
            color: COLORS.mutedBrown,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          },
        ]}
      >
        {label}
      </Text>
      {/* A `valueNode` (e.g. a status chip) renders in place of the plain-text value. */}
      {valueNode != null ? (
        <View style={{ flexDirection: "row", marginTop: 4 }}>{valueNode}</View>
      ) : (
        <Text
          style={[
            TYPE.subhead,
            { color: shown ? COLORS.warmBrown : COLORS.mutedBrown, fontWeight: "600", marginTop: 2 },
          ]}
        >
          {shown ? value : emptyText || "—"}
        </Text>
      )}
    </View>
  );
}
