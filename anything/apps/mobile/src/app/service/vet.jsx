import React from "react";
import { View, Text, Image, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Stethoscope,
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
import { useDiscoverProviders } from "@/hooks/useProviders";
import RatingBadge from "@/components/Providers/RatingBadge";

// Veterinary discovery — browse PUBLISHED vet providers (real data, no mocks).
// Tapping a card opens the provider's public profile (provider.jsx) by slug.
export default function VetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: providers, isLoading, isError, refetch } =
    useDiscoverProviders("vet");

  const openProvider = (slug) => {
    router.push({ pathname: "/service/provider", params: { slug } });
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
            Veterinary 🏥
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            Find and book a vet
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
        <Text
          style={[
            TYPE.subhead,
            { color: COLORS.mutedBrown, fontWeight: "800", marginBottom: SPACING.md + 2, letterSpacing: 0.6 },
          ]}
        >
          VETS NEAR YOU
        </Text>

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn't load vets"
            body="Something went wrong. Pull down to try again."
          />
        ) : !providers || providers.length === 0 ? (
          <EmptyState
            title="No vets available yet"
            body="Check back soon — vet clinics are joining PawPi."
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
            <Stethoscope size={24} color={COLORS.coral} />
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
            {provider.provider_type ? (
              <Text
                style={[
                  TYPE.footnote,
                  { fontWeight: "700", color: COLORS.coral, textTransform: "capitalize" },
                ]}
              >
                {provider.provider_type}
              </Text>
            ) : null}
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

function EmptyState({ title, body }) {
  return (
    <Card
      level="none"
      borderColor={COLORS.peach}
      style={{ padding: SPACING.xxl + SPACING.xs, alignItems: "center" }}
    >
      <Stethoscope size={32} color={COLORS.mutedBrown} />
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
