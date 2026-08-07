import React from "react";
import { View, Text, Image } from "react-native";
import { ShoppingBag } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Section, formatPrice } from "./primitives";

// Items section (moved verbatim from app/service/provider.jsx). Presentational: takes the
// already-fetched shop products. Tapping any item calls onOpenCatalog (the SAME in-storefront
// catalog the Shop CTA opens — no separate Shop screen hop). Renders nothing when empty.
export default function ItemsPanel({ products = [], onOpenCatalog }) {
  if (products.length === 0) return null;
  return (
    <Section title="Items">
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: SPACING.sm + 2,
        }}
      >
        {products.map((p) => (
          <PressableScale
            key={p.id}
            testID="storefront-item"
            onPress={onOpenCatalog}
            style={{
              width: "47%",
              backgroundColor: COLORS.card,
              borderRadius: RADIUS.md,
              padding: SPACING.sm + 2,
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            {Array.isArray(p.image_urls) && p.image_urls[0] ? (
              <Image
                source={{ uri: p.image_urls[0] }}
                style={{
                  width: "100%",
                  height: 90,
                  borderRadius: RADIUS.control,
                  backgroundColor: COLORS.sand,
                }}
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: 90,
                  borderRadius: RADIUS.control,
                  backgroundColor: COLORS.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ShoppingBag size={22} color={COLORS.coral} />
              </View>
            )}
            <Text
              numberOfLines={1}
              style={[
                TYPE.subhead,
                { fontWeight: "800", color: COLORS.warmBrown, marginTop: 6 },
              ]}
            >
              {p.name}
            </Text>
            {formatPrice(p.price_cents, p.currency) ? (
              <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.coral }]}>
                {formatPrice(p.price_cents, p.currency)}
              </Text>
            ) : null}
          </PressableScale>
        ))}
      </View>
    </Section>
  );
}
