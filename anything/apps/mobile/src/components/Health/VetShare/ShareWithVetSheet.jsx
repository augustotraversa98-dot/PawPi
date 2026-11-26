import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check, Circle, CircleDot, EyeOff, Square, SquareCheck } from "lucide-react-native";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";
import { useMyBookings } from "@/hooks/useProviders";
import {
  useCareAccessGrants,
  useCreateCareGrant,
  useUpdateGrant,
} from "@/hooks/useCareAccessGrants";
import { friendlyErrorMessage } from "@/utils/appAlert";
import { formatLocalDate } from "@/utils/localeDateTime";
import {
  VET_SHARE_SCOPE,
  bookedVetsForPet,
  isGrantExpired,
  shareBlockReason,
} from "@/utils/vetShare";

// Everything the medical_read grant lets a vet read, and what it does not. Keep both lists true to the server
// (supabase/migrations/0023, api/providers/[id]/pets/[petId]/record, api/media): this is the owner's consent.
// web/test/integration/vet-share-boundary.integration.test.ts fails if the database starts allowing more.
const INCLUDED = ["profile", "medicalProfile", "notes", "vaccines", "files"];

const SCOPE_KEYS = {
  medical_read: "medicalRead",
  medical_write: "medicalWrite",
  vaccinations_write: "vaccinationsWrite",
  appointments: "appointments",
  health_logs_read: "healthLogsRead",
  health_logs_write: "healthLogsWrite",
  messaging: "messaging",
};

const BLOCKED_KEYS = {
  shared: "vetShare.alreadyShared",
  pending: "vetShare.askedAccess",
  other: "vetShare.otherAccess",
};

const text = [TYPE.callout, { color: COLORS.warmBrown, lineHeight: 20 }];
const muted = [TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18 }];
const card = {
  backgroundColor: MATERIALS.surface,
  borderRadius: RADIUS.control,
  borderWidth: 1,
  borderColor: MATERIALS.hairline,
  padding: SPACING.lg,
  marginBottom: SPACING.sm,
};

function Heading({ children }) {
  return (
    <Text
      accessibilityRole="header"
      style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.lg, marginBottom: SPACING.sm }]}
    >
      {children}
    </Text>
  );
}

