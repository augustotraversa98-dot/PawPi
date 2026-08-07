import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  Package,
  Heart,
  Truck,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useStorefrontCart } from "@/hooks/useStorefrontCart";
import StorefrontBrowse from "@/components/Providers/StorefrontPanels/StorefrontBrowse";
import {
  StorefrontCartBar,
  StorefrontCheckoutSheet,
} from "@/components/Providers/StorefrontPanels/StorefrontCheckout";
import { money, RxBadge, CatalogEmptyState } from "@/components/Providers/StorefrontPanels/catalogShared";

// Shared store storefront (Services Hub P4a). The mini-shop used by BOTH the Shop screen
// (app/service/shop.jsx) and a provider's storefront (app/service/provider.jsx): search within
// the store, browse categories, a product grid with favorites, and a PRODUCT DETAIL view
// (carousel, price, read-more description, stock, Rx, a delivery/pickup info line) → ADD TO CART
// → checkout.
//
// PR-3a (behavior-preserving extraction): the cart + checkout logic now lives in
// useStorefrontCart, the browse UI in StorefrontBrowse, and the cart/checkout UI in
// StorefrontCartBar + StorefrontCheckoutSheet — so PR-3b can render the browse surface inline.
// This component is now a thin composition of those pieces; the money path (cart →
// useShopCheckout → MercadoPago) is unchanged. onComplete=onClose keeps the modal
// behavior-identical (a successful redirect resets the cart, closes the sheet, and closes the
// modal, exactly as before).
export default function StorefrontCatalog({ shop, petId, onClose }) {
  const { t } = useTranslation();

  const {
    products,
    isLoading,
    cart,
    cartLines,
    total,
    setQty,
    favorites,
    toggleFavorite,
    fulfillment,
    setFulfillment,
    address,
    setAddress,
    canPay,
    showCheckout,
    setShowCheckout,
    doCheckout,
    checkout,
  } = useStorefrontCart(shop, petId, { onComplete: onClose });

  // Which product's detail is open (view-only local state; the cart lives in the hook).
  const [detailId, setDetailId] = useState(null);

  const detailProduct = useMemo(
    () => (products ?? []).find((p) => String(p.id) === String(detailId)) ?? null,
    [products, detailId],
  );

  const closeAll = () => {
    setDetailId(null);
    onClose();
  };

  return (
    <Modal
      visible={!!shop}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeAll}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <GlassSurface
          intensity={BLUR.thick}
          style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
          contentStyle={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: SPACING.lg,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: SPACING.sm }}>
            {detailProduct ? (
              <PressableScale
                testID="storefront-detail-back"
                onPress={() => setDetailId(null)}
                accessibilityLabel={t("common.back")}
              >
                <ArrowLeft size={22} color={COLORS.warmBrown} />
              </PressableScale>
            ) : null}
            <Text
              style={[TYPE.title2, { fontSize: 18, color: COLORS.warmBrown, flex: 1 }]}
              numberOfLines={1}
            >
              {shop?.name || t("storefront.shop")}
            </Text>
          </View>
          <PressableScale onPress={closeAll} accessibilityLabel={t("common.close")}>
            <X size={22} color={COLORS.warmBrown} />
          </PressableScale>
        </GlassSurface>

        {isLoading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : detailProduct ? (
          <ProductDetail
            product={detailProduct}
            t={t}
            qty={cart[detailProduct.id] ?? 0}
            isFavorite={favorites.has(detailProduct.id)}
            onToggleFavorite={() => toggleFavorite(detailProduct.id)}
            onAdd={() => setQty(detailProduct.id, 1, detailProduct.stock_qty)}
            onRemove={() => setQty(detailProduct.id, -1, detailProduct.stock_qty)}
          />
        ) : !products || products.length === 0 ? (
          <View style={{ padding: SPACING.lg }}>
            <CatalogEmptyState body={t("storefront.noProducts")} />
          </View>
        ) : (
          <RefreshableScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 }}>
            <StorefrontBrowse
              products={products}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onOpenDetail={setDetailId}
              cartQtyFor={(pid) => cart[pid] ?? 0}
              onQuickAdd={(p) => setQty(p.id, 1, p.stock_qty)}
              t={t}
            />
          </RefreshableScrollView>
        )}

        {/* Cart bar — verbatim from the original shop flow (now driven by the hook). */}
        <StorefrontCartBar
          visible={cartLines.length > 0}
          total={total}
          currency={shop?.currency}
          onOpenCheckout={() => setShowCheckout(true)}
          t={t}
        />

        {/* Checkout sheet (P4b): choose Pickup or Delivery, add an address for delivery,
            then Pay via the EXISTING checkout. */}
        <StorefrontCheckoutSheet
          visible={showCheckout}
          onClose={() => setShowCheckout(false)}
          fulfillment={fulfillment}
          onSelectFulfillment={setFulfillment}
          address={address}
          onChangeAddress={setAddress}
          canPay={canPay}
          isPending={checkout.isPending}
          total={total}
          currency={shop?.currency}
          storeName={shop?.name}
          onPay={doCheckout}
          t={t}
        />
      </View>
    </Modal>
  );
}

function ProductDetail({ product, qty, onAdd, onRemove, isFavorite, onToggleFavorite, t }) {
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
        </View>

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
