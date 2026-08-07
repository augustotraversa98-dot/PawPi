import React from "react";
import { View, Text, Image } from "react-native";
import { Clock } from "lucide-react-native";
import { Card, PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Section, Row, formatPrice } from "./primitives";
import { FeaturedBadge } from "./catalogShared";

// Services section (moved verbatim from app/service/provider.jsx). Presentational: takes the
// already-fetched active services. Renders nothing when there are none. A featured service
// (Phase 2a) shows a Featured pill next to its name.
//
// onPressService (optional): when provided, each row becomes a tap target that opens booking
// for THAT service (feat/tap-service-to-book). Without it, rows render non-interactive exactly
// as before, so any other usage is unaffected.
export default function ServicesPanel({ services = [], t, onPressService }) {
  if (services.length === 0) return null;
  return (
    <Section title="Services">
      {services.map((s) => {
        const card = (
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 }}>
                <Text style={[TYPE.headline, { color: COLORS.warmBrown, flexShrink: 1 }]}>
                  {s.name}
                </Text>
                {s.is_featured && t ? (
                  <FeaturedBadge t={t} testID={`service-featured-${s.id}`} />
                ) : null}
              </View>
              {formatPrice(s.price_cents) ? (
                <Text style={[TYPE.headline, { color: COLORS.coral }]}>
                  {formatPrice(s.price_cents)}
                </Text>
              ) : null}
            </View>
            {s.description ? (
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 4 }]}>
                {s.description}
              </Text>
            ) : null}
            {s.duration_min ? (
              <Row icon={<Clock size={13} color={COLORS.mutedBrown} />}>
                {`${s.duration_min} min`}
              </Row>
            ) : null}
            {Array.isArray(s.image_urls) && s.image_urls.length > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: SPACING.sm,
                  marginTop: SPACING.sm + 2,
                }}
              >
                {s.image_urls.map((uri, i) => (
                  <Image
                    key={`${s.id}-img-${i}`}
                    testID="service-image"
                    source={{ uri }}
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: RADIUS.control,
                      backgroundColor: COLORS.sand,
                    }}
                  />
                ))}
              </View>
            ) : null}
            {/* Compact per-service Book CTA — same entry point as tapping the card. */}
            {onPressService ? (
              <PressableScale
                testID={`service-book-${s.id}`}
                onPress={() => onPressService(s)}
                accessibilityRole="button"
                style={{
                  alignSelf: "flex-start",
                  marginTop: SPACING.md,
                  backgroundColor: COLORS.coral,
                  borderRadius: RADIUS.control,
                  paddingHorizontal: SPACING.lg,
                  paddingVertical: SPACING.sm,
                }}
              >
                <Text style={[TYPE.subhead, { color: "#FFF", fontWeight: "800" }]}>
                  {t ? t("providers.book") : "Book"}
                </Text>
              </PressableScale>
            ) : null}
          </Card>
        );
        return onPressService ? (
          <PressableScale
            key={s.id}
            testID={`service-row-${s.id}`}
            onPress={() => onPressService(s)}
            accessibilityRole="button"
          >
            {card}
          </PressableScale>
        ) : (
          <React.Fragment key={s.id}>{card}</React.Fragment>
        );
      })}
    </Section>
  );
}
