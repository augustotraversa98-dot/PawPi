import React, { useState } from "react";
import { View, Text, Image, ScrollView } from "react-native";
import { Package, Heart, Truck, Plus, Minus } from "lucide-react-native";
import { PressableScale, GlassSurface } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { money, RxBadge, FeaturedBadge, DiscountBadge } from "./catalogShared";

// Product detail view (carousel, price, read-more description, stock, Rx, delivery/pickup info)
// + add-to-cart bar. Relocated VERBATIM out of StorefrontCatalog (PR-3b) so BOTH the catalog
// modal and the inline provider storefront can open it. Behavior unchanged.
export default function ProductDetail({
  product,
  qty,
  onAdd,
  onRemove,
  isFavorite,
  onToggleFavorite,
  t,
}) {
  const [expanded, setExpanded] = useState(false);
  const soldOut = product.stock_qty <= 0;
  const images = Array.isArray(product.image_urls) ? product.image_urls : [];
  const desc = product.description ?? "";
  const isLong = desc.length > 140;
  const shownDesc = expanded || !isLong ? desc : `${desc.slice(0, 140)}…`;

  return (
    <View style={{ flex: 1 }}>
      <RefreshableScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 160 }}>
        {/* Image carousel */}
        {images.length > 0 ? (
          <ScrollView
            testID="storefront-detail-carousel"
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: SPACING.md }}
          >
            {images.map((uri, i) => (
              <Image
                key={`${product.id}-img-${i}`}
                testID="storefront-detail-image"
                source={{ uri }}
                style={{
                  width: 300,
                  height: 220,
                  borderRadius: RADIUS.card,
                  backgroundColor: COLORS.sand,
                  marginRight: SPACING.sm,
                }}
              />
            ))}
          </ScrollView>
        ) : (
          <View
            style={{
              width: "100%",
              height: 200,
              borderRadius: RADIUS.card,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: SPACING.md,
            }}
          >
            <Package size={40} color={COLORS.coral} />
          </View>
        )}

        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm }}>
          <Text style={[TYPE.title2, { color: COLORS.warmBrown, flex: 1 }]}>
            {product.name}
          </Text>
          <PressableScale
            testID="storefront-detail-fav"
            onPress={onToggleFavorite}
            accessibilityLabel={t("storefront.favorite")}
            hitSlop={8}
          >
            <Heart size={22} color={COLORS.coral} fill={isFavorite ? COLORS.coral : "none"} />
          </PressableScale>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: 4 }}>
          <Text style={[TYPE.title2, { color: COLORS.coral }]}>
            {money(product.price_cents, product.currency)}
          </Text>
          {product.is_rx ? <RxBadge /> : null}
          {product.is_featured ? (
            <FeaturedBadge t={t} testID="storefront-detail-featured" />
          ) : null}
        </View>
        <DiscountBadge
          priceCents={product.price_cents}
          compareAtCents={product.compare_at_cents}
          currency={product.currency}
          t={t}
          testID="storefront-detail-discount"
        />

        <Text
          style={[
            TYPE.subhead,
            { color: soldOut ? COLORS.terracotta : COLORS.mutedBrown, fontWeight: "700", marginTop: 4 },
          ]}
        >
          {soldOut ? t("storefront.soldOut") : t("storefront.inStock", { count: product.stock_qty })}
        </Text>

        {desc ? (
          <View style={{ marginTop: SPACING.md }}>
            <Text style={[TYPE.callout, { color: COLORS.warmBrown, lineHeight: 20 }]}>
              {shownDesc}
            </Text>
            {isLong ? (
              <PressableScale
                testID="storefront-detail-readmore"
                onPress={() => setExpanded((v) => !v)}
                style={{ marginTop: 4 }}
              >
                <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>
                  {expanded ? t("storefront.readLess") : t("storefront.readMore")}
                </Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}

        {/* Delivery / pickup — informational only this phase (P4b wires the real choice). */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
            marginTop: SPACING.md,
            padding: SPACING.md,
            backgroundColor: COLORS.sand,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <Truck size={16} color={COLORS.mutedBrown} />
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, flex: 1, fontWeight: "500" }]}>
            {t("storefront.deliveryPickup")}
          </Text>
        </View>
      </RefreshableScrollView>

      {/* Add-to-cart bar for this product */}
      {soldOut ? null : (
        <GlassSurface
          intensity={BLUR.thick}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            borderTopWidth: 1,
            borderColor: MATERIALS.glassBorder,
          }}
          contentStyle={{
            padding: SPACING.lg,
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.md,
          }}
        >
          {qty > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
              <PressableScale onPress={onRemove} accessibilityLabel={t("storefront.removeOne")}>
                <Minus size={22} color={COLORS.warmBrown} />
              </PressableScale>
              <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
                {qty}
              </Text>
            </View>
          ) : null}
          <PressableScale
            testID="storefront-detail-add"
            onPress={onAdd}
            style={{
              flex: 1,
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.control,
              paddingVertical: 15,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.sm,
            }}
          >
            <Plus size={18} color="#FFF" />
            <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
              {qty > 0 ? t("storefront.inCart", { count: qty }) : t("storefront.addToCart")}
            </Text>
          </PressableScale>
        </GlassSurface>
      )}
    </View>
  );
}
