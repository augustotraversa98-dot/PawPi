import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
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
  Search,
  MessageCircle,
} from "lucide-react-native";
import { COLORS, TYPE, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useActiveProvider } from "@/hooks/useActiveProvider";
import {
  useProviderAdoptionApplications,
  useReviewProviderAdoptionApplication,
  useOpenAdoptionApplicantThread,
} from "@/hooks/useProviders";
import { useMyProfileId } from "@/hooks/useUserProfile";
import { formatDisplayDate } from "@/utils/canonicalDateTime";

// Business hub → Adoption applications review (ticket A2, extended by A3). A root-level pushed
// screen (mirrors walker-walks) — NOT a 5th business tab. Lists the active shelter's incoming
// applications and lets any active staff Approve / Decline / Mark under review, reusing the
// EXISTING web routes. A3 adds: a search bar, grouping by dog (declined sink to the bottom of each
// dog group), and a Message action that opens/reuses a chat thread with the applicant.
//
// Approval is atomic + irreversible (server creates the adopter's pet + marks the listing
// adopted), so it sits behind a confirm. A non-approvable app returns 409 → a friendly
// "already decided — pull to refresh" instead of crashing.

// Application status chip palette — reuses the bookings STATUS_STYLE tones so the two hub surfaces
// read alike: open (submitted/pending) → warm; under_review → info/blue; approved → green;
// declined → red.
const STATUS_STYLE = {
  submitted: { bg: "#FFF1E2", fg: "#B75D32" },
  pending: { bg: "#FFF1E2", fg: "#B75D32" },
  under_review: { bg: "#EAF0F6", fg: "#33587A" },
  approved: { bg: "#E5F4EC", fg: "#1F7A4D" },
  declined: { bg: "#FBE6E4", fg: "#B23B30" },
};

// Listing (dog) status pill palette for the group header.
const LISTING_STYLE = {
  available: { bg: "#E5F4EC", fg: "#1F7A4D" },
  pending: { bg: "#FFF1E2", fg: "#B75D32" },
  adopted: { bg: "#EFEAE6", fg: "#7A6254" },
};

const DECIDED = new Set(["approved", "declined"]);

// Sort rank WITHIN a dog group: open first, then approved, then declined LAST (A3).
function rankOf(status) {
  if (status === "declined") return 2;
  if (status === "approved") return 1;
  return 0; // submitted / pending / under_review — still open
}

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

