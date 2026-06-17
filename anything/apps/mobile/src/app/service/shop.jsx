import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ShoppingBag,
  ChevronRight,
  Plus,
  Minus,
  X,
  Package,
  RefreshCw,
  Pill,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useDiscoverProviders,
  useShopProducts,
  useShopCheckout,
  useShopOrders,
  useShopSubscriptions,
  useCreateShopSubscription,
  useUpdateShopSubscription,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";

// SHOP / e-commerce (ticket 2.11) — the owner browses PUBLISHED shop providers (real data, no
// mocks), opens a shop's CATALOG, adds products to a CART, CHECKS OUT (pays via the 2.3
// payment layer — split → provider payout), reviews ORDER HISTORY, and manages AUTO-REORDER
// SUBSCRIPTIONS. Discovery is the SHARED /api/providers/discover?type=shop (capability match,
// 2.1). An Rx product is blocked at checkout unless the pet has a vet relationship (the Rx
// gate, server-enforced). RLS (0037) is the real guard. Empty → empty states; no fake data.

const TABS = [
  { key: "browse", label: "Browse" },
  { key: "orders", label: "Orders" },
  { key: "subs", label: "Auto-reorder" },
];

function money(cents, currency = "ARS") {
  if (cents == null) return "";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const [tab, setTab] = useState("browse");
  const [openShop, setOpenShop] = useState(null); // the shop whose catalog is open

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>
            Shop 🛍️
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Food, toys, and supplies — delivered
          </Text>
        </View>
      </View>

      {/* Tab switcher */}
      <View style={{ flexDirection: "row", gap: 8, padding: 16, paddingBottom: 4 }}>
        {TABS.map((t) => {
          const selected = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? COLORS.coral : COLORS.peach,
                backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: selected ? COLORS.coral : COLORS.warmBrown,
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "browse" ? (
        <BrowseTab onOpenShop={setOpenShop} />
      ) : tab === "orders" ? (
        <OrdersTab />
      ) : (
        <SubscriptionsTab />
      )}

      <ShopCatalogModal
        shop={openShop}
        petId={petId}
        onClose={() => setOpenShop(null)}
      />
    </View>
  );
}

function BrowseTab({ onOpenShop }) {
  const { data: shops, isLoading, isError, refetch } = useDiscoverProviders("shop");

  return (
    <RefreshableScrollView
      refetch={refetch}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
    >
      <SectionLabel>SHOPS NEAR YOU</SectionLabel>
      {isLoading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <EmptyState
          title="Couldn't load shops"
          body="Something went wrong. Pull down to try again."
        />
      ) : !shops || shops.length === 0 ? (
        <EmptyState
          title="No shops available yet"
          body="Check back soon — pet shops are joining PawPi."
        />
      ) : (
        shops.map((s) => (
          <ShopCard key={s.id} shop={s} onPress={() => onOpenShop(s)} />
        ))
      )}
    </RefreshableScrollView>
  );
}

function ShopCard({ shop, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 16,
        marginBottom: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      {shop.logo_url ? (
        <Image
          source={{ uri: shop.logo_url }}
          style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.sand }}
        />
      ) : (
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ShoppingBag size={24} color={COLORS.coral} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }}
          numberOfLines={1}
        >
          {shop.name}
        </Text>
        <RatingBadge avgRating={shop.avg_rating} reviewCount={shop.review_count} />
        {shop.bio ? (
          <Text
            style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}
            numberOfLines={2}
          >
            {shop.bio}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={20} color={COLORS.mutedBrown} />
    </TouchableOpacity>
  );
}

// A shop's catalog + cart + checkout. The cart is local state; checkout posts to the backend
// which prices each line from the catalog, refuses out-of-stock + Rx-without-vet, then pays
// via the 2.3 layer.
function ShopCatalogModal({ shop, petId, onClose }) {
  const { data: products, isLoading } = useShopProducts(shop?.id);
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
      if (res.checkoutUrl) {
        Linking.openURL(res.checkoutUrl).catch(() => {});
        Alert.alert("Order placed", "Complete your payment in the checkout window.");
      } else {
        Alert.alert("Order placed", "Your order is on its way.");
      }
      reset();
      onClose();
    } catch (e) {
      // Surfaces the backend's "Out of stock", Rx-required, or "payments not configured".
      Alert.alert("Couldn't check out", e.message || "Please try again.");
    }
  };

  return (
    <Modal
      visible={!!shop}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
            backgroundColor: COLORS.card,
          }}
        >
          <Text
            style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown }}
            numberOfLines={1}
          >
            {shop?.name || "Shop"}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={22} color={COLORS.warmBrown} />
          </TouchableOpacity>
        </View>

        <RefreshableScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
          {isLoading ? (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <ActivityIndicator color={COLORS.coral} />
            </View>
          ) : !products || products.length === 0 ? (
            <EmptyState
              title="No products yet"
              body="This shop hasn't listed any products."
            />
          ) : (
            products.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                qty={cart[p.id] ?? 0}
                onAdd={() => setQty(p.id, 1, p.stock_qty)}
                onRemove={() => setQty(p.id, -1, p.stock_qty)}
              />
            ))
          )}
        </RefreshableScrollView>

        {/* Cart bar */}
        {cartLines.length > 0 ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: 16,
              backgroundColor: COLORS.card,
              borderTopWidth: 1,
              borderTopColor: COLORS.peach,
            }}
          >
            <TouchableOpacity
              onPress={doCheckout}
              disabled={checkout.isPending}
              activeOpacity={0.9}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: 16,
                paddingVertical: 15,
                alignItems: "center",
                opacity: checkout.isPending ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
                {checkout.isPending
                  ? "Checking out…"
                  : `Checkout · ${money(total, shop?.currency)}`}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function ProductRow({ product, qty, onAdd, onRemove }) {
  const soldOut = product.stock_qty <= 0;
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
        opacity: soldOut ? 0.6 : 1,
      }}
    >
      {Array.isArray(product.image_urls) && product.image_urls[0] ? (
        <Image
          source={{ uri: product.image_urls[0] }}
          style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.sand }}
        />
      ) : (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Package size={22} color={COLORS.coral} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown, flexShrink: 1 }}
            numberOfLines={1}
          >
            {product.name}
          </Text>
          {product.is_rx ? <RxBadge /> : null}
        </View>
        <Text style={{ fontSize: 13, color: COLORS.coral, fontWeight: "700", marginTop: 2 }}>
          {money(product.price_cents, product.currency)}
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.mutedBrown, marginTop: 2 }}>
          {soldOut ? "Sold out" : `${product.stock_qty} in stock`}
        </Text>
      </View>

      {soldOut ? null : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {qty > 0 ? (
            <>
              <TouchableOpacity onPress={onRemove} accessibilityLabel="Remove one">
                <Minus size={20} color={COLORS.warmBrown} />
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}>
                {qty}
              </Text>
            </>
          ) : null}
          <TouchableOpacity onPress={onAdd} accessibilityLabel="Add to cart">
            <Plus size={20} color={COLORS.coral} />
          </TouchableOpacity>
        </View>
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
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 2,
      }}
    >
      <Pill size={11} color={COLORS.terracotta} />
      <Text style={{ fontSize: 10, fontWeight: "800", color: COLORS.terracotta }}>Rx</Text>
    </View>
  );
}

