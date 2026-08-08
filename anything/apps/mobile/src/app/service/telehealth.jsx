import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Video,
  ChevronRight,
  MessageSquare,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import {
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useDiscoverProviders,
  useTelehealthSessions,
  useJoinTelehealth,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";
import { isTelehealthJoinTooEarly } from "@/utils/telehealthJoinGate";
import { formatDisplayDate, formatDisplayTime } from "@/utils/canonicalDateTime";
import { useTranslation } from "react-i18next";

// Telehealth discovery + consults (ticket 2.18). A consult IS a normal booking — tapping a
// vet opens the shared provider profile carrying capability='telehealth' (the generalized
// booking from 2.4 + payment from 2.3). The telehealth-specific surfaces are "My consults"
// (the owner's video sessions) and JOIN. Discovery reuses /api/providers/discover?type=
// telehealth via the SAME useDiscoverProviders hook — no duplicate endpoint, no fake data.
export default function TelehealthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: providers, isLoading, isError, refetch } =
    useDiscoverProviders("telehealth");

  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;
  const { data: consults = [] } = useTelehealthSessions(petId);
  // Active consults (scheduled/in_progress) first, closed ones (ended/cancelled) after — the sort
  // is stable, so within each group the endpoint's newest-first order is preserved.
  const isClosedConsult = (c) => c.status === "ended" || c.status === "cancelled";
  const sortedConsults = [...consults].sort(
    (a, b) => Number(isClosedConsult(a)) - Number(isClosedConsult(b)),
  );

  const openProvider = (slug) => {
    router.push({
      pathname: "/service/provider",
      params: { slug, capability: "telehealth" },
    });
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
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            Telehealth 📹
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            Video consult with a vet
          </Text>
        </View>
        <PressableScale
          onPress={() => router.push("/provider-messages")}
          accessibilityLabel="Messages"
          style={{
            width: 40,
            height: 40,
            borderRadius: RADIUS.chip,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <MessageSquare size={20} color={COLORS.coral} />
        </PressableScale>
      </GlassSurface>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
      >
        {/* My consults — only shown when the current pet has any. */}
        {consults.length > 0 && (
          <View style={{ marginBottom: SPACING.sm }}>
            <SectionLabel>MY CONSULTS</SectionLabel>
            {sortedConsults.map((c) => (
              <ConsultCard key={c.id} consult={c} petId={petId} />
            ))}
          </View>
        )}

        <SectionLabel>TELEHEALTH VETS</SectionLabel>

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn't load telehealth vets"
            body="Something went wrong. Pull down to try again."
          />
        ) : !providers || providers.length === 0 ? (
          <EmptyState
            title="No telehealth vets yet"
            body="Check back soon — vets are joining PawPi."
          />
        ) : (
          providers.map((p) => (
            <ProviderCard key={p.id} provider={p} onPress={() => openProvider(p.slug)} />
          ))
        )}
      </RefreshableScrollView>
    </View>
  );
}