function Pill({ palette, label }) {
  return (
    <View
      style={{
        backgroundColor: palette.bg,
        borderRadius: RADIUS.chip,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text
        accessibilityRole="text"
        style={[TYPE.caption, { color: palette.fg, fontWeight: "700", letterSpacing: 0 }]}
      >
        {label}
      </Text>
    </View>
  );
}

function StatusChip({ status, t }) {
  const palette = STATUS_STYLE[status] ?? STATUS_STYLE.submitted;
  return <Pill palette={palette} label={t(`business.adoption.status.${status}`, { defaultValue: status })} />;
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

function ApplicationCard({ app, t, onApprove, onDecline, onUnderReview, onMessage, acting, messaging }) {
  const decided = DECIDED.has(app.status);
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
        <Text style={[TYPE.headline, { color: COLORS.warmBrown, flex: 1 }]} numberOfLines={1}>
          {app.applicant_name || t("business.adoption.someone")}
        </Text>
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

      {/* Review actions — only for a still-open application (not approved/declined). */}
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

      {/* Message the applicant — available even after a decision, so the shelter can still talk. */}
      <PressableScale
        onPress={() => onMessage(app)}
        disabled={messaging}
        accessibilityRole="button"
        testID={`adoption-message-${app.id}`}
        style={{
          marginTop: SPACING.md,
          borderRadius: RADIUS.chip,
          borderWidth: 1.5,
          borderColor: COLORS.coral,
          paddingVertical: SPACING.sm,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: messaging ? 0.6 : 1,
        }}
      >
        {messaging ? (
          <ActivityIndicator size="small" color={COLORS.coral} />
        ) : (
          <MessageCircle size={16} color={COLORS.coral} />
        )}
        <Text style={[TYPE.callout, { color: COLORS.coral, fontWeight: "700" }]}>
          {t("business.adoption.message")}
        </Text>
      </PressableScale>
    </View>
  );
}

// One dog group: a header (dog name + breed + listing status + application count) then its
// application cards (already ranked open → approved → declined).
function DogGroup({ section, t, ...cardProps }) {
  const listingPalette = LISTING_STYLE[section.listingStatus] ?? null;
  const dogTitle =
    [section.listingName, section.listingBreed].filter(Boolean).join(" · ") ||
    t("business.adoption.aDog");
  return (
    <View testID={`adoption-group-${section.key}`} style={{ marginBottom: SPACING.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <PawPrint size={16} color={COLORS.coral} />
        <Text style={[TYPE.headline, { color: COLORS.warmBrown, flex: 1 }]} numberOfLines={1}>
          {dogTitle}
        </Text>
        {listingPalette ? (
          <Pill
            palette={listingPalette}
            label={t(`business.adoption.listingStatus.${section.listingStatus}`, {
              defaultValue: section.listingStatus,
            })}
          />
        ) : null}
      </View>
      <Text style={[TYPE.caption, { color: COLORS.mutedBrown, marginBottom: SPACING.sm }]}>
        {t("business.adoption.applicationsCount", { count: section.count })}
      </Text>
      {section.apps.map((app) => (
        <ApplicationCard key={app.id} app={app} t={t} {...cardProps} />
      ))}
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
  const openThread = useOpenAdoptionApplicantThread(providerId);
  const { data: myProfileId } = useMyProfileId();
  const acting = review.isPending;

  // Debounced client-side search over the already-fetched list.
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(id);
  }, [query]);

  // Group by dog: filter by search, bucket by listing_id, rank each bucket (declined last), then
  // order sections by open-application count desc, then most-recent activity desc.
  const groups = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const matches = (app) => {
      if (!q) return true;
      const hay = [
        app.applicant_name,
        app.listing_name,
        app.listing_breed,
        ...answerRows(app.answers).flatMap(([question, answer]) => [question, answer]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };

    const byListing = new Map();
    for (const app of applications) {
      if (!matches(app)) continue;
      const key = app.listing_id ?? "none";
      if (!byListing.has(key)) byListing.set(key, []);
      byListing.get(key).push(app);
    }

    const sections = [...byListing.entries()].map(([key, apps]) => {
      const sortedApps = [...apps].sort((a, b) => {
        const r = rankOf(a.status) - rankOf(b.status);
        if (r !== 0) return r;
        const ka = String(a.created_at || "");
        const kb = String(b.created_at || "");
        return ka < kb ? 1 : ka > kb ? -1 : Number(b.id) - Number(a.id);
      });
      const openCount = apps.filter((a) => rankOf(a.status) === 0).length;
      const lastActivity = apps.reduce(
        (m, a) => (String(a.created_at || "") > m ? String(a.created_at || "") : m),
        "",
      );
      const head = apps[0];
      return {
        key: String(key),
        listingName: head.listing_name,
        listingBreed: head.listing_breed,
        listingStatus: head.listing_status,
        count: apps.length,
        openCount,
        lastActivity,
        apps: sortedApps,
      };
    });

    sections.sort((a, b) => {
      if (b.openCount !== a.openCount) return b.openCount - a.openCount;
      return a.lastActivity < b.lastActivity ? 1 : a.lastActivity > b.lastActivity ? -1 : 0;
    });
    return sections;
  }, [applications, debounced]);

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
          { text: t("business.adoption.approve"), onPress: () => runReview(app.id, "approved") },
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

  const onUnderReview = useCallback((app) => runReview(app.id, "under_review"), [runReview]);

  // Open (or reuse) a thread with the applicant, then hand off to the shared provider-chat.
  // Idempotent server-side, so a double-tap is safe; guard the UI too via messagingId.
  const [messagingId, setMessagingId] = useState(null);
  const onMessage = useCallback(
    async (app) => {
      if (messagingId != null) return;
      setMessagingId(app.id);
      try {
        const res = await openThread.mutateAsync({ applicationId: app.id });
        const thread = res?.thread;
        if (!thread?.id) throw new Error("No thread");
        router.push({
          pathname: "/provider-chat",
          params: {
            threadId: String(thread.id),
            title: app.applicant_name || t("business.adoption.someone"),
            meUserId: myProfileId != null ? String(myProfileId) : "",
            ownerUserId:
              app.applicant_owner_user_id != null ? String(app.applicant_owner_user_id) : "",
          },
        });
      } catch (e) {
        Alert.alert(t("business.adoption.messageError"), e?.message);
      } finally {
        setMessagingId(null);
      }
    },
    [openThread, myProfileId, router, t, messagingId],
  );

  const cardProps = { acting, onApprove, onDecline, onUnderReview, onMessage };

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
        <>
          {/* Search — only when there is something to search. */}
          {applications.length > 0 ? (
            <View style={{ paddingHorizontal: SPACING.xl, paddingTop: SPACING.md }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: COLORS.sand,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Search size={18} color={COLORS.mutedBrown} />
                <TextInput
                  testID="adoption-search"
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t("business.adoption.searchPlaceholder")}
                  placeholderTextColor={COLORS.mutedBrown}
                  style={{ flex: 1, fontSize: 15, color: COLORS.warmBrown }}
                />
              </View>
            </View>
          ) : null}

          <RefreshableScrollView
            refetch={refetch}
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + 90 }}
          >
            {applications.length === 0 ? (
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
            ) : groups.length === 0 ? (
              <View testID="adoption-no-matches" style={{ alignItems: "center", paddingVertical: SPACING.huge }}>
                <Search size={40} color={COLORS.mutedBrown} />
                <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.md }]}>
                  {t("business.adoption.noMatchesTitle")}
                </Text>
                <Text
                  style={[
                    TYPE.callout,
                    { color: COLORS.mutedBrown, marginTop: SPACING.sm, textAlign: "center" },
                  ]}
                >
                  {t("business.adoption.noMatchesBody")}
                </Text>
              </View>
            ) : (
              groups.map((section) => (
                <DogGroup
                  key={section.key}
                  section={section}
                  t={t}
                  messaging={messagingId != null}
                  {...cardProps}
                />
              ))
            )}
          </RefreshableScrollView>
        </>
      )}
    </View>
  );
}