function OrdersTab() {
  const { data: orders, isLoading, isError, refetch } = useShopOrders();
  return (
    <RefreshableScrollView
      refetch={refetch}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
    >
      <SectionLabel>YOUR ORDERS</SectionLabel>
      {isLoading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <EmptyState title="Couldn't load orders" body="Pull down to try again." />
      ) : !orders || orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          body="Your purchases will show up here."
        />
      ) : (
        orders.map((o) => <OrderCard key={o.id} order={o} />)
      )}
    </RefreshableScrollView>
  );
}

function OrderCard({ order }) {
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}>
          {order.provider_name || "Shop"}
        </Text>
        <StatusPill status={order.fulfillment_status || order.status} />
      </View>
      <Text style={{ fontSize: 13, color: COLORS.coral, fontWeight: "700", marginTop: 4 }}>
        {money(order.amount_cents, order.currency)}
      </Text>
      {items.map((it) => (
        <Text key={it.id} style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}>
          {it.quantity} × {it.name}
        </Text>
      ))}
      <Text style={{ fontSize: 11, color: COLORS.mutedBrown, marginTop: 8 }}>
        Payment: {order.status}
      </Text>
    </View>
  );
}

function SubscriptionsTab() {
  const { data: subs, isLoading, isError, refetch } = useShopSubscriptions();
  const update = useUpdateShopSubscription();

  const cancel = (id) => {
    Alert.alert("Cancel auto-reorder?", "You can resubscribe anytime.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel plan",
        style: "destructive",
        onPress: () => update.mutate({ id, status: "cancelled" }),
      },
    ]);
  };

  return (
    <RefreshableScrollView
      refetch={refetch}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
    >
      <SectionLabel>AUTO-REORDER</SectionLabel>
      {isLoading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <EmptyState title="Couldn't load plans" body="Pull down to try again." />
      ) : !subs || subs.length === 0 ? (
        <EmptyState
          title="No auto-reorder plans"
          body="Subscribe to a product to have it delivered on a schedule."
        />
      ) : (
        subs.map((s) => (
          <SubscriptionCard key={s.id} sub={s} onCancel={() => cancel(s.id)} />
        ))
      )}
    </RefreshableScrollView>
  );
}

function SubscriptionCard({ sub, onCancel }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <RefreshCw size={16} color={COLORS.coral} />
          <Text
            style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}
            numberOfLines={1}
          >
            {sub.product_name || "Product"}
          </Text>
        </View>
        <StatusPill status={sub.status} />
      </View>
      <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}>
        {sub.quantity} × · {sub.plan} · {sub.provider_name || ""}
      </Text>
      {sub.status !== "cancelled" ? (
        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.85}
          style={{ marginTop: 12, alignSelf: "flex-start" }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.terracotta }}>
            Cancel auto-reorder
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function StatusPill({ status }) {
  const map = {
    placed: { label: "Placed", color: COLORS.mutedBrown },
    paid: { label: "Paid", color: COLORS.coral },
    shipped: { label: "Shipped", color: "#3FA34D" },
    delivered: { label: "Delivered", color: "#3FA34D" },
    cancelled: { label: "Cancelled", color: COLORS.mutedBrown },
    pending: { label: "Pending", color: COLORS.mutedBrown },
    active: { label: "Active", color: COLORS.coral },
    paused: { label: "Paused", color: COLORS.mutedBrown },
    refunded: { label: "Refunded", color: COLORS.mutedBrown },
  };
  const s = map[status] || { label: status, color: COLORS.mutedBrown };
  return (
    <View
      style={{
        backgroundColor: s.color + "22",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "800", color: s.color }}>{s.label}</Text>
    </View>
  );
}

function SectionLabel({ children, style }) {
  return (
    <Text
      style={[
        {
          fontSize: 13,
          fontWeight: "800",
          color: COLORS.mutedBrown,
          marginBottom: 14,
          letterSpacing: 0.6,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function EmptyState({ title, body }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 28,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <ShoppingBag size={32} color={COLORS.mutedBrown} />
      <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 12 }}>
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: COLORS.mutedBrown,
          marginTop: 6,
          textAlign: "center",
        }}
      >
        {body}
      </Text>
    </View>
  );
}