function SecondaryButton({ label, onPress, disabled, color = COLORS.terracotta, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{
        marginTop: SPACING.sm,
        borderRadius: RADIUS.control,
        borderWidth: 1.5,
        borderColor: MATERIALS.hairline,
        paddingVertical: 12,
        paddingHorizontal: SPACING.lg,
        alignItems: "center",
      }}
    >
      <Text style={[TYPE.callout, { fontWeight: "800", color, textAlign: "center" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function VetRow({ vet, name, blocked, selected, onPress }) {
  const { t } = useTranslation();
  const Icon = blocked ? Check : selected ? CircleDot : Circle;
  return (
    <TouchableOpacity
      testID={`vet-share-vet-${vet.providerId}`}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!blocked }}
      onPress={onPress}
      disabled={!!blocked}
      style={[card, { flexDirection: "row", alignItems: "center", gap: 12 }, selected && { borderColor: COLORS.coral, borderWidth: 2 }]}
    >
      <Icon size={20} color={blocked ? COLORS.mutedBrown : COLORS.coral} />
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.warmBrown }]}>{name}</Text>
        {blocked ? <Text style={muted}>{t(BLOCKED_KEYS[blocked])}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

/**
 * "Share with your vet": the owner gives a vet read access to the pet's medical record, and revokes it.
 * Mount it only while open (each opening starts with nothing selected and consent off).
 *
 * Props: pet ({ id, name, is_shared }), onClose, onOpenRequests (show the pending access requests).
 */
export default function ShareWithVetSheet({ pet, onClose, onOpenRequests }) {
  const { t } = useTranslation();
  const router = useRouter();
  const petId = pet?.id;
  const petName = pet?.name || t("dataAccess.yourPet");
  const isOwner = !pet?.is_shared;

  const bookings = useMyBookings();
  const grantsQuery = useCareAccessGrants(isOwner ? petId : null);
  const createGrant = useCreateCareGrant();
  const updateGrant = useUpdateGrant(petId);

  const [selectedId, setSelectedId] = useState(null);
  const [consent, setConsent] = useState(false);

  const grants = grantsQuery.data;
  const vets = bookedVetsForPet(bookings.data, petId);
  const vetName = (name) => name || t("dataAccess.thisProvider");
  // Nothing can be picked until we know who already has access.
  const ready = !!grants && !grantsQuery.isError && !!bookings.data && !bookings.isError;
  const loadFailed = grantsQuery.isError || bookings.isError;
  const selected = ready
    ? vets.find((v) => String(v.providerId) === selectedId && !shareBlockReason(grants, v.providerId)) ?? null
    : null;
  const canSubmit = isOwner && !!selected && consent && !createGrant.isPending;

  // Active grants stay listed even when they ran out, so the owner can always revoke them.
  const active = (grants ?? []).filter((g) => g.status === "active");
  const pendingCount = (grants ?? []).filter((g) => g.status === "pending").length;

  const choose = (providerId) => {
    setSelectedId(String(providerId));
    setConsent(false); // consent names the vet, so it is asked again for another one
  };

  const submit = () => {
    if (!canSubmit) return;
    const vet = vetName(selected.name);
    createGrant.mutate(
      { petId, providerId: selected.providerId, scopes: [VET_SHARE_SCOPE] },
      {
        onSuccess: (result) => {
          setSelectedId(null);
          setConsent(false);
          if (result?.grant?.status !== "active") return;
          Alert.alert(
            t("vetShare.doneTitle"),
            t("vetShare.doneBody", { provider: vet, pet: petName }),
          );
        },
        onError: (e) =>
          Alert.alert(t("vetShare.errorTitle"), friendlyErrorMessage(e, "dataAccess.tryAgain")),
      },
    );
  };

  const confirmRevoke = (grant) =>
    Alert.alert(
      t("dataAccess.revokeTitle"),
      t("dataAccess.revokeBody", { provider: vetName(grant.provider_name), pet: petName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("dataAccess.revoke"),
          style: "destructive",
          onPress: () =>
            updateGrant.mutate(
              { grantId: grant.id, action: "revoke" },
              {
                onError: (e) =>
                  Alert.alert(t("dataAccess.errorTitle"), friendlyErrorMessage(e, "dataAccess.tryAgain")),
              },
            ),
        },
      ],
    );

  const retry = () => {
    bookings.refetch();
    grantsQuery.refetch();
  };

  const openEmergencyCard = () => {
    onClose();
    router.push(`/emergency-card?petId=${petId}`);
  };

  return (
    <KeyboardSafeFormModal
      visible
      onClose={onClose}
      title={t("vetShare.title")}
      subtitle={petName}
      ctaLabel={
        !isOwner
          ? t("common.close")
          : createGrant.isPending
            ? t("vetShare.sharing")
            : t("vetShare.cta")
      }
      ctaDisabled={isOwner && !canSubmit}
      onCtaPress={isOwner ? submit : onClose}
    >
      {!isOwner ? (
        <Text style={text}>{t("vetShare.ownerOnly", { pet: petName })}</Text>
      ) : (
        <>
          <Text style={text}>{t("vetShare.intro")}</Text>

          <Heading>{t("vetShare.includedTitle")}</Heading>
          <View style={card}>
            {INCLUDED.map((key) => (
              <View key={key} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                <Check size={16} color={COLORS.sageDark} style={{ marginTop: 2 }} />
                <Text style={[text, { flex: 1 }]}>{t(`vetShare.included.${key}`, { pet: petName })}</Text>
              </View>
            ))}
            <Text style={muted}>{t("vetShare.includedNote")}</Text>
          </View>
          <View style={[card, { flexDirection: "row", gap: 8 }]}>
            <EyeOff size={16} color={COLORS.mutedBrown} style={{ marginTop: 2 }} />
            <Text style={[muted, { flex: 1 }]}>{t("vetShare.excluded")}</Text>
          </View>

          <Heading>{t("vetShare.pickTitle")}</Heading>
          <Text style={[muted, { marginBottom: SPACING.sm }]}>{t("vetShare.pickHint", { pet: petName })}</Text>
          {loadFailed ? (
            <View style={card}>
              <Text style={text}>{t("vetShare.loadError")}</Text>
              <SecondaryButton label={t("vetShare.retry")} onPress={retry} />
            </View>
          ) : !ready ? (
            <ActivityIndicator color={COLORS.coral} />
          ) : vets.length === 0 ? (
            <View style={card}>
              <Text style={text}>{t("vetShare.noVets", { pet: petName })}</Text>
            </View>
          ) : (
            vets.map((vet) => (
              <VetRow
                key={vet.providerId}
                vet={vet}
                name={vetName(vet.name)}
                blocked={shareBlockReason(grants, vet.providerId)}
                selected={selected?.providerId === vet.providerId}
                onPress={() => choose(vet.providerId)}
              />
            ))
          )}

          {selected ? (
            <>
              <Heading>{t("vetShare.durationTitle")}</Heading>
              <Text style={text}>{t("vetShare.durationBody")}</Text>
              <TouchableOpacity
                testID="vet-share-consent"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
                onPress={() => setConsent((v) => !v)}
                style={[card, { flexDirection: "row", gap: 12, marginTop: SPACING.lg }]}
              >
                {consent ? (
                  <SquareCheck size={22} color={COLORS.coral} />
                ) : (
                  <Square size={22} color={COLORS.mutedBrown} />
                )}
                <Text style={[text, { flex: 1, fontWeight: "600" }]}>
                  {t("vetShare.consent", { provider: vetName(selected.name), pet: petName })}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          <Heading>{t("vetShare.sharedTitle")}</Heading>
          {pendingCount > 0 ? (
            <View style={card}>
              <Text style={text}>{t("vetShare.pending", { count: pendingCount })}</Text>
              <SecondaryButton label={t("vetShare.seeRequests")} onPress={onOpenRequests} />
            </View>
          ) : null}
          {grants && active.length === 0 ? (
            <Text style={muted}>{t("dataAccess.noAccess")}</Text>
          ) : null}
          {active.map((grant) => (
            <View key={grant.id} style={card}>
              <Text style={[TYPE.callout, { fontWeight: "800", color: COLORS.warmBrown }]}>
                {vetName(grant.provider_name)}
              </Text>
              <Text style={muted}>
                {(grant.scopes ?? [])
                  .map((s) => (SCOPE_KEYS[s] ? t(`dataAccess.scope.${SCOPE_KEYS[s]}`) : s))
                  .join(" · ")}
              </Text>
              {grant.granted_at ? (
                <Text style={muted}>
                  {t("dataAccess.grantedOn", {
                    date: formatLocalDate(grant.granted_at, { month: "short", day: "numeric" }),
                  })}
                </Text>
              ) : null}
              {grant.expires_at ? (
                <Text style={muted}>
                  {isGrantExpired(grant)
                    ? t("vetShare.expired")
                    : t("dataAccess.accessUntil", {
                        date: formatLocalDate(grant.expires_at, { month: "short", day: "numeric" }),
                      })}
                </Text>
              ) : null}
              <SecondaryButton
                testID={`vet-share-revoke-${grant.id}`}
                label={t("dataAccess.revokeCta")}
                onPress={() => confirmRevoke(grant)}
                disabled={updateGrant.isPending}
              />
            </View>
          ))}

          <Heading>{t("vetShare.linkTitle")}</Heading>
          <View style={card}>
            <Text style={text}>{t("vetShare.linkBody")}</Text>
            <SecondaryButton label={t("vetShare.linkCta")} onPress={openEmergencyCard} />
          </View>

          <Text style={[muted, { marginTop: SPACING.lg }]}>{t("vetShare.noDiagnosis")}</Text>
        </>
      )}
    </KeyboardSafeFormModal>
  );
}
