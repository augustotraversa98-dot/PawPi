import React, { useMemo, useState } from "react";
import { View, Text, ActivityIndicator, Modal } from "react-native";
import { useTranslation } from "react-i18next";
import { X, ArrowLeft } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useStorefrontCart } from "@/hooks/useStorefrontCart";
import StorefrontBrowse from "@/components/Providers/StorefrontPanels/StorefrontBrowse";
import ProductDetail from "@/components/Providers/StorefrontPanels/ProductDetail";
import {
  StorefrontCartBar,
  StorefrontCheckoutSheet,
} from "@/components/Providers/StorefrontPanels/StorefrontCheckout";
import { CatalogEmptyState } from "@/components/Providers/StorefrontPanels/catalogShared";

// Shared store storefront (Services Hub P4a). The mini-shop used by the Shop screen
// (app/service/shop.jsx): search within the store, browse categories, a product grid with
// favorites, and a PRODUCT DETAIL view → ADD TO CART → checkout.
//
// PR-3a/3b: the cart + checkout logic lives in useStorefrontCart, the browse UI in
// StorefrontBrowse, the product detail in ProductDetail, and the cart/checkout UI in
// StorefrontCartBar + StorefrontCheckoutSheet — so the provider storefront renders the same
// browse surface INLINE. This modal is now a thin composition of those pieces; the money path
// (cart → useShopCheckout → MercadoPago) is unchanged. onComplete=onClose keeps the modal
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
