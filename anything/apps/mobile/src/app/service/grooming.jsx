import React from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Scissors,
  ChevronRight,
  MessageSquare,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useDiscoverProviders } from "@/hooks/useProviders";
import RatingBadge from "@/components/Providers/RatingBadge";

// Grooming discovery (ticket 2.6) — browse PUBLISHED groomer providers (real data, no
// mocks). Discovery is the SHARED /api/providers/discover?type=groomer (capability
// match, ticket 2.1) via the SAME useDiscoverProviders hook the vet screen uses — no
// duplicate discovery endpoint. Tapping a card opens the provider's public profile
// (provider.jsx) by slug, carrying capability='groomer' so the shared booking modal
// books a GROOM (the generalized booking from 2.4), not a vet visit.
export default function GroomingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: providers, isLoading, isError, refetch } =
    useDiscoverProviders("groomer");

  const openProvider = (slug) => {
    router.push({
      pathname: "/service/provider",
      params: { slug, capability: "groomer" },
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
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>
            Grooming ✂️
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Find and book a groomer
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
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: COLORS.mutedBrown,
            marginBottom: 14,
            letterSpacing: 0.6,
          }}
        >
          GROOMERS NEAR YOU
        </Text>

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn't load groomers"
            body="Something went wrong. Pull down to try again."
          />
        ) : !providers || providers.length === 0 ? (
          <EmptyState
            title="No groomers available yet"
            body="Check back soon — groomers are joining PawPi."
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
      </RefreshableScrollView>
    </View>
  );
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
          style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.sand }}
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
          <Scissors size={24} color={COLORS.coral} />
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
      <Scissors size={32} color={COLORS.mutedBrown} />
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
