import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
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
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 14 }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}
          >
            Dog Walking 🐾
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Book a walker, watch the walk live
          </Text>
        </View>
        {/* Owner ↔ provider Messages inbox (ticket 2.5). */}
        <TouchableOpacity
          onPress={() => router.push("/provider-messages")}
          accessibilityLabel="Messages"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <MessageSquare size={20} color={COLORS.coral} />
        </TouchableOpacity>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      >
        {/* LIVE walk — only when there is an in_progress session for the active pet. */}
        {liveSession ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() =>
              router.push({
                pathname: "/walk-live",
                params: { sessionId: String(liveSession.id) },
              })
            }
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: 22,
              padding: 18,
              marginBottom: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
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
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>
                Walk in progress
              </Text>
              <Text style={{ fontSize: 13, color: "#FFFFFFCC", marginTop: 2 }}>
                {liveSession.walker_name || "Your walker"} is out with{" "}
                {currentPet?.name || "your dog"} — tap to watch live
              </Text>
            </View>
            <ChevronRight size={20} color="#FFF" />
          </TouchableOpacity>
        ) : null}

        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: COLORS.mutedBrown,
            marginBottom: 14,
            letterSpacing: 0.6,
          }}
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
              style={{
                fontSize: 13,
                fontWeight: "800",
                color: COLORS.mutedBrown,
                marginTop: 24,
                marginBottom: 14,
                letterSpacing: 0.6,
              }}
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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 16,
        marginBottom: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        shadowColor: COLORS.terracotta,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
        elevation: 3,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      {provider.logo_url ? (
        <Image
          source={{ uri: provider.logo_url }}
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: COLORS.sand,
          }}
        />
      ) : (
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
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
          style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }}
          numberOfLines={1}
        >
          {provider.name}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
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
            style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}
            numberOfLines={2}
          >
            {provider.bio}
          </Text>
        ) : null}
      </View>

      <ChevronRight size={20} color={COLORS.mutedBrown} />
    </TouchableOpacity>
  );
}

function WalkReportCard({ session, onPress }) {
  const miles = metresToMiles(session.distance_m);
  const mins =
    session.duration_s != null ? Math.round(session.duration_s / 60) : null;
  const date = session.ended_at || session.created_at;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}>
          {session.provider_name || "Walk"}
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.mutedBrown }}>
          {date ? new Date(date).toLocaleDateString() : ""}
        </Text>
      </View>
      <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 6 }}>
        {mins != null ? `${mins} min` : "Walk"}
        {miles != null ? ` · ${miles} mi` : ""}
        {session.potty_pee ? " · 💦" : ""}
        {session.potty_poo ? " · 💩" : ""}
      </Text>
      {session.notes ? (
        <Text
          style={{ fontSize: 13, color: COLORS.warmBrown, marginTop: 6 }}
          numberOfLines={2}
        >
          {session.notes}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function EmptyState({ title, body }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 28,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Footprints size={32} color={COLORS.mutedBrown} />
      <Text
        style={{
          fontSize: 16,
          fontWeight: "800",
          color: COLORS.warmBrown,
          marginTop: 12,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: COLORS.mutedBrown,
          marginTop: 6,
          textAlign: "center",
        }}
      >
        {body}
      </Text>
    </View>
  );
}
