import React from "react";
import { View, Text } from "react-native";
import { Package, Pill } from "lucide-react-native";
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
