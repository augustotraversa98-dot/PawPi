import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
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
import { useSearch, useDebouncedValue } from "@/hooks/useSearch";
import {
  usePetGrants,
  useSharedWithMe,
  useInviteCaregiver,
  useRespondGrant,
  useRevokeGrant,
} from "@/hooks/usePetSharing";
import CaregiverLogWalkModal from "@/components/Pets/CaregiverLogWalkModal";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  sage: "#A7BFA3",
  sageDark: "#5A8A74",
  sand: "#F8EBDD",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
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
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  // FF2: the shared pet a family caregiver is logging a walk for ({ id, name } | null).
  const [logWalkPet, setLogWalkPet] = useState(null);

  const [tab, setTab] = useState("manage"); // 'manage' | 'shared'
  const [role, setRole] = useState("family");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const { data: results, isFetching } = useSearch(debounced);

  const { data: grants, isLoading: grantsLoading } = usePetGrants(petId);
  const { data: shared, isLoading: sharedLoading } = useSharedWithMe();
  const invite = useInviteCaregiver(petId);
  const respond = useRespondGrant();
  const revoke = useRevokeGrant(petId);

  const handleInvite = (owner) => {
    if (!petId) return;
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
        <TouchableOpacity testID="sharing-back" onPress={() => router.back()} style={{ marginRight: 12 }}>
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "manage" ? (
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
                    @{g.grantee_username}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                    {ROLE_LABEL[g.role]} · {g.status}
                  </Text>
                </View>
                <TouchableOpacity testID={`revoke-${g.id}`} onPress={() => revoke.mutate(g.id)}>
                  <Trash2 size={18} color={C.terracotta} />
                </TouchableOpacity>
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
                    {t("petSharing.sharedFrom", { username: g.owner_username, roleLabel: ROLE_LABEL[g.role], status: g.status })}
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
                    <TouchableOpacity
                      testID={`decline-${g.id}`}
                      onPress={() => respond.mutate({ grantId: g.id, accept: false })}
                      style={{ backgroundColor: C.sand, borderRadius: 10, padding: 8 }}
                    >
                      <X size={16} color={C.terracotta} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: "700", color: C.sageDark }}>{t("petSharing.activeChip")}</Text>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

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
