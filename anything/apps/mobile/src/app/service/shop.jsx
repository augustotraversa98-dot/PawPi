import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ShoppingBag,
  ChevronRight,
  RefreshCw,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useDiscoverProviders,
  useShopOrders,
  useShopSubscriptions,
  useCreateShopSubscription,
  useUpdateShopSubscription,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";
import StorefrontCatalog from "@/components/Providers/StorefrontCatalog";
import { formatMoney } from "@/utils/money";

// SHOP / e-commerce (ticket 2.11) — the owner browses PUBLISHED shop providers (real data, no
// mocks), opens a shop's CATALOG, adds products to a CART, CHECKS OUT (pays via the 2.3
// payment layer — split → provider payout), reviews ORDER HISTORY, and manages AUTO-REORDER
// SUBSCRIPTIONS. Discovery is the SHARED /api/providers/discover?type=shop (capability match,
// 2.1). An Rx product is blocked at checkout unless the pet has a vet relationship (the Rx
// gate, server-enforced). RLS (0037) is the real guard. Empty → empty states; no fake data.

const TAB_KEYS = ["browse", "orders", "subs"];

// Delegates to the shared formatter (src/utils/money.js) so shop and provider
// screens always render the same price identically. Returns "" (not null) so
// existing string interpolations stay clean.
function money(cents, currency = "ARS") {
  return formatMoney(cents, currency) ?? "";
}

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const TAB_LABELS = {
    browse: t("shop.tabBrowse"),
    orders: t("shop.tabOrders"),
    subs: t("shop.tabAutoReorder"),
  };
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const [tab, setTab] = useState("browse");
  const [openShop, setOpenShop] = useState(null); // the shop whose catalog is open

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            {t("shop.title")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("shop.subtitle")}
          </Text>
        </View>
      </GlassSurface>

      {/* Tab switcher */}
      <View style={{ flexDirection: "row", gap: SPACING.sm, padding: SPACING.lg, paddingBottom: SPACING.xs }}>
        {TAB_KEYS.map((key) => {
          const selected = tab === key;
          return (
            <PressableScale
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: SPACING.lg - 2,
                paddingVertical: SPACING.sm,
                borderRadius: RADIUS.chip,
                borderWidth: 1,
                borderColor: selected ? COLORS.coral : COLORS.peach,
                backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
              }}
            >
              <Text
                style={[
                  TYPE.subhead,
                  { color: selected ? COLORS.coral : COLORS.warmBrown },
                ]}
              >
                {TAB_LABELS[key]}
              </Text>
            </PressableScale>
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

      <StorefrontCatalog
        shop={openShop}
        petId={petId}
        onClose={() => setOpenShop(null)}
      />
    </View>
  );
}

function BrowseTab({ onOpenShop }) {
  const { t } = useTranslation();
  const { data: shops, isLoading, isError, refetch } = useDiscoverProviders("shop");

  return (
    <RefreshableScrollView
      refetch={refetch}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
    >
      <SectionLabel>{t("shop.shopsNearYou")}</SectionLabel>
      {isLoading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <EmptyState
          title={t("shop.couldNotLoadShops")}
          body={t("shop.pullDownRetry")}
        />
      ) : !shops || shops.length === 0 ? (
        <EmptyState
          title={t("shop.noShopsYet")}
          body={t("shop.shopsComingSoon")}
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
    <PressableScale onPress={onPress}>
      <Card
        level="sm"
        radius={RADIUS.card}
        borderColor={COLORS.peach}
        style={{
          padding: SPACING.lg,
          marginBottom: SPACING.lg - 2,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.lg - 2,
        }}
      >
        {shop.logo_url ? (
          <Image
            source={{ uri: shop.logo_url }}
            style={{ width: 52, height: 52, borderRadius: RADIUS.control, backgroundColor: COLORS.sand }}
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: RADIUS.control,
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
            style={[TYPE.headline, { fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }]}
            numberOfLines={1}
          >
            {shop.name}
          </Text>
          <RatingBadge avgRating={shop.avg_rating} reviewCount={shop.review_count} />
          {shop.bio ? (
            <Text
              style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}
              numberOfLines={2}
            >
              {shop.bio}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={COLORS.mutedBrown} />
      </Card>
    </PressableScale>
  );
}

function OrdersTab() {
  const { t } = useTranslation();
  const { data: orders, isLoading, isError, refetch } = useShopOrders();
  return (
    <RefreshableScrollView
      refetch={refetch}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
    >
      <SectionLabel>{t("shop.yourOrders")}</SectionLabel>
      {isLoading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <EmptyState title={t("shop.couldNotLoadOrders")} body={t("shop.pullDownRetry")} />
      ) : !orders || orders.length === 0 ? (
        <EmptyState
          title={t("shop.noOrdersYet")}
          body={t("shop.ordersEmptyBody")}
        />
      ) : (
        orders.map((o) => <OrderCard key={o.id} order={o} />)
      )}
    </RefreshableScrollView>
  );
}

function OrderCard({ order }) {
  const { t } = useTranslation();
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <Card
      level="sm"
      radius={RADIUS.md}
      borderColor={COLORS.peach}
      style={{ padding: SPACING.lg, marginBottom: SPACING.md }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown }]}>
          {order.provider_name || t("shop.shopFallback")}
        </Text>
        <StatusPill status={order.fulfillment_status || order.status} />
      </View>
      <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "700", marginTop: SPACING.xs }]}>
        {money(order.amount_cents, order.currency)}
      </Text>
      {items.map((it) => (
        <Text key={it.id} style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}>
          {it.quantity} × {it.name}
        </Text>
      ))}
      <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "500", letterSpacing: 0, marginTop: SPACING.sm }]}>
        {t("shop.paymentLabel", { status: order.status })}
      </Text>
    </Card>
  );
}

