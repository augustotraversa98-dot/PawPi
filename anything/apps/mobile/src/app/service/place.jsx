import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Heart,
  Star,
  PawPrint,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import RatingBadge from "@/components/Providers/RatingBadge";
import PlaceReviewModal from "@/components/Places/PlaceReviewModal";
import {
  PET_WELCOME_LEVELS,
  PLACE_AMENITIES,
  WELCOME_LEVEL_BY_KEY,
} from "@/constants/placeReviews";
import { usePlaceDetail, usePlaceReviews } from "@/hooks/usePlaceReviews";
import { useMyProfileId } from "@/hooks/useUserProfile";
import { useSavedPlaces, useSavePlace, useUnsavePlace } from "@/hooks/usePlaces";
import { isValidCoord } from "@/utils/walkBuddies";

// Place DETAIL — the drill-in target of the unified Services discovery. Reads PawPi's OWN place
// data (GET /api/places/[id]) + community reviews (GET .../reviews), NEVER Google.
//
// Storefront shell (redesign Phase 1, PR-4): mirrors the provider storefront — a hero-light
// sticky header (name + category/neighborhood + tappable rating summary → Reviews + Save /
// Directions) → a horizontal tab bar → the active panel. Two tabs: Overview (the pet policy &
// amenities aggregates) and Reviews (the Rate/Edit CTA + the review list). Pure view
// reorganization: the hooks, PlaceReviewModal, Save/Directions and all data stay as today. Both
// panels are MOUNTED-BUT-HIDDEN (inactive → display:"none") so every testID resolves in one
// render (the include-hidden RNTL config keeps that green).

