import React, { useMemo, useState } from "react";
import { View, Text, Image, ScrollView, TextInput } from "react-native";
import { Search, Heart, Package, Plus } from "lucide-react-native";
import { Card, PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { money, RxBadge, CatalogEmptyState } from "./catalogShared";

// The in-store browse surface (PR-3a extraction; presentational only): search + category chips +
// product grid, exactly as they render in the StorefrontCatalog modal today. It owns NO cart or
// checkout — that lives in useStorefrontCart. `onQuickAdd` / `cartQtyFor` are accepted for the
// PR-3b inline surface; in the modal, tapping a card just opens the product detail (unchanged).
export default function StorefrontBrowse({
  products = [],
  favorites,
  onToggleFavorite,
  onOpenDetail,
  cartQtyFor,
  onQuickAdd,
  // The inline provider storefront (PR-3b) shows a quick "+" per card; the catalog modal does
  // not (tapping a card opens the detail there). Off by default → the modal is unchanged.
  showQuickAdd = false,
  t,
}) {
  // In-store search + category filter (session-local, same as the modal today).
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null); // null = all

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

  return (
    <>
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
        <CatalogEmptyState body={t("storefront.noProducts")} />
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
              onToggleFavorite={() => onToggleFavorite(p.id)}
              onPress={() => onOpenDetail(p.id)}
              showQuickAdd={showQuickAdd}
              qty={cartQtyFor ? cartQtyFor(p.id) : 0}
              onQuickAdd={() => onQuickAdd?.(p)}
            />
          ))}
        </View>
      )}
    </>
  );
}

function ProductGridCard({
  product,
  onPress,
  onToggleFavorite,
  isFavorite,
  showQuickAdd,
  qty = 0,
  onQuickAdd,
  t,
}) {
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
          {/* Quick "+" add (inline storefront only; sold-out cards aren't addable). */}
          {showQuickAdd && !soldOut ? (
            <View
              style={{
                position: "absolute",
                bottom: 6,
                right: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              {qty > 0 ? (
                <Text
                  testID={`storefront-qty-${product.id}`}
                  style={[TYPE.caption, { fontWeight: "800", color: "#FFF", letterSpacing: 0 }]}
                >
                  {qty}
                </Text>
              ) : null}
              <PressableScale
                testID={`storefront-quickadd-${product.id}`}
                onPress={onQuickAdd}
                accessibilityRole="button"
                accessibilityLabel={t("storefront.addToCart")}
                hitSlop={8}
                style={{
                  backgroundColor: COLORS.coral,
                  borderRadius: 999,
                  width: 30,
                  height: 30,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={18} color="#FFF" />
              </PressableScale>
            </View>
          ) : null}
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
