import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Linking,
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
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useDiscoverProviders,
  useTelehealthSessions,
  useJoinTelehealth,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";

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

  const openProvider = (slug) => {
    router.push({
      pathname: "/service/provider",
      params: { slug, capability: "telehealth" },
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
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>
            Telehealth 📹
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Video consult with a vet
          </Text>
        </View>
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
        {/* My consults — only shown when the current pet has any. */}
        {consults.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <SectionLabel>MY CONSULTS</SectionLabel>
            {consults.map((c) => (
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
  const joinTelehealth = useJoinTelehealth();
  const [error, setError] = useState(null);

  const joinable = consult.status === "scheduled" || consult.status === "in_progress";

  const onJoin = async () => {
    setError(null);
    try {
      const res = await joinTelehealth.mutateAsync({
        providerId: consult.provider_id,
        sessionId: consult.id,
        petId,
      });
      if (res?.joinUrl) {
        Linking.openURL(res.joinUrl);
      }
    } catch (e) {
      // Clean message (e.g. "Video consults aren't set up yet") — never a crash.
      setError(e?.message || "Couldn't join the consult");
    }
  };

  const statusLabel =
    consult.status === "ended"
      ? "Consult ended"
      : consult.status === "cancelled"
        ? "Cancelled"
        : consult.status === "in_progress"
          ? "In progress"
          : "Scheduled";

  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>
        {consult.provider_name || "Video consult"}
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
        {statusLabel}
      </Text>

      {joinable ? (
        <TouchableOpacity
          onPress={onJoin}
          disabled={joinTelehealth.isPending}
          accessibilityRole="button"
          style={{
            marginTop: 12,
            backgroundColor: COLORS.coral,
            borderRadius: 14,
            paddingVertical: 12,
            alignItems: "center",
            opacity: joinTelehealth.isPending ? 0.7 : 1,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}>
            {joinTelehealth.isPending ? "Joining…" : "Join video consult"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {error ? (
        <Text style={{ marginTop: 10, fontSize: 13, fontWeight: "600", color: "#B23B30" }}>
          {error}
        </Text>
      ) : null}
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
          <Video size={24} color={COLORS.coral} />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }}
          numberOfLines={1}
        >
          {provider.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
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

function SectionLabel({ children }) {
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: "800",
        color: COLORS.mutedBrown,
        marginBottom: 14,
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
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
      <Video size={32} color={COLORS.mutedBrown} />
      <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 12 }}>
        {title}
      </Text>
      <Text
        style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 6, textAlign: "center" }}
      >
        {body}
      </Text>
    </View>
  );
}
