import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ShieldCheck, Heart, ChevronRight, Store } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useAdoptionFavorites, useFollowedProviders } from "@/hooks/useProviders";
import { useAllCareAccessGrants } from "@/hooks/useCareAccessGrants";

// MY HUB (Phase 2 ticket 2.14) — the owner's account-style hub. Bookings, orders, auto-reorder
// and pet-friendly places moved to the Services tab's "My Activity" pane (two-pane redesign),
// so this now SURFACES + LINKS INTO only the account-scoped surfaces that don't belong there:
//   - Who has access(GET /api/care-access/grants — care_access_grants, 2.x)
//   - Saved dogs    (GET /api/adoption/favorites — favorited adoption listings, 2.12)
// Every read is OWNER-scoped server-side; no fake metrics. Empty → empty states. Tapping a
// section opens the real feature screen.

function isGrantActive(g) {
  if (g.status !== "active") return false;
  if (!g.expires_at) return true;
  return new Date(g.expires_at).getTime() > Date.now();
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

function Row({ primary, secondary, badge, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
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
            marginRight: onPress ? 4 : 0,
          }}
        >
          {badge}
        </Text>
      ) : null}
      {onPress ? <ChevronRight size={16} color={COLORS.peach} /> : null}
    </TouchableOpacity>
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

  const { t } = useTranslation();
  const grants = useAllCareAccessGrants();
  const favorites = useAdoptionFavorites();
  const followed = useFollowedProviders();

  const activeGrants = (grants.data ?? []).filter(isGrantActive);
  const favList = favorites.data ?? [];
  const followedList = followed.data ?? [];

  const loading = grants.isLoading && favorites.isLoading;

  const refetch = () => {
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

          {/* Businesses you follow (ticket 2.92) */}
          <SectionCard
            title={t("storefront.follow.listTitle")}
            Icon={Store}
            count={followedList.length}
            onPress={() => router.push("/service/following")}
          >
            {followedList.length === 0 ? (
              <Empty text={t("storefront.follow.listEmpty")} />
            ) : (
              followedList.slice(0, 4).map((p) => (
                <Row key={p.id} primary={p.name} secondary={p.provider_type || ""} />
              ))
            )}
          </SectionCard>
        </RefreshableScrollView>
      )}
    </View>
  );
}
