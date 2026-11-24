import React, { useState } from "react";
import { Alert } from "react-native";
import { COLORS } from "@/constants/theme";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Search,
  Users,
  Trash2,
  Check,
  X,
  ShieldCheck,
  Heart,
  PawPrint,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { usePetPermissions } from "@/hooks/usePetPermissions";
import { SharedPetBadge } from "@/components/Pets/SharedPetBadge";
import { grantStatusLabel, granteeLabel } from "@/utils/sharingLabels";
import { useSearch, useDebouncedValue } from "@/hooks/useSearch";
import {
  usePetGrants,
  useSharedWithMe,
  useInviteCaregiver,
  useRespondGrant,
  useRevokeGrant,
  useLeaveGrant,
} from "@/hooks/usePetSharing";
import CaregiverLogWalkModal from "@/components/Pets/CaregiverLogWalkModal";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";

const C = {
  cream: COLORS.cream,
  card: COLORS.card,
  coral: COLORS.coral,
  peach: COLORS.peach,
  terracotta: COLORS.terracotta,
  sage: COLORS.sage,
  sageDark: COLORS.sageDark,
  sand: COLORS.sand,
  warmBrown: COLORS.warmBrown,
  mutedBrown: COLORS.mutedBrown,
};

const useRoleLabel = () => {
  const { t } = useTranslation();
  return {
    family: t("petSharing.roleFamilyLabel"),
    caregiver: t("petSharing.roleCaregiverLabel"),
  };
};

