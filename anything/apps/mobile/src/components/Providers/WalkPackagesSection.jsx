import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Footprints } from "lucide-react-native";
import { Card, PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Section, formatPrice } from "./StorefrontPanels/primitives";

// Walk packages (ticket B2) — a walker's prepaid packs on its storefront. Presentational: takes the
// already-fetched active packages + the owner's remaining balance, and a buy handler. The owner
// buys a pack → the same MercadoPago checkout the shop uses → a credit balance granted on paid.
// Real data only: renders nothing when there are no packages.
export default function WalkPackagesSection({
  packages = [],
  remaining = 0,
  businessName,
  onBuy,
  buying = false,
  t,
}) {
  if (!packages.length) return null;
  const tr = (key, fallback, opts) => (t ? t(key, opts) : fallback);

  return (
    <Section title={tr("walkPackages.title", "Walk packages")}>
      {/* Balance line — only when the owner already has walks with this business. */}
      {remaining > 0 ? (
        <View
          testID="walk-credits-balance"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
            backgroundColor: COLORS.sand,
            borderRadius: RADIUS.md,
            paddingHorizontal: SPACING.md + 2,
            paddingVertical: SPACING.sm + 2,
            marginBottom: SPACING.sm + 2,
          }}
        >
          <Footprints size={16} color={COLORS.coral} />
          <Text style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "700", flex: 1 }]}>
            {tr("walkPackages.balance", `You have ${remaining} walks with ${businessName ?? "this walker"}`, {
              count: remaining,
              business: businessName ?? "",
            })}
          </Text>
        </View>
      ) : null}

      {packages.map((p) => {
        const label =
          p.walks_count === 1
            ? tr("walkPackages.single", "Single walk")
            : tr("walkPackages.pack", `${p.walks_count} walks`, { count: p.walks_count });
        const perWalk =
          p.walks_count > 0 ? Math.round(p.price_cents / p.walks_count) : p.price_cents;
        return (
          <Card
            key={p.id}
            level="sm"
            radius={RADIUS.md}
            style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1, marginRight: SPACING.md }}>
                <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>{label}</Text>
                {p.walks_count > 1 && formatPrice(perWalk) ? (
                  <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
                    {tr("walkPackages.perWalk", `${formatPrice(perWalk)} per walk`, {
                      price: formatPrice(perWalk),
                    })}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: SPACING.sm }}>
                {formatPrice(p.price_cents) ? (
                  <Text style={[TYPE.headline, { color: COLORS.coral }]}>
                    {formatPrice(p.price_cents)}
                  </Text>
                ) : null}
                <PressableScale
                  testID={`walk-package-buy-${p.id}`}
                  onPress={() => onBuy?.(p)}
                  disabled={buying}
                  accessibilityRole="button"
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: RADIUS.control,
                    paddingHorizontal: SPACING.lg,
                    paddingVertical: SPACING.sm,
                    opacity: buying ? 0.7 : 1,
                    minWidth: 64,
                    alignItems: "center",
                  }}
                >
                  {buying ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={[TYPE.subhead, { color: "#FFF", fontWeight: "800" }]}>
                      {tr("walkPackages.buy", "Buy")}
                    </Text>
                  )}
                </PressableScale>
              </View>
            </View>
          </Card>
        );
      })}
    </Section>
  );
}