function openDirections(place) {
  const q = isValidCoord(place?.lat, place?.lng)
    ? `${place.lat},${place.lng}`
    : encodeURIComponent(place?.address || place?.name || "");
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${q}`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  Linking.openURL(url);
}

export default function PlaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams();
  const idStr = Array.isArray(id) ? id[0] : id;

  const { data: place, isLoading, isError } = usePlaceDetail(idStr);
  const { data: reviewData } = usePlaceReviews(idStr);
  const { data: myProfileId } = useMyProfileId();
  const { data: saved = [] } = useSavedPlaces();
  const save = useSavePlace();
  const unsave = useUnsavePlace();

  const [showReview, setShowReview] = useState(false);
  const [activeTab, setActiveTab] = useState("overview"); // shell active tab key

  const reviews = reviewData?.reviews ?? [];
  const aggregates = reviewData?.aggregates ?? null;
  const reviewCount = aggregates?.overall_count ?? 0;

  // The caller's own review (owner_user_id = my profile id). String-compare (porsager may surface
  // either as a string). Drives Rate-vs-Edit + prefill.
  const myReview = useMemo(
    () =>
      myProfileId == null
        ? null
        : reviews.find(
            (r) => String(r.owner_user_id) === String(myProfileId),
          ) ?? null,
    [reviews, myProfileId],
  );

  const savedRow = saved.find((s) => s.place_id === idStr);
  const toggleSave = () => {
    if (!place) return;
    if (savedRow) {
      unsave.mutate(savedRow.id);
    } else {
      save.mutate({
        place_id: place.id,
        name: place.name,
        category: place.category ?? null,
        lat: place.lat ?? null,
        lng: place.lng ?? null,
        address: place.address ?? null,
      });
    }
  };

  const TABS = [
    { key: "overview", label: t("placeReviews.tabs.overview") },
    { key: "reviews", label: t("placeReviews.tabs.reviews") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]} numberOfLines={1}>
          {place?.name || t("placeReviews.title")}
        </Text>
      </GlassSurface>

      {isLoading ? (
        <View
          testID="place-loading"
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError || !place ? (
        <View
          testID="place-not-found"
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: SPACING.xxxl,
          }}
        >
          <MapPin size={32} color={COLORS.mutedBrown} />
          <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.md }]}>
            {t("placeReviews.notFound")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}
          stickyHeaderIndices={[1]}
        >
          {/* index 0 — hero-light sticky header (scrolls under the sticky tab bar). */}
          <PlaceHeader
            place={place}
            savedRow={savedRow}
            onToggleSave={toggleSave}
            aggregates={aggregates}
            reviewCount={reviewCount}
            onJumpToReviews={() => setActiveTab("reviews")}
            t={t}
          />

          {/* index 1 — sticky tab bar (mirrors the storefront pill pattern; two tabs). */}
          <PlaceTabBar tabs={TABS} activeKey={activeTab} onSelect={setActiveTab} />

          {/* index 2 — Overview panel: the pet policy & amenities at-a-glance. */}
          <View
            testID="place-panel-overview"
            style={{ display: activeTab === "overview" ? "flex" : "none" }}
          >
            <Text style={styles.sectionTitle}>
              {t("placeReviews.sectionTitle").toUpperCase()}
            </Text>

            {reviewCount === 0 ? (
              <Card
                testID="place-reviews-empty"
                level="sm"
                radius={RADIUS.md}
                style={{ padding: SPACING.lg, marginBottom: SPACING.md }}
              >
                <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500" }]}>
                  {t("placeReviews.empty")}
                </Text>
              </Card>
            ) : (
              <Card
                level="sm"
                radius={RADIUS.md}
                style={{ padding: SPACING.md + 2, marginBottom: SPACING.md }}
              >
                <RatingBadge
                  avgRating={aggregates?.overall_avg}
                  reviewCount={reviewCount}
                  size="lg"
                />

                {/* Most owners say: <top tier> */}
                {aggregates?.welcome?.top_level ? (
                  <View
                    testID="place-most-owners"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginTop: SPACING.md,
                    }}
                  >
                    <PawPrint size={16} color={COLORS.coral} />
                    <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "600" }]}>
                      {t("placeReviews.mostOwnersSay")}
                    </Text>
                    <Text style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "800" }]}>
                      {WELCOME_LEVEL_BY_KEY[aggregates.welcome.top_level]?.icon}{" "}
                      {t(`placeReviews.welcome.${aggregates.welcome.top_level}`)}
                    </Text>
                  </View>
                ) : null}

                {/* Small welcome-tier distribution */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.md }}>
                  {PET_WELCOME_LEVELS.map((lvl) => {
                    const n = aggregates?.welcome?.distribution?.[lvl.key] ?? 0;
                    if (n === 0) return null;
                    return (
                      <Text
                        key={lvl.key}
                        testID={`place-welcome-dist-${lvl.key}`}
                        style={[TYPE.footnote, { color: COLORS.mutedBrown, fontWeight: "600" }]}
                      >
                        {lvl.icon} {t(`placeReviews.welcome.${lvl.key}`)} · {n}
                      </Text>
                    );
                  })}
                </View>

                {/* Amenity tallies */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm }}>
                  {PLACE_AMENITIES.map((am) => {
                    const n = aggregates?.amenities?.count_by_key?.[am.key] ?? 0;
                    if (n === 0) return null;
                    return (
                      <Text
                        key={am.key}
                        testID={`place-amenity-tally-${am.key}`}
                        style={[TYPE.footnote, { color: COLORS.warmBrown, fontWeight: "600" }]}
                      >
                        {am.icon} {t(`placeReviews.amenity.${am.key}`)} · {n}
                      </Text>
                    );
                  })}
                </View>
              </Card>
            )}
          </View>

          {/* index 3 — Reviews panel: Rate/Edit CTA + the review list. */}
          <View
            testID="place-panel-reviews"
            style={{ display: activeTab === "reviews" ? "flex" : "none" }}
          >
            <PressableScale
              testID="place-rate-cta"
              onPress={() => setShowReview(true)}
              accessibilityRole="button"
              accessibilityLabel={myReview ? t("placeReviews.editCta") : t("placeReviews.rateCta")}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.control,
                padding: SPACING.md + 2,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.sm,
                marginBottom: SPACING.lg,
              }}
            >
              <Star size={18} color="#FFF" fill="#FFF" />
              <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
                {myReview ? t("placeReviews.editCta") : t("placeReviews.rateCta")}
              </Text>
            </PressableScale>

            {reviews.map((rv) => (
              <ReviewCard key={rv.id} review={rv} t={t} />
            ))}
          </View>
        </ScrollView>
      )}

      <PlaceReviewModal
        visible={showReview}
        onClose={() => setShowReview(false)}
        place={place}
        existing={myReview}
      />
    </View>
  );
}

// Hero-light sticky header (StoreHeader-style): a subtle gradient banner (no image — places
// have no image field), then the identity (name, category · neighborhood, address), a tappable
// rating summary that jumps to Reviews, and the Save / Directions actions.
function PlaceHeader({
  place,
  savedRow,
  onToggleSave,
  aggregates,
  reviewCount,
  onJumpToReviews,
  t,
}) {
  return (
    <Card
      level="md"
      radius={RADIUS.card}
      style={{ marginBottom: SPACING.lg, overflow: "hidden" }}
    >
      {/* Subtle banner — decorative only, no data. */}
      <LinearGradient
        pointerEvents="none"
        colors={[COLORS.peach, COLORS.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: 52 }}
      />
      <View style={{ padding: SPACING.lg + 2, paddingTop: SPACING.md }}>
        <Text style={[TYPE.title2, { fontSize: 20, color: COLORS.warmBrown }]}>
          {place.name}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: SPACING.sm,
            marginTop: 4,
          }}
        >
          {place.category ? (
            <Text
              style={[
                TYPE.footnote,
                { fontWeight: "700", color: COLORS.coral, textTransform: "capitalize" },
              ]}
            >
              {place.category}
            </Text>
          ) : null}
          {place.neighborhood ? (
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, fontWeight: "600" }]}>
              {place.neighborhood}
            </Text>
          ) : null}
        </View>
        {place.address ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: SPACING.sm,
            }}
          >
            <MapPin size={13} color={COLORS.mutedBrown} />
            <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", flex: 1 }]}>
              {place.address}
            </Text>
          </View>
        ) : null}

        {/* Tappable rating summary → jumps to the Reviews tab. */}
        <PressableScale
          testID="place-rating-summary"
          onPress={onJumpToReviews}
          accessibilityRole="button"
          accessibilityLabel={t("placeReviews.tabs.reviews")}
          style={{ marginTop: SPACING.sm + 2, alignSelf: "flex-start" }}
        >
          <RatingBadge
            avgRating={aggregates?.overall_avg}
            reviewCount={reviewCount}
            size="lg"
          />
        </PressableScale>

        {/* Save + Directions */}
        <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md + 2 }}>
          <PressableScale
            testID="place-save"
            onPress={onToggleSave}
            accessibilityRole="button"
            accessibilityLabel={savedRow ? t("placeReviews.saved") : t("placeReviews.save")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: SPACING.md + 2,
              paddingVertical: SPACING.sm + 2,
              borderRadius: RADIUS.chip,
              backgroundColor: savedRow ? COLORS.coral : COLORS.card,
              borderWidth: 1,
              borderColor: savedRow ? COLORS.coral : COLORS.peach,
            }}
          >
            <Heart
              size={16}
              color={savedRow ? "#FFF" : COLORS.coral}
              fill={savedRow ? "#FFF" : "none"}
            />
            <Text
              style={[
                TYPE.subhead,
                { fontWeight: "700", color: savedRow ? "#FFF" : COLORS.warmBrown },
              ]}
            >
              {savedRow ? t("placeReviews.saved") : t("placeReviews.save")}
            </Text>
          </PressableScale>

          <PressableScale
            testID="place-directions"
            onPress={() => openDirections(place)}
            accessibilityRole="button"
            accessibilityLabel={t("placeReviews.directions")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: SPACING.md + 2,
              paddingVertical: SPACING.sm + 2,
              borderRadius: RADIUS.chip,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            <Navigation size={16} color={COLORS.sageDark} />
            <Text style={[TYPE.subhead, { fontWeight: "700", color: COLORS.sageDark }]}>
              {t("placeReviews.directions")}
            </Text>
          </PressableScale>
        </View>
      </View>
    </Card>
  );
}

// Horizontal tab bar — mirrors the storefront pill pattern (two tabs, so a plain row, no
// horizontal scroll). Opaque background so the sticky bar cleanly covers the panel beneath it.
function PlaceTabBar({ tabs, activeKey, onSelect }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.cream,
        marginBottom: SPACING.lg,
        paddingBottom: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.peach,
      }}
    >
      <View style={{ flexDirection: "row", gap: SPACING.sm }}>
        {tabs.map((tab) => {
          const selected = tab.key === activeKey;
          return (
            <PressableScale
              key={tab.key}
              testID={`place-tab-${tab.key}`}
              onPress={() => onSelect(tab.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: SPACING.lg - 2,
                paddingVertical: SPACING.sm,
                borderRadius: RADIUS.chip,
                borderWidth: 1,
                borderColor: selected ? COLORS.coral : COLORS.peach,
                backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
              }}
            >
              <Text
                style={[
                  TYPE.subhead,
                  { fontWeight: "700", color: selected ? COLORS.coral : COLORS.warmBrown },
                ]}
              >
                {tab.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function ReviewCard({ review, t }) {
  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const welcome = WELCOME_LEVEL_BY_KEY[review.pet_welcome_level];
  return (
    <Card
      testID={`place-review-${review.id}`}
      level="sm"
      radius={RADIUS.md}
      style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[TYPE.headline, { color: COLORS.warmBrown, flex: 1 }]} numberOfLines={1}>
          {review.reviewer_name || t("placeReviews.anonReviewer")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Star size={13} color={COLORS.coral} fill={COLORS.coral} />
          <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.warmBrown }]}>
            {review.overall_rating}
          </Text>
        </View>
      </View>

      {/* Welcome-tier badge */}
      {welcome ? (
        <View
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginTop: 6,
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: RADIUS.chip,
            backgroundColor: COLORS.coral + "14",
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <Text style={{ fontSize: 13 }}>{welcome.icon}</Text>
          <Text style={[TYPE.caption, { color: COLORS.coral, fontWeight: "700" }]}>
            {t(`placeReviews.welcome.${review.pet_welcome_level}`)}
          </Text>
        </View>
      ) : null}

      {/* Amenity chips */}
      {Array.isArray(review.amenities) && review.amenities.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {review.amenities.map((key) => (
            <Text
              key={key}
              style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "600" }]}
            >
              {t(`placeReviews.amenity.${key}`)}
            </Text>
          ))}
        </View>
      ) : null}

      {review.comment ? (
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 6, lineHeight: 19 }]}>
          {review.comment}
        </Text>
      ) : null}
      {date ? (
        <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 6 }]}>
          {date}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = {
  sectionTitle: {
    ...TYPE.subhead,
    fontWeight: "800",
    color: COLORS.mutedBrown,
    marginBottom: SPACING.md,
    letterSpacing: 0.6,
  },
};
