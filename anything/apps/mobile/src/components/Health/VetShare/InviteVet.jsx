import React from "react";
import { View, Text, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, TYPE } from "@/constants/theme";
import { useVetInvites, useWithdrawVetInvite } from "@/hooks/useVetInvites";
import { formatLocalDate } from "@/utils/localeDateTime";
import { visibleInvites } from "@/utils/vetShare";
import SecondaryButton from "./SecondaryButton";
import { bold, card, muted, text } from "./parts";

const heading = [
  TYPE.headline,
  { color: COLORS.warmBrown, marginTop: SPACING.lg, marginBottom: SPACING.sm },
];

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
 * The owner's earlier invite links (they ask a vet business to request access; this app version creates record links
 * instead), with their state; an open one can be withdrawn. Nothing is shown when there are none. Only mount it for an
 * owner.
 */
export default function InviteVet() {
  const { t } = useTranslation();
  const invites = useVetInvites();

  const withdraw = useWithdrawVetInvite({
    onError: (error) => {
      const key = withdrawErrorKey(error);
      Alert.alert(t(`vetInvite.error.${key}Title`), t(`vetInvite.error.${key}`));
    },
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

  if (!invites.isError && !invites.data?.length) return null;

  return (
    <View testID="vet-invite">
      <Text accessibilityRole="header" style={heading}>
        {t("vetInvite.listTitle")}
      </Text>
      {invites.isError ? (
        <View style={card}>
          <Text style={text}>{t("vetInvite.loadError")}</Text>
          <SecondaryButton label={t("vetShare.retry")} onPress={() => invites.refetch()} />
        </View>
      ) : (
        visibleInvites(invites.data).map((invite) => (
          <InviteRow
            key={invite.id}
            invite={invite}
            onWithdraw={confirmWithdraw}
            disabled={withdraw.isPending}
          />
        ))
      )}
    </View>
  );
}
