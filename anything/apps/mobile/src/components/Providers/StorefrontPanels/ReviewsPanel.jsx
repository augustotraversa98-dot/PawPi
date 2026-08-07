import React from "react";
import { View, Text } from "react-native";
import { Star } from "lucide-react-native";
import { Card, PressableScale } from "@/components/ui";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Section } from "./primitives";

// Reviews section (moved verbatim from app/service/provider.jsx). Presentational: takes the
// already-fetched reviews plus the owner's eligible completed booking (the leave-a-review
// entry point, gated the same way) and the onLeaveReview callback. Always rendered (empty
// state when there are no reviews) — Reviews is the store header's tappable-rating jump target.
export default function ReviewsPanel({
  reviews = [],
  eligibleReviewBooking,
  onLeaveReview,
  t,
}) {
  return (
    <Section title="Reviews">
      {/* Owner entry point to leave a review — only with a completed booking here. */}
      {eligibleReviewBooking ? (
        <PressableScale
          testID="storefront-review-cta"
          onPress={onLeaveReview}
          accessibilityRole="button"
          accessibilityLabel={t("storefront.leaveReview")}
          style={{
            backgroundColor: COLORS.coral,
            borderRadius: RADIUS.control,
            padding: SPACING.md + 2,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACING.sm,
            marginBottom: SPACING.md,
          }}
        >
          <Star size={18} color="#FFF" fill="#FFF" />
          <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
            {t("storefront.leaveReview")}
          </Text>
        </PressableScale>
      ) : null}
      {reviews.length === 0 ? (
        <Card level="sm" radius={RADIUS.md} style={{ padding: SPACING.lg }}>
          <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500" }]}>
            No reviews yet. After a completed appointment you can be the first to
            leave one.
          </Text>
        </Card>
      ) : (
        reviews.map((rv) => <ReviewCard key={rv.id} review={rv} />)
      )}
    </Section>
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
    <Card
      level="sm"
      radius={RADIUS.md}
      style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={[TYPE.headline, { color: COLORS.warmBrown, flex: 1 }]}
          numberOfLines={1}
        >
          {review.reviewer_name || "Pet parent"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Star size={13} color={COLORS.coral} fill={COLORS.coral} />
          <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.warmBrown }]}>
            {review.rating}
          </Text>
          {/* Report this review (T4). */}
          <ModerationMenu targetType="review" targetId={review.id} iconSize={15} />
        </View>
      </View>
      {review.pet_name ? (
        <Text style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700", marginTop: 2 }]}>
          with {review.pet_name}
        </Text>
      ) : null}
      {review.body ? (
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 6, lineHeight: 19 }]}>
          {review.body}
        </Text>
      ) : null}
      {date ? (
        <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "500", letterSpacing: 0, marginTop: 6 }]}>
          {date}
        </Text>
      ) : null}
    </Card>
  );
}
