import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useBottomClearance from "@/hooks/useBottomClearance";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ShieldCheck,
  Shield,
  Stethoscope,
  Check,
  X,
  Clock,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  useCareAccessGrants,
  useUpdateGrant,
} from "@/hooks/useCareAccessGrants";
import { useMyBookings } from "@/hooks/useProviders";
import { friendlyErrorMessage } from "@/utils/appAlert";
import { goBackOr } from "@/utils/navigationBack";
import ShareWithVetSheet from "@/components/Health/VetShare/ShareWithVetSheet";
import GrantAccess from "@/components/Health/VetShare/GrantAccess";
import RecordLinks from "@/components/Health/VetShare/RecordLinks";
import ShareOffers from "@/components/Health/VetShare/ShareOffers";
import { useRecordLinks } from "@/hooks/useRecordLinks";
import { useShareOffers } from "@/hooks/useShareOffers";
import { useSharingLive } from "@/hooks/useSharingLive";
import {
  asksForRecord,
  grantAccessLines,
  hasBookingForPet,
  isGrantActive,
  isGrantEnded,
  sectionsSupported,
} from "@/utils/vetShare";

// The owner's trust screen: see who has (or has requested) access to the active
// pet's record, approve/deny pending requests, and revoke active access.
// docs/provider-design.md §2 + §4 item 7. Pet-scoped via useCurrentPet, exactly
// like the Vet Record it is reached from.
export default function DataAccessScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomClearance = useBottomClearance();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const { data: grants, isLoading, isError, refetch } =
    useCareAccessGrants(petId);
  const updateGrant = useUpdateGrant(petId);
  // A vet answers on another phone: what this screen shows is read again while something is waiting.
  useSharingLive();
  const bookings = useMyBookings();
  const refetchBookings = bookings.refetch;
  // A request may have just arrived (this screen is where its notification leads): never rely on cached lists.
  useEffect(() => {
    if (!petId) return;
    refetch();
    refetchBookings();
  }, [petId, refetch, refetchBookings]);
  // Only the owner has record links and invitations (RecordLinks and ShareOffers below read the same lists).
  const isOwner = !!petId && !currentPet?.is_shared;
  const links = useRecordLinks({ enabled: isOwner });
  const offers = useShareOffers({ enabled: isOwner });
  const refreshAll = () =>
    Promise.all([
      refetch(),
      refetchBookings(),
      ...(currentPet?.is_shared ? [] : [links.refetch(), offers.refetch()]),
    ]);
  // null = closed. { provider } shares with that one only (answering its request); {} lets the owner pick.
  const [shareSheet, setShareSheet] = useState(null);

  // State changes too late to stop a second confirmation in the same moment, and a confirmation opened before a change
  // was applied would send it again: both are checked against the latest list.
  const changing = useRef(false);
  const latest = useRef(grants);
  latest.current = grants;
  const act = (grantId, action) => {
    if (changing.current) return;
    const current = latest.current?.find((g) => g.id === grantId);
    if (current && current.status !== (action === "revoke" ? "active" : "pending")) return;
    changing.current = true;
    updateGrant.mutate(
      { grantId, action },
      {
        onError: (err) =>
          Alert.alert(t("dataAccess.errorTitle"), friendlyErrorMessage(err, "dataAccess.tryAgain")),
        onSettled: () => {
          changing.current = false;
        },
      },
    );
  };

  // Approving a request as asked grants every scope in it, so the confirmation spells each one out first.
  const confirmApprove = (grant) => {
    const pet = grant.pet_name || t("dataAccess.yourPet");
    Alert.alert(
      t(asksForRecord(grant) ? "dataAccess.approveAllTitle" : "dataAccess.approveTitle"),
      t("dataAccess.approveBody", {
        provider: grant.provider_name || t("dataAccess.thisProvider"),
        pet,
        list: grantAccessLines(grant, t, pet).map((line) => `• ${line}`).join("\n"),
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("dataAccess.approve"), onPress: () => act(grant.id, "approve") },
      ],
    );
  };

  const confirmDeny = (grant) =>
    Alert.alert(
      t("dataAccess.denyTitle"),
      t("dataAccess.denyBody", {
        provider: grant.provider_name || t("dataAccess.thisProvider"),
        pet: grant.pet_name || t("dataAccess.yourPet"),
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("dataAccess.deny"), style: "destructive", onPress: () => act(grant.id, "deny") },
      ],
    );

  const confirmRevoke = (grant) =>
    Alert.alert(
      t("dataAccess.revokeTitle"),
      t("dataAccess.revokeBody", {
        provider: grant.provider_name || t("dataAccess.thisProvider"),
        pet: grant.pet_name || t("dataAccess.yourPet"),
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("dataAccess.revoke"), style: "destructive", onPress: () => act(grant.id, "revoke") },
      ],
    );

  const header = (
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
        {t("dataAccess.title")}
      </Text>
    </View>
  );

  if (!currentPet) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        {header}
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 32,
          }}
        >
          <Shield size={32} color={COLORS.mutedBrown} />
          <Text
            style={{
              fontSize: 16,
              fontWeight: "800",
              color: COLORS.warmBrown,
              marginTop: 12,
            }}
          >
            {t("dataAccess.noPetTitle")}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: COLORS.mutedBrown,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            {t("dataAccess.noPetBody")}
          </Text>
        </View>
      </View>
    );
  }

  const all = grants ?? [];
  const pending = all.filter((g) => g.status === "pending");
  const active = all.filter((g) => isGrantActive(g));
  const ended = all.filter((g) => isGrantEnded(g));
  const canChooseSections = sectionsSupported(all);

  const revokeButton = (g) => (
    <TouchableOpacity
      testID={`data-access-revoke-${g.id}`}
      accessibilityRole="button"
      onPress={() => confirmRevoke(g)}
      disabled={updateGrant.isPending}
      style={[outlineButton, { marginTop: 14 }]}
    >
      <X size={16} color={COLORS.terracotta} />
      <Text style={{ color: COLORS.terracotta, fontWeight: "800", fontSize: 14 }}>
        {t("dataAccess.revokeCta")}
      </Text>
    </TouchableOpacity>
  );

  const pendingActions = (g) => {
    const record = asksForRecord(g);
    // A business with no booking for this dog (every invite by link) is never approved "as asked": the owner chooses
    // the sections or denies, after checking who it is.
    const booked = hasBookingForPet(bookings.data, g.provider_id, g.pet_id ?? petId);
    const choose = canChooseSections && (record || !booked);
    return (
      <View style={{ marginTop: 14, gap: 10 }}>
        {!booked ? (
          <Text
            testID={`data-access-check-name-${g.id}`}
            style={{ fontSize: 13, fontWeight: "700", color: COLORS.warmBrown, lineHeight: 18 }}
          >
            {t("vetShare.checkName", { provider: g.provider_name || t("dataAccess.thisProvider") })}
          </Text>
        ) : null}
        {choose ? (
          <>
            <Text style={{ fontSize: 12, color: COLORS.mutedBrown, lineHeight: 17 }}>
              {t("dataAccess.chooseHint")}
            </Text>
            <TouchableOpacity
              testID={`data-access-choose-${g.id}`}
              accessibilityRole="button"
              onPress={() =>
                setShareSheet({
                  provider: { providerId: g.provider_id, name: g.provider_name, checkName: !booked },
                })
              }
              style={[filledButton, { backgroundColor: COLORS.coral }]}
            >
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 14 }}>
                {t("dataAccess.choose")}
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {booked ? (
            <TouchableOpacity
              testID={`data-access-approve-${g.id}`}
              accessibilityRole="button"
              onPress={() => confirmApprove(g)}
              disabled={updateGrant.isPending}
              style={[choose ? outlineButton : [filledButton, { backgroundColor: COLORS.sageDark }], { flex: 1 }]}
            >
              <Check size={16} color={choose ? COLORS.warmBrown : "#FFF"} />
              <Text
                style={{
                  color: choose ? COLORS.warmBrown : "#FFF",
                  fontWeight: "800",
                  fontSize: 14,
                  flexShrink: 1,
                  textAlign: "center",
                }}
              >
                {t(record ? "dataAccess.approveAll" : "dataAccess.approve")}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            testID={`data-access-deny-${g.id}`}
            accessibilityRole="button"
            onPress={() => confirmDeny(g)}
            disabled={updateGrant.isPending}
            style={[outlineButton, { flex: 1 }]}
          >
            <X size={16} color={COLORS.terracotta} />
            <Text style={{ color: COLORS.warmBrown, fontWeight: "700", fontSize: 14 }}>
              {t("dataAccess.deny")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {header}

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refreshAll}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomClearance + 32 }}
        >
          {/* What this screen covers, and what it does not. */}
          <View
            style={{
              backgroundColor: "#E3F2FD",
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
              borderWidth: 1.5,
              borderColor: "#BBDEFB",
              flexDirection: "row",
              gap: 12,
            }}
          >
            <ShieldCheck size={20} color="#1976D2" style={{ marginTop: 2 }} />
            <Text
              style={{
                fontSize: 13,
                color: "#0D47A1",
                lineHeight: 19,
                flex: 1,
                fontWeight: "600",
              }}
            >
              {t("dataAccess.reassurance", { name: currentPet.name })}
            </Text>
          </View>

          {/* Only the dog's owner can give access, so a family member is not offered it. */}
          {!currentPet.is_shared ? (
            <TouchableOpacity
              testID="data-access-share"
              accessibilityRole="button"
              onPress={() => setShareSheet({})}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: 14,
                paddingVertical: 14,
                marginBottom: 20,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 15 }}>
                {t("vetShare.title")}
              </Text>
            </TouchableOpacity>
          ) : null}

          {isError ? (
            <Text
              style={{
                fontSize: 13,
                color: COLORS.terracotta,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              {t("dataAccess.loadError")}
            </Text>
          ) : null}

          {/* Pending requests */}
          <SectionTitle title={t("dataAccess.pendingSection")} />
          {pending.length === 0 ? (
            <EmptyRow icon={Clock} text={t("dataAccess.noPending")} />
          ) : (
            pending.map((g) => (
              <GrantCard key={g.id} grant={g} relation="dataAccess.wantsAccessTo">
                {pendingActions(g)}
              </GrantCard>
            ))
          )}

          {/* Invitations to a vet that are waiting for its answer. */}
          {!currentPet.is_shared ? <ShareOffers pet={currentPet} /> : null}

          {/* Who has access */}
          <View style={{ height: 8 }} />
          <SectionTitle title={t("dataAccess.accessSection")} />
          {active.length === 0 ? (
            <EmptyRow icon={ShieldCheck} text={t("dataAccess.noAccess")} />
          ) : (
            active.map((g) => (
              <GrantCard key={g.id} grant={g} relation="dataAccess.hasAccessTo">
                {revokeButton(g)}
              </GrantCard>
            ))
          )}

          {/* Links that open parts of the record without signing in. */}
          {!currentPet.is_shared ? <RecordLinks pet={currentPet} /> : null}

          {ended.length > 0 ? (
            <>
              <View style={{ height: 8 }} />
              <SectionTitle title={t("dataAccess.endedSection")} />
              {ended.map((g) => (
                <GrantCard key={g.id} grant={g} relation="dataAccess.hadAccessTo">
                  {g.status === "active" ? revokeButton(g) : null}
                </GrantCard>
              ))}
            </>
          ) : null}
        </RefreshableScrollView>
      )}

      {shareSheet ? (
        <ShareWithVetSheet
          pet={currentPet}
          provider={shareSheet.provider}
          onClose={() => setShareSheet(null)}
          // The pending requests are on this screen, right behind the sheet.
          onOpenRequests={() => setShareSheet(null)}
        />
      ) : null}
    </View>
  );
}

const filledButton = {
  borderRadius: 12,
  paddingVertical: 12,
  paddingHorizontal: 10,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

const outlineButton = [
  filledButton,
  { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.peach },
];

function SectionTitle({ title }) {
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: "800",
        color: COLORS.mutedBrown,
        marginBottom: 12,
        letterSpacing: 0.6,
      }}
    >
      {title.toUpperCase()}
    </Text>
  );
}

function EmptyRow({ icon: Icon, text }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.peach,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Icon size={18} color={COLORS.mutedBrown} />
      <Text style={{ fontSize: 14, color: COLORS.mutedBrown }}>{text}</Text>
    </View>
  );
}

// Shared card: provider identity, how it relates to the pet, and exactly what it opens (or asks to open) until
// when. Children are the per-status actions.
function GrantCard({ grant, relation, children }) {
  const { t } = useTranslation();
  const petName = grant.pet_name || t("dataAccess.yourPet");
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Stethoscope size={22} color={COLORS.coral} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>
            {grant.provider_name || t("dataAccess.provider")}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}>
            {t(relation)} {petName}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 6 }}>
        <GrantAccess grant={grant} petName={petName} />
      </View>

      {children}
    </View>
  );
}
