import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Stethoscope,
  MapPin,
  Phone,
  Clock,
  Calendar,
  Star,
  MessageSquare,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useProviderProfile,
  useProviderReviews,
  useStartThread,
} from "@/hooks/useProviders";
import BookingFormModal from "@/components/Providers/BookingFormModal";
import RatingBadge from "@/components/Providers/RatingBadge";

function formatPrice(cents) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

// A published provider's public profile + a "Book appointment" CTA. Receives the
// provider slug as a route param; reads it via useProviderProfile (404 → friendly
// not-found). The booking form posts for the active pet.
export default function ProviderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams();
  const slugStr = Array.isArray(slug) ? slug[0] : slug;

  const { data, isLoading, isError, refetch } = useProviderProfile(slugStr);
  const [showBooking, setShowBooking] = useState(false);
  const { mutate: startThread, isPending: startingThread } = useStartThread();

  const provider = data?.provider;
  const locations = data?.locations ?? [];
  const services = data?.services ?? [];

  // Reviews for this provider (ticket 2.2). Keyed by id once the profile resolves.
  const { data: reviews } = useProviderReviews(provider?.id);
  const reviewList = reviews ?? [];

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
        <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
          {provider?.name || "Provider"}
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError || !provider ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 32,
          }}
        >
          <Stethoscope size={32} color={COLORS.mutedBrown} />
          <Text
            style={{
              fontSize: 16,
              fontWeight: "800",
              color: COLORS.warmBrown,
              marginTop: 12,
            }}
          >
            Provider not found
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: COLORS.mutedBrown,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            This provider isn't available right now.
          </Text>
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        >
          {/* Header card */}
          <View
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 22,
              padding: 18,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: COLORS.peach,
              flexDirection: "row",
              gap: 14,
              alignItems: "center",
            }}
          >
            {provider.logo_url ? (
              <Image
                source={{ uri: provider.logo_url }}
                style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: COLORS.sand }}
              />
            ) : (
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  backgroundColor: COLORS.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Stethoscope size={28} color={COLORS.coral} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontWeight: "800", color: COLORS.warmBrown }}>
                {provider.name}
              </Text>
              {provider.provider_type ? (
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: COLORS.coral,
                    marginTop: 2,
                    textTransform: "capitalize",
                  }}
                >
                  {provider.provider_type}
                </Text>
              ) : null}
              <View style={{ marginTop: 6 }}>
                <RatingBadge
                  avgRating={provider.avg_rating}
                  reviewCount={provider.review_count}
                  size="lg"
                />
              </View>
            </View>
          </View>

          {provider.bio ? (
            <Text
              style={{
                fontSize: 14,
                color: COLORS.mutedBrown,
                lineHeight: 20,
                marginBottom: 18,
              }}
            >
              {provider.bio}
            </Text>
          ) : null}

          {/* Locations */}
          {locations.length > 0 && (
            <Section title="Locations">
              {locations.map((l) => (
                <View
                  key={l.id}
                  style={{
                    backgroundColor: COLORS.card,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: COLORS.peach,
                  }}
                >
                  <Text
                    style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}
                  >
                    {l.name}
                  </Text>
                  {l.address ? (
                    <Row icon={<MapPin size={13} color={COLORS.mutedBrown} />}>
                      {l.address}
                    </Row>
                  ) : null}
                  {l.phone ? (
                    <Row icon={<Phone size={13} color={COLORS.mutedBrown} />}>
                      {l.phone}
                    </Row>
                  ) : null}
                </View>
              ))}
            </Section>
          )}

          {/* Services */}
          {services.length > 0 && (
            <Section title="Services">
              {services.map((s) => (
                <View
                  key={s.id}
                  style={{
                    backgroundColor: COLORS.card,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: COLORS.peach,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "800",
                        color: COLORS.warmBrown,
                        flex: 1,
                      }}
                    >
                      {s.name}
                    </Text>
                    {formatPrice(s.price_cents) ? (
                      <Text
                        style={{ fontSize: 15, fontWeight: "800", color: COLORS.coral }}
                      >
                        {formatPrice(s.price_cents)}
                      </Text>
                    ) : null}
                  </View>
                  {s.description ? (
                    <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}>
                      {s.description}
                    </Text>
                  ) : null}
                  {s.duration_min ? (
                    <Row icon={<Clock size={13} color={COLORS.mutedBrown} />}>
                      {`${s.duration_min} min`}
                    </Row>
                  ) : null}
                </View>
              ))}
            </Section>
          )}

          {/* Reviews (ticket 2.2) — real data; empty state when none. */}
          <Section title="Reviews">
            {reviewList.length === 0 ? (
              <View
                style={{
                  backgroundColor: COLORS.card,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: COLORS.peach,
                }}
              >
                <Text style={{ fontSize: 13, color: COLORS.mutedBrown }}>
                  No reviews yet. After a completed appointment you can be the
                  first to leave one.
                </Text>
              </View>
            ) : (
              reviewList.map((rv) => <ReviewCard key={rv.id} review={rv} />)
            )}
          </Section>
        </RefreshableScrollView>
      )}

      {/* Primary CTAs: Message (start/reuse a thread → open conversation) + Book. */}
      {provider && (
        <View
          style={{
            padding: 16,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: COLORS.peach,
            backgroundColor: COLORS.card,
            flexDirection: "row",
            gap: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              if (startingThread) return;
              startThread(
                { providerId: provider.id },
                {
                  onSuccess: (res) => {
                    const thread = res?.thread;
                    if (!thread) return;
                    router.push({
                      pathname: "/provider-chat",
                      params: {
                        threadId: String(thread.id),
                        providerName: provider.name || "Provider",
                        ownerUserId: String(thread.owner_user_id),
                      },
                    });
                  },
                },
              );
            }}
            style={{
              flex: 1,
              backgroundColor: COLORS.sand,
              borderRadius: 16,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            {startingThread ? (
              <ActivityIndicator size="small" color={COLORS.coral} />
            ) : (
              <MessageSquare size={18} color={COLORS.coral} />
            )}
            <Text style={{ color: COLORS.coral, fontWeight: "800", fontSize: 15 }}>
              Message
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowBooking(true)}
            style={{
              flex: 1,
              backgroundColor: COLORS.coral,
              borderRadius: 16,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Calendar size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 15 }}>
              Book
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <BookingFormModal
        visible={showBooking}
        onClose={() => setShowBooking(false)}
        provider={provider}
        locations={locations}
        services={services}
      />
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "800",
          color: COLORS.mutedBrown,
          marginBottom: 12,
          letterSpacing: 0.6,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function ReviewCard({ review }) {
  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown, flex: 1 }}
          numberOfLines={1}
        >
          {review.reviewer_name || "Pet parent"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Star size={13} color={COLORS.coral} fill={COLORS.coral} />
          <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.warmBrown }}>
            {review.rating}
          </Text>
        </View>
      </View>
      {review.pet_name ? (
        <Text style={{ fontSize: 12, color: COLORS.coral, fontWeight: "700", marginTop: 2 }}>
          with {review.pet_name}
        </Text>
      ) : null}
      {review.body ? (
        <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 6, lineHeight: 19 }}>
          {review.body}
        </Text>
      ) : null}
      {date ? (
        <Text style={{ fontSize: 11, color: COLORS.mutedBrown, marginTop: 6 }}>
          {date}
        </Text>
      ) : null}
    </View>
  );
}

function Row({ icon, children }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}
    >
      {icon}
      <Text style={{ fontSize: 13, color: COLORS.mutedBrown, flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}