// One consult row with a JOIN button whose state follows the session status + the dormant
// video vendor (a clean message instead of a crash when video isn't configured).
function ConsultCard({ consult, petId }) {
  const router = useRouter();
  const { t } = useTranslation();
  const joinTelehealth = useJoinTelehealth();
  const [error, setError] = useState(null);
  const [notReadyMessage, setNotReadyMessage] = useState(null);

  // Localized "not time yet" copy: names the appointment date + time when we have them (the
  // booking-linked case), else the vet-starts-the-call fallback (an unlinked ad-hoc session).
  const joinWaitMessage = () => {
    const date = formatDisplayDate(consult.appointment_date);
    const time = formatDisplayTime(consult.appointment_time);
    return date && time
      ? t("telehealth.availableAt", { date, time })
      : t("telehealth.availableWhenVetStarts");
  };

  const joinable = consult.status === "scheduled" || consult.status === "in_progress";
  // Client-side pre-check (telehealthJoinGate.js) — only blocks when we can be SURE it's too
  // early; unparseable data falls through to the API call, and the server's 425 is the real
  // gate (see the notReady branch below).
  const tooEarly =
    joinable && isTelehealthJoinTooEarly(consult, { sessionStatus: consult.status });

  const onJoin = async () => {
    setError(null);
    setNotReadyMessage(null);
    try {
      const res = await joinTelehealth.mutateAsync({
        providerId: consult.provider_id,
        sessionId: consult.id,
        petId,
      });
      if (res?.joinUrl) {
        router.push({
          pathname: "/service/telehealth-call",
          params: { joinUrl: res.joinUrl },
        });
      }
    } catch (e) {
      if (e?.notReady) {
        // The server is the source of truth (clock skew, etc.) — same friendly copy as the
        // pre-check so the message is consistent either way.
        setNotReadyMessage(joinWaitMessage());
      } else {
        // Clean message (e.g. "Video consults aren't set up yet") — never a crash.
        setError(e?.message || "Couldn't join the consult");
      }
    }
  };

  // Distinct, localized label per session status — a cancelled consult reads "Cancelled", never
  // "Consult ended". Unknown/missing status falls back to Scheduled.
  const statusKey =
    {
      scheduled: "telehealth.statusScheduled",
      in_progress: "telehealth.statusInProgress",
      ended: "telehealth.statusEnded",
      cancelled: "telehealth.statusCancelled",
    }[consult.status] ?? "telehealth.statusScheduled";
  const statusLabel = t(statusKey);
  // Closed consults (ended/cancelled) are muted so active ones read first.
  const closed = consult.status === "ended" || consult.status === "cancelled";

  return (
    <Card
      level="none"
      radius={RADIUS.control}
      borderColor={COLORS.peach}
      style={{ padding: SPACING.lg, marginBottom: SPACING.md, opacity: closed ? 0.6 : 1 }}
    >
      <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}>
        {consult.provider_name || "Video consult"}
      </Text>
      <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
        {statusLabel}
      </Text>

      {joinable && tooEarly ? (
        <View
          style={{
            marginTop: SPACING.md,
            backgroundColor: COLORS.sand,
            borderRadius: RADIUS.control - 2,
            padding: SPACING.md,
          }}
        >
          <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "600" }]}>
            {joinWaitMessage()}
          </Text>
        </View>
      ) : joinable ? (
        <PressableScale
          onPress={onJoin}
          disabled={joinTelehealth.isPending}
          accessibilityRole="button"
          style={{
            marginTop: SPACING.md,
            backgroundColor: COLORS.coral,
            borderRadius: RADIUS.control - 2,
            paddingVertical: SPACING.md,
            alignItems: "center",
            opacity: joinTelehealth.isPending ? 0.7 : 1,
          }}
        >
          <Text style={[TYPE.body, { fontWeight: "800", color: "#FFF" }]}>
            {joinTelehealth.isPending ? "Joining…" : "Join video consult"}
          </Text>
        </PressableScale>
      ) : null}

      {notReadyMessage ? (
        <Text style={[TYPE.subhead, { marginTop: SPACING.sm + 2, color: COLORS.mutedBrown }]}>
          {notReadyMessage}
        </Text>
      ) : null}

      {error ? (
        <Text style={[TYPE.subhead, { marginTop: SPACING.sm + 2, color: "#B23B30" }]}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

function ProviderCard({ provider, onPress }) {
  return (
    <PressableScale onPress={onPress} style={{ marginBottom: SPACING.md + 2 }}>
      <Card
        level="none"
        borderColor={COLORS.peach}
        style={{
          padding: SPACING.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md + 2,
        }}
      >
        {provider.logo_url ? (
          <Image
            source={{ uri: provider.logo_url }}
            style={{ width: 52, height: 52, borderRadius: RADIUS.control - 2, backgroundColor: COLORS.sand }}
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: RADIUS.control - 2,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Video size={24} color={COLORS.coral} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text
            style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}
            numberOfLines={1}
          >
            {provider.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: 2 }}>
            <RatingBadge
              avgRating={provider.avg_rating}
              reviewCount={provider.review_count}
            />
          </View>
          {provider.bio ? (
            <Text
              style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}
              numberOfLines={2}
            >
              {provider.bio}
            </Text>
          ) : null}
        </View>

        <ChevronRight size={20} color={COLORS.mutedBrown} />
      </Card>
    </PressableScale>
  );
}

function SectionLabel({ children }) {
  return (
    <Text
      style={[
        TYPE.subhead,
        { color: COLORS.mutedBrown, fontWeight: "800", marginBottom: SPACING.md + 2, letterSpacing: 0.6 },
      ]}
    >
      {children}
    </Text>
  );
}

function EmptyState({ title, body }) {
  return (
    <Card
      level="none"
      borderColor={COLORS.peach}
      style={{ padding: SPACING.xxl + SPACING.xs, alignItems: "center" }}
    >
      <Video size={32} color={COLORS.mutedBrown} />
      <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800", marginTop: SPACING.md }]}>
        {title}
      </Text>
      <Text
        style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs + 2, textAlign: "center" }]}
      >
        {body}
      </Text>
    </Card>
  );
}
