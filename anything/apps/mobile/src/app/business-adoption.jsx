import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  PawPrint,
  Check,
  X,
  Eye,
  Mail,
  Phone,
} from "lucide-react-native";
import { COLORS, TYPE, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useActiveProvider } from "@/hooks/useActiveProvider";
import {
  useProviderAdoptionApplications,
  useReviewProviderAdoptionApplication,
} from "@/hooks/useProviders";
import { formatDisplayDate } from "@/utils/canonicalDateTime";

// Business hub → Adoption applications review (ticket A2). A root-level pushed screen (mirrors
// walker-walks) — NOT a 5th business tab. Lists the active shelter's incoming applications and
// lets any active staff Approve / Decline / Mark under review, reusing the EXISTING web routes
// (GET .../adoption-applications + PATCH .../[applicationId]). Managing the adoptable dogs/listings
// (create/edit/media/questions) stays on the web dashboard — same split Bookings uses.
//
// Approval is atomic + irreversible (server creates the adopter's pet + marks the listing
// adopted), so it sits behind a confirm. A non-approvable app returns 409 → we surface a friendly
// "already decided — pull to refresh" instead of crashing.

// Status chip palette — reuses the bookings STATUS_STYLE tones so the two hub surfaces read alike:
// open (submitted/pending) → warm; under_review → info/blue; approved → green; declined → red.
const STATUS_STYLE = {
  submitted: { bg: "#FFF1E2", fg: "#B75D32" },
  pending: { bg: "#FFF1E2", fg: "#B75D32" },
  under_review: { bg: "#EAF0F6", fg: "#33587A" },
  approved: { bg: "#E5F4EC", fg: "#1F7A4D" },
  declined: { bg: "#FBE6E4", fg: "#B23B30" },
};

const DECIDED = new Set(["approved", "declined"]);

// Normalize the application's answers into [question, answer] rows. v2 stores a self-describing
// array of { question, answer }; legacy rows stored a flat object. Mirrors the web AnswerLines.
function answerRows(answers) {
  let rows = [];
  if (Array.isArray(answers)) {
    rows = answers
      .filter((a) => a && (a.question || a.answer))
      .map((a) => [a.question || "", a.answer]);
  } else if (answers && typeof answers === "object") {
    rows = Object.entries(answers);
  }
  return rows.filter(([, v]) => v != null && String(v).trim() !== "");
}

// The phone channel rides in the answers as the recommended "Best contact number" question
// (there's no phone column on the applicant's profile). A question mentioning a contact number /
// phone is the phone channel.
const PHONE_Q = /contact number|phone|tel[eé]fono|celular/i;

