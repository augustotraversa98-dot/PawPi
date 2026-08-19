import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Footprints,
  ChevronRight,
  MessageSquare,
  MapPin,
  X,
  Clock,
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
import { useDiscoverProviders } from "@/hooks/useProviders";
import { useWalkSessions } from "@/hooks/useProviders";
import {
  useCreateWalkRequest,
  useMyWalkRequests,
  useCancelWalkRequest,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";
import ProviderListControls, {
  useProviderListFilter,
} from "@/components/Providers/ProviderListControls";

// Dog Walking discovery + live (ticket 2.7) — browse PUBLISHED walker providers (real
// data, no mocks) and watch the active pet's LIVE walk / read past reports. Discovery is
// the SHARED /api/providers/discover?type=walker (capability match, ticket 2.1) via the
// SAME useDiscoverProviders hook the vet/grooming screens use — no duplicate discovery
// endpoint. Tapping a card opens the provider's public profile (provider.jsx) by slug,
// carrying capability='walker' so the shared booking modal books a WALK (the generalized
// booking from 2.4 — on-demand = a one-off slot, recurring = a weekly pack walk), not a
// vet visit. The LIVE section polls /api/pets/[id]/walk-sessions so the owner watches the
// route grow in real time, then sees the walk report (distance/route/potty) on finish.
export default function WalkingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const {
    data: providers,
    isLoading,
    isError,
    refetch,
  } = useDiscoverProviders("walker");
  const { t } = useTranslation();
  const { query, setQuery, sort, setSort, filtered } =
    useProviderListFilter(providers);
  const hasProviders = !!providers && providers.length > 0;

  // Live + recent sessions for the active pet. Poll while there is a live walk.
  const { data: sessions } = useWalkSessions(petId, { live: true });
  const liveSession = (sessions ?? []).find((s) => s.status === "in_progress");
  const recent = (sessions ?? []).filter((s) => s.status === "finished");

  // "Request a walk" (ticket C1) — the owner asks a specific walker; a live status strip shows
  // pending requests until the walker accepts (or it expires).
  const createRequest = useCreateWalkRequest();
  const cancelRequest = useCancelWalkRequest();
  const { data: myRequests } = useMyWalkRequests();
  const openRequests = (myRequests ?? []).filter((r) => r.is_live);
  const [requestFor, setRequestFor] = useState(null); // the provider being requested
  const [findingNow, setFindingNow] = useState(false);

  const openProvider = (slug) => {
    router.push({
      pathname: "/service/provider",
      params: { slug, capability: "walker" },
    });
  };

  const submitRequest = async ({ note, shareLocation }) => {
    if (!petId) {
      Alert.alert(
        t("walkRequests.needPetTitle", "Add a pet first"),
        t("walkRequests.needPetBody", "You need a pet on your profile to request a walk."),
      );
      return;
    }
    let pickup_lat = null;
    let pickup_lng = null;
    if (shareLocation) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          pickup_lat = loc.coords.latitude;
          pickup_lng = loc.coords.longitude;
        }
      } catch {
        // proceed without coords
      }
    }
    try {
      await createRequest.mutateAsync({
        pet_id: petId,
        target_provider_id: requestFor.id,
        note: note?.trim() || null,
        when_type: "now",
        pickup_lat,
        pickup_lng,
      });
      setRequestFor(null);
      Alert.alert(
        t("walkRequests.sentTitle", "Request sent"),
        t("walkRequests.sentBody", "We let the walker know. You'll be notified when they accept."),
      );
    } catch (e) {
      Alert.alert(t("walkRequests.errorTitle", "Couldn't send request"), e?.message);
    }
  };

  const handleCancelRequest = async (id) => {
    try {
      await cancelRequest.mutateAsync({ requestId: id });
    } catch (e) {
      Alert.alert(t("walkRequests.errorTitle", "Couldn't send request"), e?.message);
    }
  };

  // "Find a walker now" (ticket C2) — broadcast to nearby available walkers. Needs a real pickup
  // point (the whole feature is location-based), so a denied/unavailable location aborts with a note.
  const findWalkerNow = async () => {
    if (!petId) {
      Alert.alert(
        t("walkRequests.needPetTitle", "Add a pet first"),
        t("walkRequests.needPetBody", "You need a pet on your profile to request a walk."),
      );
      return;
    }
    setFindingNow(true);
    let lat = null;
    let lng = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
    } catch {
      // handled below
    }
    if (lat == null || lng == null) {
      setFindingNow(false);
      Alert.alert(
        t("walkRequests.locationNeededTitle", "Location needed"),
        t("walkRequests.locationNeededBody", "Turn on location so nearby walkers can find you."),
      );
      return;
    }
    try {
      await createRequest.mutateAsync({
        pet_id: petId,
        target_provider_id: null,
        pickup_lat: lat,
        pickup_lng: lng,
        radius_km: 5,
        when_type: "now",
      });
      Alert.alert(
        t("walkRequests.findingTitle", "Looking for a walker"),
        t("walkRequests.findingBody", "We're notifying nearby available walkers. You'll be notified when one accepts."),
      );
    } catch (e) {
      Alert.alert(t("walkRequests.errorTitle", "Couldn't send request"), e?.message);
    } finally {
      setFindingNow(false);
    }
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
        <PressableScale
          onPress={() => router.back()}
          style={{ marginRight: SPACING.md + 2 }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            {t("walking.headerTitle")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("walking.headerSubtitle")}
          </Text>
        </View>
        {/* Owner ↔ provider Messages inbox (ticket 2.5). */}
        <PressableScale
          onPress={() => router.push("/provider-messages")}
          accessibilityLabel={t("walking.messages")}
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
        {/* LIVE walk — only when there is an in_progress session for the active pet. */}
        {liveSession ? (
          <PressableScale
            onPress={() =>
              router.push({
                pathname: "/walk-live",
                params: { sessionId: String(liveSession.id) },
              })
            }
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.card,
              padding: SPACING.lg + 2,
              marginBottom: SPACING.lg + 2,
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.md + 2,
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: "#FFFFFF30",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <MapPin size={22} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
                {t("walking.walkInProgress")}
              </Text>
              <Text style={[TYPE.subhead, { color: "#FFFFFFCC", fontWeight: "500", marginTop: 2 }]}>
                {t("walking.walkerIsOutWith", { walker: liveSession.walker_name || t("walking.yourWalker"), pet: currentPet?.name || t("walking.yourDog") })}
              </Text>
            </View>
            <ChevronRight size={20} color="#FFF" />
          </PressableScale>
        ) : null}

        {/* Pending walk requests (ticket C1) — waiting for a walker to accept. */}
        {openRequests.map((r) => (
          <RequestStatusCard
            key={r.id}
            request={r}
            onCancel={() => handleCancelRequest(r.id)}
            busy={cancelRequest.isPending}
            t={t}
          />
        ))}

        {/* Find a walker now (ticket C2) — broadcast to nearby available walkers. */}
        <PressableScale
          onPress={findWalkerNow}
          disabled={findingNow}
          testID="find-walker-now"
          accessibilityRole="button"
          style={{
            backgroundColor: COLORS.warmBrown,
            borderRadius: RADIUS.card,
            padding: SPACING.lg,
            marginBottom: SPACING.lg + 2,
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.md,
            opacity: findingNow ? 0.6 : 1,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: "#FFFFFF25",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <MapPin size={20} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
              {t("walkRequests.findNow", "Find a walker now")}
            </Text>
            <Text style={[TYPE.footnote, { color: "#FFFFFFCC", marginTop: 1 }]}>
              {t("walkRequests.findNowHint", "Alert available walkers near you")}
            </Text>
          </View>
          <ChevronRight size={20} color="#FFF" />
        </PressableScale>

        <Text
          style={[
            TYPE.subhead,
            { color: COLORS.mutedBrown, fontWeight: "800", marginBottom: SPACING.md + 2, letterSpacing: 0.6 },
          ]}
        >
          {t("walking.walkersNearYou")}
        </Text>

        {hasProviders ? (
          <ProviderListControls
            query={query}
            setQuery={setQuery}
            sort={sort}
            setSort={setSort}
          />
        ) : null}

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <EmptyState
            title={t("walking.couldNotLoadTitle")}
            body={t("walking.couldNotLoadBody")}
          />
        ) : !hasProviders ? (
          <EmptyState
            title={t("walking.emptyTitle")}
            body={t("walking.emptyBody")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t("common.noResults")}
            body={t("providers.noMatchBody", { query: query.trim() })}
          />
        ) : (
          filtered.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onPress={() => openProvider(p.slug)}
              onRequest={() => setRequestFor(p)}
              t={t}
            />
          ))
        )}

        {/* Past walk reports for the active pet (distance/route/potty land in Health too). */}
        {recent.length > 0 ? (
          <>
            <Text
              style={[
                TYPE.subhead,
                {
                  color: COLORS.mutedBrown,
                  fontWeight: "800",
                  marginTop: SPACING.xxl,
                  marginBottom: SPACING.md + 2,
                  letterSpacing: 0.6,
                },
              ]}
            >
              {t("walking.recentWalks")}
            </Text>
            {recent.map((s) => (
              <WalkReportCard
                key={s.id}
                session={s}
                onPress={() =>
                  router.push({
                    pathname: "/walk-live",
                    params: { sessionId: String(s.id) },
                  })
                }
              />
            ))}
          </>
        ) : null}
      </RefreshableScrollView>

      {/* Request a walk (ticket C1) — a small form to ask a specific walker. */}
      <RequestWalkModal
        provider={requestFor}
        petName={currentPet?.name}
        onClose={() => setRequestFor(null)}
        onSubmit={submitRequest}
        busy={createRequest.isPending}
        t={t}
      />
    </View>
  );
}

