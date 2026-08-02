import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Linking,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  Package,
  Pill,
  Search,
  Heart,
  Truck,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useShopProducts, useShopCheckout } from "@/hooks/useProviders";
import { formatMoney } from "@/utils/money";

// Shared store storefront (Services Hub P4a). The mini-shop used by BOTH the Shop screen
// (app/service/shop.jsx) and a provider's storefront (app/service/provider.jsx): search
// within the store, browse categories, a product grid with favorites, and a PRODUCT DETAIL
// view (carousel, price, read-more description, stock, Rx, a delivery/pickup info line) →
// ADD TO CART → checkout.
//
// IMPORTANT (P4a): the cart + checkout logic is reused EXACTLY as it shipped in shop.jsx —
// the same local {productId: qty} cart, the same setQty clamp, and the same
// useShopCheckout() POST with rail 'mercadopago'. Nothing on the money path changed here;
// P4b owns checkout wiring / delivery / live payment. Only browsing UI (search, categories,
// favorites, product detail) was added on top.

function money(cents, currency = "ARS") {
  return formatMoney(cents, currency) ?? "";
}

export default function StorefrontCatalog({ shop, petId, onClose }) {
  const { t } = useTranslation();
  const { data: products, isLoading } = useShopProducts(shop?.id);

  // ── cart + checkout: reused verbatim from the original shop.jsx ShopCatalogModal ──
  const [cart, setCart] = useState({}); // productId -> qty
  const checkout = useShopCheckout();

  const reset = () => setCart({});

  const cartLines = useMemo(() => {
    if (!products) return [];
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([pid, qty]) => {
        const product = products.find((p) => String(p.id) === String(pid));
        return product ? { product, qty } : null;
      })
      .filter(Boolean);
  }, [cart, products]);

  const total = cartLines.reduce(
    (sum, l) => sum + l.product.price_cents * l.qty,
    0,
  );

  const setQty = (productId, delta, stockQty) => {
    setCart((prev) => {
      const next = Math.max(0, Math.min(stockQty ?? 99, (prev[productId] ?? 0) + delta));
      return { ...prev, [productId]: next };
    });
  };

  const doCheckout = async () => {
    if (!petId) {
      Alert.alert("Add a pet first", "Set up a pet to check out.");
      return;
    }
    if (cartLines.length === 0) return;
    try {
      const res = await checkout.mutateAsync({
        petId,
        provider_id: shop.id,
        items: cartLines.map((l) => ({
          product_id: l.product.id,
          quantity: l.qty,
        })),
        rail: "mercadopago",
      });
      const payUrl = res.checkoutUrl || res.deeplink;
      if (payUrl) {
        // Send the buyer to MercadoPago. The order stays PENDING until the payment
        // webhook confirms it — so we must NOT tell them it's "placed"/on its way yet.
        Linking.openURL(payUrl).catch(() => {});
        Alert.alert(
          "Complete your payment",
          "Finish paying in MercadoPago to confirm your order. It isn't confirmed until your payment goes through.",
        );
        reset();
        onClose();
      } else {
        // 201 but no checkout URL → payment could NOT be started. Never claim success:
        // nothing was charged. Keep the cart open so the buyer can retry.
        Alert.alert(
          "Payment couldn't start",
          "We couldn't open the payment window, so nothing was charged. Please try again.",
        );
      }
    } catch (e) {
      Alert.alert("Couldn't check out", e.message || "Please try again.");
    }
  };
  // ─────────────────────────────────────────────────────────────────────────────

  // Browsing UI state (new): in-store search, category filter, favorites, and which
  // product's detail is open. Favorites are session-local this phase (no backend yet).
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null); // null = all
  const [favorites, setFavorites] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);

  const toggleFavorite = (id) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const categories = useMemo(() => {
    const set = new Set(
      (products ?? []).map((p) => p.category).filter((c) => !!c),
    );
    return Array.from(set);
  }, [products]);

  const visibleProducts = useMemo(() => {
    const list = products ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return (
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    });
  }, [products, query, category]);

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
            <EmptyState body={t("storefront.noProducts")} />
          </View>
        ) : (
          <RefreshableScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 }}>
            {/* Search within the store */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.sm,
                backgroundColor: COLORS.card,
                borderRadius: RADIUS.control,
                borderWidth: 1,
                borderColor: COLORS.peach,
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.sm + 2,
                marginBottom: SPACING.md,
              }}
            >
              <Search size={18} color={COLORS.mutedBrown} />
              <TextInput
                testID="storefront-search"
                value={query}
                onChangeText={setQuery}
                placeholder={t("storefront.searchInStore")}
                placeholderTextColor={COLORS.mutedBrown}
                autoCorrect={false}
                style={[TYPE.subhead, { flex: 1, color: COLORS.warmBrown, padding: 0 }]}
              />
            </View>

            {/* Category chips (only when the store tags categories) */}
            {categories.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: SPACING.md }}
                contentContainerStyle={{ gap: SPACING.sm }}
              >
                {[null, ...categories].map((c) => {
                  const selected = category === c;
                  const label = c == null ? t("storefront.allCategories") : c;
                  return (
                    <PressableScale
                      key={c ?? "__all"}
                      testID={`storefront-cat-${c ?? "all"}`}
                      onPress={() => setCategory(c)}
                      accessibilityState={{ selected }}
                      style={{
                        paddingHorizontal: SPACING.md + 2,
                        paddingVertical: SPACING.sm,
                        borderRadius: RADIUS.chip,
                        backgroundColor: selected ? COLORS.coral : COLORS.card,
                        borderWidth: 1,
                        borderColor: COLORS.peach,
                      }}
                    >
                      <Text
                        style={[
                          TYPE.subhead,
                          { fontWeight: "700", color: selected ? "#fff" : COLORS.warmBrown },
                        ]}
                      >
                        {label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* Product grid */}
            {visibleProducts.length === 0 ? (
              <EmptyState body={t("storefront.noProducts")} />
            ) : (
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}
              >
                {visibleProducts.map((p) => (
                  <ProductGridCard
                    key={p.id}
                    product={p}
                    t={t}
                    isFavorite={favorites.has(p.id)}
                    onToggleFavorite={() => toggleFavorite(p.id)}
                    onPress={() => setDetailId(p.id)}
                  />
                ))}
              </View>
            )}
          </RefreshableScrollView>
        )}

        {/* Cart bar — verbatim from the original shop flow. */}
        {cartLines.length > 0 ? (
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
            contentStyle={{ padding: SPACING.lg }}
          >
            <PressableScale
              testID="storefront-checkout"
              onPress={doCheckout}
              disabled={checkout.isPending}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.control,
                paddingVertical: 15,
                alignItems: "center",
                opacity: checkout.isPending ? 0.6 : 1,
              }}
            >
              <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
                {checkout.isPending
                  ? "Checking out…"
                  : `Checkout · ${money(total, shop?.currency)}`}
              </Text>
            </PressableScale>
          </GlassSurface>
        ) : null}
      </View>
    </Modal>
  );
}

