import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  ShoppingBag,
  ShieldCheck,
  RefreshCw,
  Heart,
  ChevronRight,
  Clock,
  MapPin,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useMyBookings,
  useShopOrders,
  useShopSubscriptions,
  useAdoptionFavorites,
} from "@/hooks/useProviders";
import { useAllCareAccessGrants } from "@/hooks/useCareAccessGrants";

// MY HUB (Phase 2 ticket 2.14) — the owner's single place tying the super-app together. It
// SURFACES + LINKS INTO the existing per-feature screens; it does NOT duplicate them. Sections:
//   - My bookings   (GET /api/me/bookings — upcoming/past across ALL services, 2.4)
//   - My orders     (GET /api/shop/orders — shop order history, 2.11)
//   - Auto-reorder  (GET /api/shop/subscriptions — shop subscriptions, 2.3/2.11)
//   - Who has access(GET /api/care-access/grants — care_access_grants, 2.x)
//   - Saved dogs    (GET /api/adoption/favorites — favorited adoption listings, 2.12)
// Every read is OWNER-scoped server-side (owner_user_id = me); no cross-owner data, no fake
// metrics. Empty → empty states. Tapping a section opens the real feature screen.

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function isGrantActive(g) {
  if (g.status !== "active") return false;
  if (!g.expires_at) return true;
  return new Date(g.expires_at).getTime() > Date.now();
}

function money(cents, currency = "ARS") {
  if (cents == null) return "";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function SectionCard({ title, Icon, count, onPress, children }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.85 : 1}
        disabled={!onPress}
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon size={20} color={COLORS.coral} />
        </View>
        <Text
          style={{ flex: 1, fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}
        >
          {title}
        </Text>
        {typeof count === "number" ? (
          <View
            style={{
              backgroundColor: COLORS.peach,
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 2,
              marginRight: onPress ? 4 : 0,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.terracotta }}>
              {count}
            </Text>
          </View>
        ) : null}
        {onPress ? <ChevronRight size={18} color={COLORS.peach} /> : null}
      </TouchableOpacity>
      {children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </View>
  );
}

function Row({ primary, secondary, badge }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.cream,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.warmBrown }}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
            {secondary}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "700",
            color: COLORS.terracotta,
            textTransform: "capitalize",
          }}
        >
          {badge}
        </Text>
      ) : null}
    </View>
  );
}

function Empty({ text }) {
  return (
    <Text style={{ fontSize: 13, color: COLORS.mutedBrown, paddingVertical: 6 }}>
      {text}
    </Text>
  );
}

export default function MyHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const bookings = useMyBookings();
  const orders = useShopOrders();
  const subs = useShopSubscriptions();
  const grants = useAllCareAccessGrants();
  const favorites = useAdoptionFavorites();

  const upcoming = bookings.data?.upcoming ?? [];
  const past = bookings.data?.past ?? [];
  const orderList = orders.data ?? [];
  const subList = (subs.data ?? []).filter((s) => s.status === "active");
  const activeGrants = (grants.data ?? []).filter(isGrantActive);
  const favList = favorites.data ?? [];

  const loading =
    bookings.isLoading &&
    orders.isLoading &&
    subs.isLoading &&
    grants.isLoading &&
    favorites.isLoading;

  const refetch = () => {
    bookings.refetch();
    orders.refetch();
    subs.refetch();
    grants.refetch();
    favorites.refetch();
  };

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
        <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
          My Hub
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        >
          {/* My bookings — across all services */}
          <SectionCard
            title="My bookings"
            Icon={Calendar}
            count={upcoming.length}
          >
            {upcoming.length === 0 && past.length === 0 ? (
              <Empty text="No bookings yet." />
            ) : (
              <>
                {upcoming.slice(0, 4).map((b) => (
                  <Row
                    key={b.id}
                    primary={`${b.provider_name || "Provider"} · ${b.pet_name || "Pet"}`}
                    secondary={`${b.service_name || b.capability || "Booking"} · ${formatDate(
                      b.appointment_date,
                    )}`}
                    badge={b.booking_status}
                  />
                ))}
                {upcoming.length === 0 && past.length > 0 ? (
                  <Empty text="No upcoming bookings — see past visits below." />
                ) : null}
                {past.slice(0, 3).map((b) => (
                  <Row
                    key={b.id}
                    primary={`${b.provider_name || "Provider"} · ${b.pet_name || "Pet"}`}
                    secondary={`Past · ${formatDate(b.appointment_date)}`}
                    badge={b.status}
                  />
                ))}
              </>
            )}
          </SectionCard>

          {/* Pet-friendly places directory (ticket 2.73) */}
          <SectionCard
            title="Pet-friendly places"
            Icon={MapPin}
            onPress={() => router.push("/service/places")}
          >
            <Empty text="Find parks, cafés, hotels and more near you." />
          </SectionCard>

          {/* My orders — shop history */}
          <SectionCard
            title="My orders"
            Icon={ShoppingBag}
            count={orderList.length}
            onPress={() => router.push("/service/shop")}
          >
            {orderList.length === 0 ? (
              <Empty text="No orders yet." />
            ) : (
              orderList.slice(0, 4).map((o) => (
                <Row
                  key={o.id}
                  primary={o.provider_name || "Shop"}
                  secondary={`${money(o.amount_cents, o.currency)} · ${formatDate(
                    o.created_at,
                  )}`}
                  badge={o.fulfillment_status || o.status}
                />
              ))
            )}
          </SectionCard>

          {/* Auto-reorder subscriptions */}
          <SectionCard
            title="Auto-reorder"
            Icon={RefreshCw}
            count={subList.length}
            onPress={() => router.push("/service/shop")}
          >
            {subList.length === 0 ? (
              <Empty text="No active auto-reorder plans." />
            ) : (
              subList.slice(0, 4).map((s) => (
                <Row
                  key={s.id}
                  primary={s.product_name || s.provider_name || "Plan"}
                  secondary={`Every ${s.plan} · qty ${s.quantity}`}
                  badge={s.status}
                />
              ))
            )}
          </SectionCard>

          {/* Who has access */}
          <SectionCard
            title="Who has access"
            Icon={ShieldCheck}
            count={activeGrants.length}
            onPress={() => router.push("/(tabs)/more/data-access")}
          >
            {activeGrants.length === 0 ? (
              <Empty text="No one has access to your pets." />
            ) : (
              activeGrants.slice(0, 4).map((g) => (
                <Row
                  key={g.id}
                  primary={g.provider_name || "Provider"}
                  secondary={`Access to ${g.pet_name || "your pet"}`}
                  badge="active"
                />
              ))
            )}
          </SectionCard>

          {/* Saved dogs */}
          <SectionCard
            title="Saved dogs"
            Icon={Heart}
            count={favList.length}
            onPress={() => router.push("/service/adoption")}
          >
            {favList.length === 0 ? (
              <Empty text="No saved adoption listings." />
            ) : (
              favList.slice(0, 4).map((f) => (
                <Row
                  key={f.id}
                  primary={f.listing_name || "Dog"}
                  secondary={`${f.listing_breed || ""}${
                    f.provider_name ? ` · ${f.provider_name}` : ""
                  }`}
                  badge={f.listing_status}
                />
              ))
            )}
          </SectionCard>
        </RefreshableScrollView>
      )}
    </View>
  );
}