function metresToMiles(m) {
  if (m == null) return null;
  return Math.round((Number(m) / 1609.34) * 100) / 100;
}

function ProviderCard({ provider, onPress, onRequest, t }) {
  return (
    <View style={{ marginBottom: SPACING.md + 2 }}>
    <PressableScale onPress={onPress}>
      <Card
        level="sm"
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
            style={{
              width: 52,
              height: 52,
              borderRadius: RADIUS.control - 2,
              backgroundColor: COLORS.sand,
            }}
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
            <Footprints size={24} color={COLORS.coral} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text
            style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}
            numberOfLines={1}
          >
            {provider.name}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              marginTop: 2,
            }}
          >
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
      {onRequest ? (
        <PressableScale
          onPress={onRequest}
          testID={`request-walk-${provider.id}`}
          accessibilityRole="button"
          style={{
            marginTop: SPACING.sm,
            backgroundColor: COLORS.coral,
            borderRadius: RADIUS.control,
            paddingVertical: SPACING.md,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACING.sm,
          }}
        >
          <Footprints size={16} color="#FFF" />
          <Text style={[TYPE.subhead, { color: "#FFF", fontWeight: "800" }]}>
            {t ? t("walkRequests.cta", "Request a walk") : "Request a walk"}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function RequestStatusCard({ request, onCancel, busy, t }) {
  return (
    <Card
      level="sm"
      borderColor={COLORS.coral}
      style={{ padding: SPACING.lg, marginBottom: SPACING.md + 2 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Clock size={20} color={COLORS.coral} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}>
            {t("walkRequests.waitingTitle", "Waiting for a walker")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {request.target_provider_name
              ? t("walkRequests.waitingFor", { walker: request.target_provider_name })
              : t("walkRequests.waitingBody", "Your request was sent.")}
          </Text>
        </View>
        <PressableScale
          onPress={onCancel}
          disabled={busy}
          testID={`cancel-request-${request.id}`}
          style={{
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.md,
            borderRadius: RADIUS.chip,
            backgroundColor: COLORS.sand,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Text style={[TYPE.footnote, { color: COLORS.warmBrown, fontWeight: "700" }]}>
            {t("walkRequests.cancel", "Cancel")}
          </Text>
        </PressableScale>
      </View>
    </Card>
  );
}

function RequestWalkModal({ provider, petName, onClose, onSubmit, busy, t }) {
  const [note, setNote] = useState("");
  const [shareLocation, setShareLocation] = useState(true);
  const visible = !!provider;

  // Reset the note whenever a new walker is chosen.
  React.useEffect(() => {
    if (visible) {
      setNote("");
      setShareLocation(true);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000055" }}>
        <View
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: RADIUS.card,
            borderTopRightRadius: RADIUS.card,
            padding: SPACING.xl,
            paddingBottom: SPACING.xxl,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: SPACING.lg,
            }}
          >
            <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
              {t("walkRequests.cta", "Request a walk")}
            </Text>
            <PressableScale onPress={onClose} accessibilityLabel={t("walkRequests.cancel", "Cancel")}>
              <X size={22} color={COLORS.mutedBrown} />
            </PressableScale>
          </View>

          <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, marginBottom: SPACING.lg }]}>
            {t("walkRequests.modalSubtitle", {
              walker: provider?.name ?? "",
              pet: petName ?? "",
            })}
          </Text>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t("walkRequests.notePlaceholder", "Anything the walker should know? (optional)")}
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            testID="request-note-input"
            style={{
              backgroundColor: COLORS.card,
              borderRadius: RADIUS.control,
              borderWidth: 1,
              borderColor: COLORS.peach,
              padding: SPACING.md,
              minHeight: 72,
              color: COLORS.warmBrown,
              textAlignVertical: "top",
              marginBottom: SPACING.lg,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: SPACING.xl,
            }}
          >
            <View style={{ flex: 1, paddingRight: SPACING.md }}>
              <Text style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "700" }]}>
                {t("walkRequests.shareLocation", "Share my pickup location")}
              </Text>
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
                {t("walkRequests.shareLocationHint", "Helps the walker find you.")}
              </Text>
            </View>
            <Switch
              value={shareLocation}
              onValueChange={setShareLocation}
              testID="request-share-location"
            />
          </View>

          <PressableScale
            onPress={() => onSubmit({ note, shareLocation })}
            disabled={busy}
            testID="request-submit"
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.md + 2,
              alignItems: "center",
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
              {busy
                ? t("walkRequests.sending", "Sending…")
                : t("walkRequests.send", "Send request")}
            </Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

function WalkReportCard({ session, onPress }) {
  const { t } = useTranslation();
  const miles = metresToMiles(session.distance_m);
  const mins =
    session.duration_s != null ? Math.round(session.duration_s / 60) : null;
  const date = session.ended_at || session.created_at;
  return (
    <PressableScale onPress={onPress} style={{ marginBottom: SPACING.md }}>
      <Card level="none" radius={RADIUS.control} borderColor={COLORS.peach} style={{ padding: SPACING.lg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}>
            {session.provider_name || t("walking.walk")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
            {date ? new Date(date).toLocaleDateString() : ""}
          </Text>
        </View>
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs + 2 }]}>
          {mins != null ? t("walking.minutes", { count: mins }) : t("walking.walk")}
          {miles != null ? ` · ${miles} mi` : ""}
          {session.potty_pee ? " · 💦" : ""}
          {session.potty_poo ? " · 💩" : ""}
        </Text>
        {session.notes ? (
          <Text
            style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "500", marginTop: SPACING.xs + 2 }]}
            numberOfLines={2}
          >
            {session.notes}
          </Text>
        ) : null}
      </Card>
    </PressableScale>
  );
}

function EmptyState({ title, body }) {
  return (
    <Card
      level="none"
      borderColor={COLORS.peach}
      style={{ padding: SPACING.xxl + SPACING.xs, alignItems: "center" }}
    >
      <Footprints size={32} color={COLORS.mutedBrown} />
      <Text
        style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800", marginTop: SPACING.md }]}
      >
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