function ProductGridCard({ product, onPress, onToggleFavorite, isFavorite, t }) {
  const soldOut = product.stock_qty <= 0;
  return (
    <PressableScale
      testID={`storefront-product-${product.id}`}
      onPress={onPress}
      style={{ width: "48%", marginBottom: SPACING.md }}
    >
      <Card
        level="sm"
        radius={RADIUS.md}
        borderColor={COLORS.peach}
        style={{ padding: SPACING.sm + 2, opacity: soldOut ? 0.6 : 1 }}
      >
        <View>
          {Array.isArray(product.image_urls) && product.image_urls[0] ? (
            <Image
              source={{ uri: product.image_urls[0] }}
              style={{ width: "100%", height: 110, borderRadius: RADIUS.control, backgroundColor: COLORS.sand }}
            />
          ) : (
            <View
              style={{
                width: "100%",
                height: 110,
                borderRadius: RADIUS.control,
                backgroundColor: COLORS.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Package size={26} color={COLORS.coral} />
            </View>
          )}
          <PressableScale
            testID={`storefront-fav-${product.id}`}
            onPress={onToggleFavorite}
            accessibilityLabel={t("storefront.favorite")}
            hitSlop={8}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              backgroundColor: COLORS.card,
              borderRadius: 999,
              padding: 5,
            }}
          >
            <Heart
              size={16}
              color={COLORS.coral}
              fill={isFavorite ? COLORS.coral : "none"}
            />
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
          <Text
            style={[TYPE.subhead, { fontWeight: "800", color: COLORS.warmBrown, flexShrink: 1 }]}
            numberOfLines={1}
          >
            {product.name}
          </Text>
          {product.is_rx ? <RxBadge /> : null}
        </View>
        <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.coral, marginTop: 2 }]}>
          {money(product.price_cents, product.currency)}
        </Text>
        <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "500", letterSpacing: 0, marginTop: 2 }]}>
          {soldOut ? t("storefront.soldOut") : t("storefront.inStock", { count: product.stock_qty })}
        </Text>
      </Card>
    </PressableScale>
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

function RxBadge() {
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

function EmptyState({ body }) {
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