function StatusChip({ status, t }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.submitted;
  const label = t(`business.adoption.status.${status}`, { defaultValue: status });
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

// A tappable email / phone contact row.
function ContactRow({ icon, value, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}
    >
      {icon}
      <Text style={[TYPE.subhead, { color: COLORS.coral }]} numberOfLines={1}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

function ApplicationCard({ app, t, onApprove, onDecline, onUnderReview, acting }) {
  const decided = DECIDED.has(app.status);
  const dog = [app.listing_name, app.listing_breed].filter(Boolean).join(" · ");
  const allRows = answerRows(app.answers);
  const email = app.applicant_email;
  // Promote the "Best contact number" answer to a tappable phone contact; drop it from the Q&A
  // list below so it isn't shown twice.
  const phoneRow = allRows.find(([q]) => PHONE_Q.test(String(q)));
  const phone = phoneRow ? String(phoneRow[1]).trim() : null;
  const rows = phoneRow ? allRows.filter((r) => r !== phoneRow) : allRows;

  return (
    <View
      testID={`adoption-app-${app.id}`}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: RADIUS.card,
        borderWidth: 1,
        borderColor: COLORS.peach,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACING.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]} numberOfLines={1}>
            {app.applicant_name || t("business.adoption.someone")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]} numberOfLines={1}>
            {t("business.adoption.forDog")}: {dog || t("business.adoption.aDog")}
          </Text>
        </View>
        <StatusChip status={app.status} t={t} />
      </View>

      {app.created_at ? (
        <Text style={[TYPE.caption, { color: COLORS.mutedBrown, marginTop: 4 }]}>
          {t("business.adoption.submitted")}: {formatDisplayDate(app.created_at)}
        </Text>
      ) : null}

      {/* Contact — email + the phone that rides in the answers. */}
      {email ? (
        <ContactRow
          icon={<Mail size={14} color={COLORS.coral} />}
          value={email}
          onPress={() => Linking.openURL(`mailto:${email}`)}
        />
      ) : null}
      {phone ? (
        <ContactRow
          icon={<Phone size={14} color={COLORS.coral} />}
          value={phone}
          onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`)}
        />
      ) : null}

      {/* Answers (Q&A) */}
      {rows.length > 0 ? (
        <View style={{ marginTop: SPACING.md, gap: 6 }}>
          {rows.map(([q, v], i) => (
            <View key={i}>
              {q ? (
                <Text style={[TYPE.caption, { color: COLORS.warmBrown, fontWeight: "700" }]}>
                  {q}
                </Text>
              ) : null}
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown }]}>{String(v)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Actions — only for a still-open application (not approved/declined). */}
      {!decided ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.md }}>
          <PressableScale
            onPress={() => onApprove(app)}
            disabled={acting}
            accessibilityRole="button"
            testID={`adoption-approve-${app.id}`}
            style={{
              flexGrow: 1,
              backgroundColor: "#1F7A4D",
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
              {t("business.adoption.approve")}
            </Text>
          </PressableScale>
          <PressableScale
            onPress={() => onDecline(app)}
            disabled={acting}
            accessibilityRole="button"
            testID={`adoption-decline-${app.id}`}
            style={{
              flexGrow: 1,
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
              {t("business.adoption.decline")}
            </Text>
          </PressableScale>
          {app.status !== "under_review" ? (
            <PressableScale
              onPress={() => onUnderReview(app)}
              disabled={acting}
              accessibilityRole="button"
              testID={`adoption-under-review-${app.id}`}
              style={{
                flexGrow: 1,
                borderRadius: RADIUS.chip,
                borderWidth: 1.5,
                borderColor: COLORS.peach,
                paddingVertical: SPACING.sm,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: acting ? 0.6 : 1,
              }}
            >
              <Eye size={16} color={COLORS.warmBrown} />
              <Text style={[TYPE.callout, { color: COLORS.warmBrown, fontWeight: "700" }]}>
                {t("business.adoption.underReview")}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function BusinessAdoptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id;
  const hasAdoption = (activeProvider?.capabilities ?? []).includes("adoption");

  const {
    data: applications = [],
    isLoading,
    isError,
    refetch,
  } = useProviderAdoptionApplications(providerId, { enabled: hasAdoption });
  const review = useReviewProviderAdoptionApplication(providerId);
  const acting = review.isPending;

  // Newest first (the GET already orders created_at DESC, but sort defensively).
  const sorted = useMemo(
    () =>
      [...applications].sort((a, b) => {
        const ka = String(a.created_at || "");
        const kb = String(b.created_at || "");
        return ka < kb ? 1 : ka > kb ? -1 : Number(b.id) - Number(a.id);
      }),
    [applications],
  );

  const runReview = useCallback(
    (applicationId, status) => {
      review.mutate(
        { applicationId, status },
        {
          onError: (err) => {
            const already = err?.status === 409;
            Alert.alert(
              already
                ? t("business.adoption.alreadyDecidedTitle")
                : t("business.adoption.actionError"),
              already ? t("business.adoption.alreadyDecidedBody") : err?.message,
            );
          },
        },
      );
    },
    [review, t],
  );

  const onApprove = useCallback(
    (app) => {
      Alert.alert(
        t("business.adoption.approveConfirmTitle"),
        t("business.adoption.approveConfirmBody"),
        [
          { text: t("business.adoption.cancel"), style: "cancel" },
          {
            text: t("business.adoption.approve"),
            onPress: () => runReview(app.id, "approved"),
          },
        ],
      );
    },
    [runReview, t],
  );

  const onDecline = useCallback(
    (app) => {
      Alert.alert(
        t("business.adoption.declineConfirmTitle"),
        t("business.adoption.declineConfirmBody"),
        [
          { text: t("business.adoption.cancel"), style: "cancel" },
          {
            text: t("business.adoption.decline"),
            style: "destructive",
            onPress: () => runReview(app.id, "declined"),
          },
        ],
      );
    },
    [runReview, t],
  );

  const onUnderReview = useCallback(
    (app) => runReview(app.id, "under_review"),
    [runReview],
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header with back affordance (mirrors walker-walks). */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("business.adoption.back")}
          testID="adoption-back"
          style={{ marginRight: SPACING.md }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
            {t("business.adoption.title")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]} numberOfLines={1}>
            {activeProvider?.name || t("business.home.fallbackName")}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <View style={{ alignItems: "center", paddingVertical: SPACING.huge, paddingHorizontal: SPACING.xl }}>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown, marginBottom: SPACING.md }]}>
            {t("business.adoption.loadError")}
          </Text>
          <PressableScale
            onPress={() => refetch()}
            accessibilityRole="button"
            testID="adoption-retry"
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.xl,
              paddingVertical: SPACING.sm,
            }}
          >
            <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "700" }]}>
              {t("business.adoption.retry")}
            </Text>
          </PressableScale>
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + 90 }}
        >
          {sorted.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: SPACING.huge }}>
              <PawPrint size={40} color={COLORS.mutedBrown} />
              <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.md }]}>
                {t("business.adoption.emptyTitle")}
              </Text>
              <Text
                style={[
                  TYPE.callout,
                  { color: COLORS.mutedBrown, marginTop: SPACING.sm, textAlign: "center" },
                ]}
              >
                {t("business.adoption.emptyBody")}
              </Text>
            </View>
          ) : (
            sorted.map((app) => (
              <ApplicationCard
                key={app.id}
                app={app}
                t={t}
                acting={acting}
                onApprove={onApprove}
                onDecline={onDecline}
                onUnderReview={onUnderReview}
              />
            ))
          )}
        </RefreshableScrollView>
      )}
    </View>
  );
}