function SubscriptionsTab() {
  const { t } = useTranslation();
  const { data: subs, isLoading, isError, refetch } = useShopSubscriptions();
  const update = useUpdateShopSubscription();

  const cancel = (id) => {
    Alert.alert(t("shop.cancelConfirmTitle"), t("shop.cancelConfirmBody"), [
      { text: t("shop.keep"), style: "cancel" },
      {
        text: t("shop.cancelPlan"),
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
      <SectionLabel>{t("shop.autoReorder")}</SectionLabel>
      {isLoading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <EmptyState title={t("shop.couldNotLoadPlans")} body={t("shop.pullDownRetry")} />
      ) : !subs || subs.length === 0 ? (
        <EmptyState
          title={t("shop.noAutoReorder")}
          body={t("shop.autoReorderEmptyBody")}
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
  const { t } = useTranslation();
  return (
    <Card
      level="sm"
      radius={RADIUS.md}
      borderColor={COLORS.peach}
      style={{ padding: SPACING.lg, marginBottom: SPACING.md }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 }}>
          <RefreshCw size={16} color={COLORS.coral} />
          <Text
            style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown }]}
            numberOfLines={1}
          >
            {sub.product_name || t("shop.productFallback")}
          </Text>
        </View>
        <StatusPill status={sub.status} />
      </View>
      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}>
        {sub.quantity} × · {sub.plan} · {sub.provider_name || ""}
      </Text>
      {sub.status !== "cancelled" ? (
        <PressableScale
          onPress={onCancel}
          style={{ marginTop: SPACING.md, alignSelf: "flex-start" }}
        >
          <Text style={[TYPE.subhead, { fontWeight: "700", color: COLORS.terracotta }]}>
            {t("shop.cancelAutoReorder")}
          </Text>
        </PressableScale>
      ) : null}
    </Card>
  );
}

function StatusPill({ status }) {
  const { t } = useTranslation();
  const map = {
    placed: { label: t("shop.status.placed"), color: COLORS.mutedBrown },
    paid: { label: t("shop.status.paid"), color: COLORS.coral },
    shipped: { label: t("shop.status.shipped"), color: "#3FA34D" },
    delivered: { label: t("shop.status.delivered"), color: "#3FA34D" },
    cancelled: { label: t("shop.status.cancelled"), color: COLORS.mutedBrown },
    pending: { label: t("shop.status.pending"), color: COLORS.mutedBrown },
    active: { label: t("shop.status.active"), color: COLORS.coral },
    paused: { label: t("shop.status.paused"), color: COLORS.mutedBrown },
    refunded: { label: t("shop.status.refunded"), color: COLORS.mutedBrown },
  };
  const s = map[status] || { label: status, color: COLORS.mutedBrown };
  return (
    <View
      style={{
        backgroundColor: s.color + "22",
        borderRadius: RADIUS.chip,
        paddingHorizontal: SPACING.sm + 2,
        paddingVertical: 3,
      }}
    >
      <Text style={[TYPE.caption, { fontWeight: "800", color: s.color, letterSpacing: 0 }]}>{s.label}</Text>
    </View>
  );
}

function SectionLabel({ children, style }) {
  return (
    <Text
      style={[
        TYPE.subhead,
        {
          fontWeight: "800",
          color: COLORS.mutedBrown,
          marginBottom: SPACING.lg - 2,
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
    <Card
      level="sm"
      radius={RADIUS.card}
      borderColor={COLORS.peach}
      style={{
        padding: SPACING.xxl + SPACING.xs,
        alignItems: "center",
      }}
    >
      <ShoppingBag size={32} color={COLORS.mutedBrown} />
      <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.md }]}>
        {title}
      </Text>
      <Text
        style={[
          TYPE.subhead,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginTop: SPACING.xs + 2,
            textAlign: "center",
          },
        ]}
      >
        {body}
      </Text>
    </Card>
  );
}
