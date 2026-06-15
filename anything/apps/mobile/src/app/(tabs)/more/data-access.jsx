import React from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
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

// Human-readable labels for each scope a provider may request. Unknown scopes
// fall through to their raw string so a new backend scope never crashes the UI.
const SCOPE_LABELS = {
  medical_read: "View medical records",
  medical_write: "Add vet notes",
  vaccinations_write: "Add vaccinations",
  appointments: "Manage appointments",
  health_logs_read: "View health logs",
  health_logs_write: "Add health logs",
  messaging: "Messaging",
};

function scopeLabel(scope) {
  return SCOPE_LABELS[scope] || scope;
}

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

// A grant is "currently active" only when status === 'active' AND it has not
// expired. expires_at is a DERIVED expiry: active + a past expires_at is treated
// as no-longer-active (assertCareAccess stops honoring it), so the UI hides it
// from "Who has access".
function isExpired(grant) {
  if (!grant.expires_at) return false;
  return new Date(grant.expires_at).getTime() <= Date.now();
}

// The owner's trust screen: see who has (or has requested) access to the active
// pet's record, approve/deny pending requests, and revoke active access.
// docs/provider-design.md §2 + §4 item 7. Pet-scoped via useCurrentPet, exactly
// like the Vet Record it is reached from.
export default function DataAccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const { data: grants, isLoading, isError, refetch } =
    useCareAccessGrants(petId);
  const updateGrant = useUpdateGrant(petId);

  const act = (grantId, action) => {
    updateGrant.mutate(
      { grantId, action },
      {
        onError: (err) =>
          Alert.alert("Something went wrong", err.message || "Please try again."),
      },
    );
  };

  const confirmDeny = (grant) =>
    Alert.alert(
      "Deny request?",
      `${grant.provider_name || "This provider"} will not get access to ${grant.pet_name || "your pet"}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Deny", style: "destructive", onPress: () => act(grant.id, "deny") },
      ],
    );

  const confirmRevoke = (grant) =>
    Alert.alert(
      "Revoke access?",
      `${grant.provider_name || "This provider"} will immediately lose access to ${grant.pet_name || "your pet"}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Revoke", style: "destructive", onPress: () => act(grant.id, "revoke") },
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
      <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
        <ArrowLeft size={22} color={COLORS.warmBrown} />
      </TouchableOpacity>
      <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
        Data Access
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
            No pet selected
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: COLORS.mutedBrown,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            Add or choose a pet to manage who can see its records.
          </Text>
        </View>
      </View>
    );
  }

  const all = grants ?? [];
  const pending = all.filter((g) => g.status === "pending");
  const active = all.filter((g) => g.status === "active" && !isExpired(g));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {header}

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        >
          {/* Reassurance copy, mirroring the Vet Record access-control message. */}
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
              You control who can see {currentPet.name}'s records. Approve a request
              to grant access, and revoke it anytime.
            </Text>
          </View>

          {isError ? (
            <Text
              style={{
                fontSize: 13,
                color: COLORS.terracotta,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              Couldn't load access requests. Pull to refresh.
            </Text>
          ) : null}

          {/* Pending requests */}
          <SectionTitle title="Pending requests" />
          {pending.length === 0 ? (
            <EmptyRow icon={Clock} text="No pending requests." />
          ) : (
            pending.map((g) => (
              <GrantCard key={g.id} grant={g}>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={() => act(g.id, "approve")}
                    disabled={updateGrant.isPending}
                    style={{
                      flex: 1,
                      backgroundColor: COLORS.sageDark,
                      borderRadius: 12,
                      paddingVertical: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Check size={16} color="#FFF" />
                    <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 14 }}>
                      Approve
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDeny(g)}
                    disabled={updateGrant.isPending}
                    style={{
                      flex: 1,
                      backgroundColor: COLORS.card,
                      borderRadius: 12,
                      paddingVertical: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      borderWidth: 1.5,
                      borderColor: COLORS.peach,
                    }}
                  >
                    <X size={16} color={COLORS.terracotta} />
                    <Text
                      style={{ color: COLORS.warmBrown, fontWeight: "700", fontSize: 14 }}
                    >
                      Deny
                    </Text>
                  </TouchableOpacity>
                </View>
              </GrantCard>
            ))
          )}

          {/* Who has access */}
          <View style={{ height: 8 }} />
          <SectionTitle title="Who has access" />
          {active.length === 0 ? (
            <EmptyRow icon={ShieldCheck} text="No one has access yet." />
          ) : (
            active.map((g) => (
              <GrantCard key={g.id} grant={g} granted>
                {g.expires_at ? (
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.mutedBrown,
                      marginTop: 8,
                    }}
                  >
                    Access until {formatDate(g.expires_at)}
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => confirmRevoke(g)}
                  disabled={updateGrant.isPending}
                  style={{
                    marginTop: 14,
                    backgroundColor: COLORS.card,
                    borderRadius: 12,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderWidth: 1.5,
                    borderColor: COLORS.peach,
                  }}
                >
                  <X size={16} color={COLORS.terracotta} />
                  <Text
                    style={{ color: COLORS.terracotta, fontWeight: "800", fontSize: 14 }}
                  >
                    Revoke access
                  </Text>
                </TouchableOpacity>
              </GrantCard>
            ))
          )}
        </RefreshableScrollView>
      )}
    </View>
  );
}

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

// Shared card: provider identity, the request line, and the scopes. `granted`
// switches the line from "wants access to" → "has access to" and shows when it
// was granted. Children are the per-status actions.
function GrantCard({ grant, granted, children }) {
  const scopes = Array.isArray(grant.scopes) ? grant.scopes : [];
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
            {grant.provider_name || "Provider"}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}>
            {granted ? "has access to" : "wants access to"}{" "}
            {grant.pet_name || "your pet"}
          </Text>
        </View>
      </View>

      {scopes.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {scopes.map((s) => (
            <View
              key={s}
              style={{
                backgroundColor: COLORS.sand,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.terracotta }}>
                {scopeLabel(s)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {granted && grant.granted_at ? (
        <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 10 }}>
          Granted {formatDate(grant.granted_at)}
        </Text>
      ) : null}

      {children}
    </View>
  );
}
