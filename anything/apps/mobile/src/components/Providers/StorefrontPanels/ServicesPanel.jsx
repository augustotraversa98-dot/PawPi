import React from "react";
import { View, Text, Image } from "react-native";
import { Clock } from "lucide-react-native";
import { Card } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Section, Row, formatPrice } from "./primitives";

// Services section (moved verbatim from app/service/provider.jsx). Presentational: takes the
// already-fetched active services. Renders nothing when there are none.
export default function ServicesPanel({ services = [] }) {
  if (services.length === 0) return null;
  return (
    <Section title="Services">
      {services.map((s) => (
        <Card
          key={s.id}
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
            <Text style={[TYPE.headline, { color: COLORS.warmBrown, flex: 1 }]}>
              {s.name}
            </Text>
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
        </Card>
      ))}
    </Section>
  );
}
