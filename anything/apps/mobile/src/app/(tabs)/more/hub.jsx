import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useBottomClearance from "@/hooks/useBottomClearance";
import { useRouter } from "expo-router";
import { ArrowLeft, ShieldCheck, Heart, ChevronRight, Store } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useAdoptionFavorites, useFollowedProviders } from "@/hooks/useProviders";
import { useWhoHasAccess } from "@/hooks/useWhoHasAccess";
import { useSharingLive } from "@/hooks/useSharingLive";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { accessEntryKey, accessEntryTitle, orderForDog } from "@/utils/whoHasAccess";
import { goBackOr } from "@/utils/navigationBack";
import { breedLabel } from "@/data/dogBreeds";
import { providerTypeLabel } from "@/utils/providerTypeLabel";

// MY HUB (Phase 2 ticket 2.14) — the owner's account-style hub. Bookings, orders, auto-reorder
// and pet-friendly places moved to the Services tab's "My Activity" pane (two-pane redesign),
// so this now SURFACES + LINKS INTO only the account-scoped surfaces that don't belong there:
//   - Who has access(hooks/useWhoHasAccess — the same list Data Access shows, all dogs)
//   - Saved dogs    (GET /api/adoption/favorites — favorited adoption listings, 2.12)
// Every read is OWNER-scoped server-side; no fake metrics. Empty → empty states. Tapping a
// section opens the real feature screen.

function SectionCard({ title, Icon, count, countTestID, onPress, children }) {
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
            <Text testID={countTestID} style={{ fontSize: 12, fontWeight: "800", color: COLORS.terracotta }}>
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
  const bottomClearance = useBottomClearance();
  const router = useRouter();

  const { t } = useTranslation();
  const access = useWhoHasAccess();
  const { data: currentPet } = useCurrentPet();
  // Access also changes on other phones and screens: read it again when this one is returned to.
  useSharingLive();
  const favorites = useAdoptionFavorites();
  const followed = useFollowedProviders();

  // Not known until read: no count and no "no one has access" before then.
  const entries = access.data ? orderForDog(access.data.entries, currentPet?.id) : null;
  const favList = favorites.data ?? [];
  const followedList = followed.data ?? [];

  const loading = access.isLoading && favorites.isLoading;

  const refetch = () => {
    access.refetch();
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
        <TouchableOpacity accessibilityLabel={t("common.back")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={() => goBackOr(router, "/(tabs)/more")} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
          {t("screensUi.hub.myHub")}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomClearance + 32 }}
        >
          {/* Who has access */}
          <SectionCard
            title={t("screensUi.hub.whoHasAccess")}
            Icon={ShieldCheck}
            count={entries?.length}
            countTestID="hub-access-count"
            onPress={() => router.push("/(tabs)/more/data-access")}
          >
            {!entries ? (
              access.isError ? (
                <Empty text={t("whoHasAccess.loadError")} />
              ) : (
                <ActivityIndicator color={COLORS.coral} />
              )
            ) : entries.length === 0 ? (
              <Empty text={t("leftoverUi.hub.noAccess")} />
            ) : (
              <>
                {entries.slice(0, 4).map((e) => (
                  <Row
                    key={accessEntryKey(e)}
                    primary={accessEntryTitle(e, t)}
                    secondary={t("leftoverUi.hub.accessTo", { name: e.pet_name || t("routineCard.yourPet") })}
                    badge={t("screensUi.hub.activeBadge")}
                  />
                ))}
                {entries.length > 4 ? (
                  <Empty text={t("whoHasAccess.more", { count: entries.length - 4 })} />
                ) : null}
              </>
            )}
          </SectionCard>

          {/* Saved dogs */}
          <SectionCard
            title={t("screensUi.hub.savedDogs")}
            Icon={Heart}
            count={favList.length}
            onPress={() => router.push("/service/adoption")}
          >
            {favList.length === 0 ? (
              <Empty text={t("leftoverUi.hub.noSavedListings")} />
            ) : (
              favList.slice(0, 4).map((f) => (
                <Row
                  key={f.id}
                  primary={f.listing_name || t("leftoverUi.hub.dog")}
                  secondary={`${breedLabel(t, f.listing_breed) || ""}${
                    f.provider_name ? ` · ${f.provider_name}` : ""
                  }`}
                  badge={
                    f.listing_status
                      ? t(`business.adoption.listingStatus.${f.listing_status}`, {
                          defaultValue: f.listing_status,
                        })
                      : null
                  }
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
                <Row key={p.id} primary={p.name} secondary={providerTypeLabel(t, p.provider_type)} />
              ))
            )}
          </SectionCard>
        </RefreshableScrollView>
      )}
    </View>
  );
}
