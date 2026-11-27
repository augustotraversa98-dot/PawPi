import React from "react";
import { View, Text, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useShareOffers, useWithdrawShareOffer } from "@/hooks/useShareOffers";
import { formatLocalDate } from "@/utils/localeDateTime";
import { SHARE_SECTIONS, addableSections, waitingOffers } from "@/utils/vetShare";
import { Bullets } from "./GrantAccess";
import SecondaryButton from "./SecondaryButton";
import { addLines } from "./ShareAccess";
import { Heading, bold, card, muted, text } from "./parts";

function OfferRow({ offer, petName, onWithdraw, disabled }) {
  const { t } = useTranslation();
  const sections = SHARE_SECTIONS.filter((k) => offer.sections?.includes(k));
  const adds = addableSections(offer);
  return (
    <View testID={`share-offer-row-${offer.id}`} style={card}>
      <Text style={bold}>{offer.provider_name || t("dataAccess.thisProvider")}</Text>
      <Text style={muted}>{t("shareOffer.rowWaiting", { pet: offer.pet_name || petName })}</Text>
      <Bullets lines={sections.map((k) => t(`vetShare.section.${k}.title`))} style={muted} />
      {adds.length > 0 ? (
        <View testID={`share-offer-adds-${offer.id}`}>
          <Text style={muted}>{t("shareOffer.rowCanAdd")}</Text>
          <Bullets lines={addLines(t, adds)} style={muted} />
        </View>
      ) : null}
      <Text style={muted}>
        {t("shareOffer.rowLength", { length: t(`vetShare.expiry.${offer.expiry}`) })}
      </Text>
      <Text style={[muted, { fontWeight: "700" }]}>
        {t("shareOffer.rowLapses", { date: formatLocalDate(offer.lapses_at) })}
      </Text>
      <SecondaryButton
        testID={`share-offer-withdraw-${offer.id}`}
        label={t("shareOffer.withdraw")}
        onPress={() => onWithdraw(offer)}
        disabled={disabled}
      />
    </View>
  );
}

/**
 * The owner's invitations to vets that are still waiting for an answer, for one dog, with Withdraw. Nothing is shown
 * when there are none (or the server cannot send invitations). Only mount it for an owner.
 *
 * Props: pet ({ id, name }).
 */
export default function ShareOffers({ pet }) {
  const { t } = useTranslation();
  const petName = pet?.name || t("dataAccess.yourPet");
  const query = useShareOffers();
  const withdraw = useWithdrawShareOffer({
    onError: (error) =>
      Alert.alert(
        t("shareOffer.error.withdrawTitle"),
        t(error?.code === "offer_accepted" ? "shareOffer.error.alreadyAccepted" : "shareOffer.error.withdraw"),
      ),
  });

  const confirmWithdraw = (offer) =>
    Alert.alert(
      t("shareOffer.withdrawTitle"),
      t("shareOffer.withdrawBody", { provider: offer.provider_name || t("dataAccess.thisProvider") }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("shareOffer.withdraw"), style: "destructive", onPress: () => withdraw.mutate(offer.id) },
      ],
    );

  const offers = waitingOffers(query.data?.offers).filter((o) => String(o.pet_id) === String(pet?.id));
  if (!query.isError && offers.length === 0) return null;

  return (
    <View testID="share-offers">
      <Heading>{t("shareOffer.listTitle")}</Heading>
      {query.isError ? (
        <View style={card}>
          <Text style={text}>{t("shareOffer.loadError")}</Text>
          <SecondaryButton label={t("vetShare.retry")} onPress={() => query.refetch()} />
        </View>
      ) : (
        offers.map((offer) => (
          <OfferRow
            key={offer.id}
            offer={offer}
            petName={petName}
            onWithdraw={confirmWithdraw}
            disabled={withdraw.isPending}
          />
        ))
      )}
    </View>
  );
}
