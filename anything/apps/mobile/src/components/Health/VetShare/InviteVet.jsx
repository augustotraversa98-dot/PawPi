import React from "react";
import { View, Text, Alert, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";
import {
  useCreateVetInvite,
  useVetInvites,
  useWithdrawVetInvite,
} from "@/hooks/useVetInvites";
import { formatLocalDate } from "@/utils/localeDateTime";
import { visibleInvites } from "@/utils/vetShare";
import { Bullets } from "./GrantAccess";
import SecondaryButton from "./SecondaryButton";

const heading = [
  TYPE.headline,
  { color: COLORS.warmBrown, marginTop: SPACING.lg, marginBottom: SPACING.sm },
];
const text = [TYPE.callout, { color: COLORS.warmBrown, lineHeight: 20 }];
const bold = [TYPE.callout, { color: COLORS.warmBrown, fontWeight: "800" }];
const muted = [TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18 }];
const card = {
  backgroundColor: MATERIALS.surface,
  borderRadius: RADIUS.control,
  borderWidth: 1,
  borderColor: MATERIALS.hairline,
  padding: SPACING.lg,
  marginBottom: SPACING.sm,
};

function createErrorKey(error) {
  if (error?.code === "invite_limit") return "limit";
  if (error?.status === 429) return "tooMany";
  if (error?.status === 404) return "notAllowed";
  return "create";
}

function withdrawErrorKey(error) {
  if (error?.code === "invite_used") return "used";
  if (error?.status === 429) return "tooMany";
  return "withdraw";
}

function InviteRow({ invite, onWithdraw, disabled }) {
  const { t } = useTranslation();
  const pet = invite.pet_name || t("dataAccess.yourPet");
  const vet = invite.used_by_provider_name || t("dataAccess.thisProvider");

  let status = t("vetInvite.status.closed");
  if (invite.status === "open") {
    status = t("vetInvite.status.open", { date: formatLocalDate(invite.expires_at) });
  } else if (invite.status === "used") {
    status = t("vetInvite.status.used", { provider: vet });
  } else if (invite.status === "revoked") {
    status = t("vetInvite.status.revoked");
  } else if (invite.status === "expired") {
    status = t("vetInvite.status.expired", { date: formatLocalDate(invite.expires_at) });
  }

  return (
    <View testID={`vet-invite-row-${invite.id}`} style={card}>
      <Text style={bold}>
        {t("vetInvite.rowTitle", { pet, date: formatLocalDate(invite.created_at) })}
      </Text>
      <Text style={muted}>{status}</Text>
      {invite.status === "open" ? (
        <SecondaryButton
          testID={`vet-invite-withdraw-${invite.id}`}
          label={t("vetInvite.withdraw")}
          onPress={() => onWithdraw(invite)}
          disabled={disabled}
        />
      ) : null}
    </View>
  );
}

/**
 * The dog's owner invites a vet who has no booking: creates a single-use link, hands it to the phone's share sheet, and
 * lists the invites so an open one can be withdrawn. Only mount it for the owner.
 *
 * Props: pet ({ id, name }).
 */
export default function InviteVet({ pet }) {
  const { t } = useTranslation();
  const petName = pet?.name || t("dataAccess.yourPet");
  const invites = useVetInvites();

  const showError = (key, values) =>
    Alert.alert(t(`vetInvite.error.${key}Title`), t(`vetInvite.error.${key}`, values));

  const withdraw = useWithdrawVetInvite({
    onError: (error) => showError(withdrawErrorKey(error)),
  });

  const create = useCreateVetInvite({
    onSuccess: ({ outcome, inviteId }) => {
      if (outcome === "shared") return;
      const buttons = [{ text: t("vetInvite.keep"), style: "cancel" }];
      if (inviteId != null) {
        buttons.push({
          text: t("vetInvite.withdraw"),
          style: "destructive",
          onPress: () => withdraw.mutate(inviteId),
        });
      }
      Alert.alert(t("vetInvite.notSharedTitle"), t("vetInvite.notSharedBody"), buttons);
    },
    onError: (error) => showError(createErrorKey(error), { limit: error?.limit ?? 5 }),
  });

  const confirmWithdraw = (invite) =>
    Alert.alert(
      t("vetInvite.withdrawTitle"),
      t("vetInvite.withdrawBody", { pet: invite.pet_name || t("dataAccess.yourPet") }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("vetInvite.withdraw"),
          style: "destructive",
          onPress: () => withdraw.mutate(invite.id),
        },
      ],
    );

  const createInvite = () => {
    if (create.isPending) return;
    create.mutate({ petId: pet.id, message: t("vetInvite.message", { pet: petName }) });
  };

  const renderList = () => {
    if (invites.isError) {
      return (
        <View style={card}>
          <Text style={text}>{t("vetInvite.loadError")}</Text>
          <SecondaryButton label={t("vetShare.retry")} onPress={() => invites.refetch()} />
        </View>
      );
    }
    if (!invites.data) return <ActivityIndicator color={COLORS.coral} />;
    if (invites.data.length === 0) return null;
    return (
      <>
        <Text style={[bold, { marginTop: SPACING.sm, marginBottom: SPACING.sm }]}>
          {t("vetInvite.listTitle")}
        </Text>
        {visibleInvites(invites.data).map((invite) => (
          <InviteRow
            key={invite.id}
            invite={invite}
            onWithdraw={confirmWithdraw}
            disabled={withdraw.isPending}
          />
        ))}
      </>
    );
  };

  return (
    <View testID="vet-invite">
      <Text accessibilityRole="header" style={heading}>
        {t("vetInvite.title")}
      </Text>
      <View style={card}>
        <Text style={[text, { marginBottom: 6 }]}>{t("vetInvite.intro", { pet: petName })}</Text>
        <Bullets
          lines={[
            t("vetInvite.ruleOnce"),
            t("vetInvite.ruleVet"),
            t("vetInvite.ruleNames", { pet: petName }),
            t("vetInvite.ruleApprove"),
          ]}
        />
        <SecondaryButton
          testID="vet-invite-create"
          label={t(create.isPending ? "vetInvite.creating" : "vetInvite.cta")}
          onPress={createInvite}
          disabled={create.isPending}
        />
      </View>
      {renderList()}
    </View>
  );
}