export default function PetSharingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const ROLE_LABEL = useRoleLabel();
  const { data: currentPet, isLoading: petLoading } = useCurrentPet();
  const petId = currentPet?.id;
  // Managing who has access is the OWNER's. When the active dog is one SHARED with this person (family / caregiver) the Manage tab explains
  // who decides instead of offering invite / revoke (the server would refuse them).
  const { can, ownerName } = usePetPermissions();
  const canManage = can("manageSharing");

  // FF2: the shared pet a family caregiver is logging a walk for ({ id, name } | null).
  const [logWalkPet, setLogWalkPet] = useState(null);

  const [tab, setTab] = useState("manage"); // 'manage' | 'shared'
  const [role, setRole] = useState("family");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const { data: results, isFetching } = useSearch(debounced);

  const { data: grants, isLoading: grantsLoading } = usePetGrants(canManage ? petId : null);
  const { data: shared, isLoading: sharedLoading } = useSharedWithMe();
  const invite = useInviteCaregiver(petId);
  const respond = useRespondGrant();
  const revoke = useRevokeGrant(petId);
  const leave = useLeaveGrant();

  const confirmLeave = (g) => {
    Alert.alert(
      t("sharedDog.leaveConfirmTitle", { name: g.pet_name }),
      t("sharedDog.leaveConfirmBody", { name: g.pet_name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("sharedDog.leave"), style: "destructive", onPress: () => leave.mutate(g.id) },
      ],
    );
  };

  const handleInvite = (owner) => {
    if (!petId || !canManage) return;
    // (AUDIT A-26) Guard against a double-tap sending two invites for the same
    // caregiver while the first is still in flight.
    if (invite.isPending) return;
    invite.mutate({ granteeUserId: owner.id, granteeUsername: owner.username, role });
    setQuery("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity accessibilityLabel={t("common.back")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="sharing-back" onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
          {t("petSharing.screenTitle")}
        </Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 14 }}>
        {[
          { key: "manage", label: t("petSharing.tabManage") },
          { key: "shared", label: t("petSharing.tabShared") },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            testID={`tab-${key}`}
            onPress={() => setTab(key)}
            style={{
              paddingVertical: 9,
              paddingHorizontal: 16,
              borderRadius: 20,
              backgroundColor: tab === key ? C.sageDark : C.sand,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: tab === key ? "#FFF" : C.warmBrown }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "manage" && !petId ? (
          // No active dog (still loading, or the account has none). This screen must NEVER navigate away or
          // route to onboarding from here — a loading/empty pets read is not a reason to leave. Loading shows a
          // spinner; no dog shows a plain explanation (the "Shared with me" tab still works: a person with no
          // dog of their own can be a caregiver for someone else's).
          petLoading ? (
            <ActivityIndicator color={C.sage} testID="pet-sharing-loading" />
          ) : (
            <View testID="pet-sharing-no-pet" style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 12 }}>
              <PawPrint size={36} color={C.sage} />
              <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown, marginTop: 14, textAlign: "center" }}>
                {t("petSharing.noPetTitle")}
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown, marginTop: 8, lineHeight: 20, textAlign: "center" }}>
                {t("petSharing.noPetBody")}
              </Text>
            </View>
          )
        ) : tab === "manage" && !canManage ? (
          // The active dog is SHARED with this person: only the owner invites / removes people.
          <View testID="pet-sharing-owner-only" style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 12 }}>
            <SharedPetBadge pet={currentPet} align="center" />
            <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown, marginTop: 14, textAlign: "center" }}>
              {t("sharedDog.manageOwnerOnlyTitle")}
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown, marginTop: 8, lineHeight: 20, textAlign: "center" }}>
              {ownerName
                ? t("sharedDog.manageOwnerOnlyBody", { owner: ownerName, name: currentPet?.name || t("common.yourPet") })
                : t("sharedDog.manageOwnerOnlyBodyNoName", { name: currentPet?.name || t("common.yourPet") })}
            </Text>
            <TouchableOpacity
              testID="open-household"
              accessibilityRole="button"
              onPress={() => router.push("/household")}
              style={{ marginTop: 16, backgroundColor: C.sageDark, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20 }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800" }}>{t("sharedDog.householdCta")}</Text>
            </TouchableOpacity>
          </View>
        ) : tab === "manage" ? (
          <>
            <Text style={{ fontSize: 14, color: C.mutedBrown, marginBottom: 14, lineHeight: 20 }}>
              {t("petSharing.intro", { name: currentPet?.name || t("common.yourPet") })}
            </Text>

            {/* Role selector */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                testID="role-family"
                onPress={() => setRole("family")}
                style={[styles.roleBtn, role === "family" && styles.roleActive]}
              >
                <Heart size={15} color={role === "family" ? "#FFF" : C.warmBrown} />
                <Text style={[styles.roleText, role === "family" && styles.roleTextActive]}>{t("petSharing.roleFamily")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="role-caregiver"
                onPress={() => setRole("caregiver")}
                style={[styles.roleBtn, role === "caregiver" && styles.roleActive]}
              >
                <ShieldCheck size={15} color={role === "caregiver" ? "#FFF" : C.warmBrown} />
                <Text style={[styles.roleText, role === "caregiver" && styles.roleTextActive]}>
                  {t("petSharing.roleCaregiver")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Invite search */}
            <View style={styles.searchRow}>
              <Search size={16} color={C.mutedBrown} />
              <TextInput
                testID="invite-search"
                value={query}
                onChangeText={setQuery}
                placeholder={t("petSharing.searchPlaceholder")}
                placeholderTextColor={C.mutedBrown + "90"}
                style={{ flex: 1, fontSize: 15, color: C.warmBrown }}
              />
              {isFetching && <ActivityIndicator size="small" color={C.sage} />}
            </View>

            {results?.owners?.map((owner) => (
              <TouchableOpacity
                key={owner.id}
                testID={`invite-${owner.id}`}
                onPress={() => handleInvite(owner)}
                style={styles.resultRow}
              >
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                  @{owner.username}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.coral }}>{t("petSharing.invite")}</Text>
              </TouchableOpacity>
            ))}

            {/* Existing grants */}
            <Text style={styles.sectionLabel}>{t("petSharing.whoHasAccess")}</Text>
            {grantsLoading && <ActivityIndicator color={C.sage} />}
            {!grantsLoading && grants && grants.length === 0 && (
              <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                {t("petSharing.noAccessYet")}
              </Text>
            )}
            {grants?.map((g) => (
              <View key={g.id} testID={`grant-${g.id}`} style={styles.grantRow}>
                <View
                  style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: g.role === "family" ? C.coral + "22" : C.sage + "33",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Users size={18} color={g.role === "family" ? C.coral : C.sageDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                    {granteeLabel(t, g.grantee_username)}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                    {ROLE_LABEL[g.role]} · {grantStatusLabel(t, g.status)}
                  </Text>
                </View>
                {g.status === "active" || g.status === "pending" ? (
                  <TouchableOpacity accessibilityLabel={t("common.delete")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID={`revoke-${g.id}`} onPress={() => revoke.mutate(g.id)}>
                    <Trash2 size={18} color={C.terracotta} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>{t("petSharing.petsSharedWithMe")}</Text>
            {sharedLoading && <ActivityIndicator color={C.sage} />}
            {!sharedLoading && shared && shared.length === 0 && (
              <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                {t("petSharing.noSharedYet")}
              </Text>
            )}
            {shared?.map((g) => (
              <View key={g.id} testID={`shared-${g.id}`} style={styles.grantRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                    {g.pet_name}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                    {t("petSharing.sharedFrom", { username: g.owner_username, roleLabel: ROLE_LABEL[g.role], status: grantStatusLabel(t, g.status) })}
                  </Text>
                  {/* FF2: a FAMILY caregiver on an ACTIVE grant can log day-to-day care (a Viewer
                      cannot — the server rejects a health write, and 0049 keeps it read-only). */}
                  {g.status === "active" && g.role === "family" ? (
                    <TouchableOpacity
                      testID={`log-walk-${g.id}`}
                      onPress={() => setLogWalkPet({ id: g.pet_id, name: g.pet_name })}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        alignSelf: "flex-start",
                        marginTop: 8,
                        backgroundColor: C.coral + "1A",
                        borderRadius: 10,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                      }}
                    >
                      <PawPrint size={14} color={C.coral} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: C.coral }}>
                        {t("caregiverLog.logWalkCta")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {g.status === "pending" ? (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      testID={`accept-${g.id}`}
                      onPress={() => respond.mutate({ grantId: g.id, accept: true })}
                      style={{ backgroundColor: C.sageDark, borderRadius: 10, padding: 8 }}
                    >
                      <Check size={16} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityLabel={t("common.close")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      testID={`decline-${g.id}`}
                      onPress={() => respond.mutate({ grantId: g.id, accept: false })}
                      style={{ backgroundColor: C.sand, borderRadius: 10, padding: 8 }}
                    >
                      <X size={16} color={C.terracotta} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: C.sageDark }}>{t("petSharing.activeChip")}</Text>
                    <TouchableOpacity
                      testID={`leave-${g.id}`}
                      accessibilityRole="button"
                      disabled={leave.isPending}
                      onPress={() => confirmLeave(g)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: C.terracotta }}>{t("sharedDog.leave")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </KeyboardAwareScrollView>

      {/* FF2: family caregiver quick "Log a walk" for a shared pet. */}
      <CaregiverLogWalkModal
        visible={!!logWalkPet}
        petId={logWalkPet?.id}
        petName={logWalkPet?.name}
        onClose={() => setLogWalkPet(null)}
      />
    </View>
  );
}

const styles = {
  roleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.peach,
  },
  roleActive: { backgroundColor: C.sageDark, borderColor: C.sageDark },
  roleText: { fontSize: 14, fontWeight: "700", color: C.warmBrown },
  roleTextActive: { color: "#FFF" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.peach,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.peach,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.mutedBrown,
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 12,
  },
  grantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.peach,
  },
};
