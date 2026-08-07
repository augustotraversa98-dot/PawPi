import React from "react";
import { View, Text } from "react-native";
import { Package, Pill, Star } from "lucide-react-native";
import { Card } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { formatMoney } from "@/utils/money";

// Small shared pieces of the store catalog (PR-3a behavior-preserving extraction), moved
// VERBATIM out of StorefrontCatalog so the browse grid, the product detail, and the cart /
// checkout bar all render prices, the Rx badge, and empty states identically.

// Delegates to the shared formatter so shop and provider screens always render the same price
// identically. Returns "" (not null) so string interpolations stay clean.
export function money(cents, currency = "ARS") {
  return formatMoney(cents, currency) ?? "";
}

export function RxBadge() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: COLORS.terracotta + "22",
        borderRadius: RADIUS.chip,
        paddingHorizontal: 7,
        paddingVertical: 2,
      }}
    >
      <Pill size={11} color={COLORS.terracotta} />
      <Text style={[TYPE.caption, { fontSize: 10, fontWeight: "800", color: COLORS.terracotta, letterSpacing: 0 }]}>
        Rx
      </Text>
    </View>
  );
}

// "Featured" pill (storefront merchandising, Phase 2a) — mirrors the RxBadge shape/scale.
// Rendered when a product OR service is is_featured. Label is i18n (storefront.featured).
export function FeaturedBadge({ t, testID }) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: COLORS.coral + "22",
        borderRadius: RADIUS.chip,
        paddingHorizontal: 7,
        paddingVertical: 2,
      }}
    >
      <Star size={11} color={COLORS.coral} fill={COLORS.coral} />
      <Text style={[TYPE.caption, { fontSize: 10, fontWeight: "800", color: COLORS.coral, letterSpacing: 0 }]}>
        {t("storefront.featured")}
      </Text>
    </View>
  );
}

// Integer percent off, or null when there is no valid discount (compare_at absent, not a
// number, or not strictly greater than the current price). PRODUCTS only — services never
// carry a discount. pct = round((compare_at_cents - price_cents) / compare_at_cents * 100).
export function discountPct(priceCents, compareAtCents) {
  if (!Number.isFinite(priceCents) || !Number.isFinite(compareAtCents)) return null;
  if (compareAtCents <= 0 || compareAtCents <= priceCents) return null;
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
}

// Discount badge (Phase 2a): the struck-through "was" price + "-{pct}%". Renders nothing
// when there is no valid discount, so callers can drop it in unconditionally.
export function DiscountBadge({ priceCents, compareAtCents, currency = "ARS", t, testID }) {
  const pct = discountPct(priceCents, compareAtCents);
  if (pct == null) return null;
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
      <Text
        style={[
          TYPE.caption,
          { color: COLORS.mutedBrown, fontWeight: "600", textDecorationLine: "line-through", letterSpacing: 0 },
        ]}
      >
        {money(compareAtCents, currency)}
      </Text>
      <Text style={[TYPE.caption, { color: COLORS.terracotta, fontWeight: "800", letterSpacing: 0 }]}>
        {t("storefront.discountPct", { pct })}
      </Text>
    </View>
  );
}

export function CatalogEmptyState({ body }) {
  return (
    <Card
      level="sm"
      radius={RADIUS.card}
      borderColor={COLORS.peach}
      style={{ padding: SPACING.xxl + SPACING.xs, alignItems: "center" }}
    >
      <Package size={32} color={COLORS.mutedBrown} />
      <Text
        style={[
          TYPE.subhead,
          { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.md, textAlign: "center" },
        ]}
      >
        {body}
      </Text>
    </Card>
  );
}
