import React from "react";
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
  Footprints,
  ChevronRight,
  MessageSquare,
  MapPin,
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
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";

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

  // Live + recent sessions for the active pet. Poll while there is a live walk.
  const { data: sessions } = useWalkSessions(petId, { live: true });
  const liveSession = (sessions ?? []).find((s) => s.status === "in_progress");
  const recent = (sessions ?? []).filter((s) => s.status === "finished");

  const openProvider = (slug) => {
    router.push({
      pathname: "/service/provider",
      params: { slug, capability: "walker" },
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
        <PressableScale
          onPress={() => router.back()}
          style={{ marginRight: SPACING.md + 2 }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            Dog Walking 🐾
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            Book a walker, watch the walk live
          </Text>
        </View>
        {/* Owner ↔ provider Messages inbox (ticket 2.5). */}
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
                Walk in progress
              </Text>
              <Text style={[TYPE.subhead, { color: "#FFFFFFCC", fontWeight: "500", marginTop: 2 }]}>
                {liveSession.walker_name || "Your walker"} is out with{" "}
                {currentPet?.name || "your dog"} — tap to watch live
              </Text>
            </View>
            <ChevronRight size={20} color="#FFF" />
          </PressableScale>
        ) : null}

        <Text
          style={[
            TYPE.subhead,
            { color: COLORS.mutedBrown, fontWeight: "800", marginBottom: SPACING.md + 2, letterSpacing: 0.6 },
          ]}
        >
          WALKERS NEAR YOU
        </Text>

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn't load walkers"
            body="Something went wrong. Pull down to try again."
          />
        ) : !providers || providers.length === 0 ? (
          <EmptyState
            title="No walkers available yet"
            body="Check back soon — walkers are joining PawPi."
          />
        ) : (
          providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onPress={() => openProvider(p.slug)}
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
              RECENT WALKS
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
    </View>
  );
}

function metresToMiles(m) {
  if (m == null) return null;
  return Math.round((Number(m) / 1609.34) * 100) / 100;
}

function ProviderCard({ provider, onPress }) {
  return (
    <PressableScale onPress={onPress} style={{ marginBottom: SPACING.md + 2 }}>
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
  );
}

function WalkReportCard({ session, onPress }) {
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
            {session.provider_name || "Walk"}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
            {date ? new Date(date).toLocaleDateString() : ""}
          </Text>
        </View>
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs + 2 }]}>
          {mins != null ? `${mins} min` : "Walk"}
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
