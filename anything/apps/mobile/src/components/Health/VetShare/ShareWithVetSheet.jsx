import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check, EyeOff, Square, SquareCheck } from "lucide-react-native";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import { COLORS, SPACING } from "@/constants/theme";
import { useMyBookings } from "@/hooks/useProviders";
import {
  useCareAccessGrants,
  useShareRecord,
  useUpdateGrant,
} from "@/hooks/useCareAccessGrants";
import { useRecordLinks } from "@/hooks/useRecordLinks";
import { OFFERS_UNAVAILABLE, useSendShareOffer, useVetSearch } from "@/hooks/useShareOffers";
import { useSharingLive } from "@/hooks/useSharingLive";
import { friendlyErrorMessage } from "@/utils/appAlert";
import { formatLocalDate } from "@/utils/localeDateTime";
import {
  SHARE_EXPIRIES,
  SHARE_SECTIONS,
  bookedVetsForPet,
  expiryDate,
  isGrantActive,
  isGrantEnded,
  providerGrants,
  sectionsSupported,
} from "@/utils/vetShare";
import GrantAccess, { Bullets } from "./GrantAccess";
import InviteVet from "./InviteVet";
import RecordLinks from "./RecordLinks";
import SecondaryButton from "./SecondaryButton";
import ShareOffers from "./ShareOffers";
import VetSearch from "./VetSearch";
import { Choice, Heading, Note, bold, card, muted, picked, row, text } from "./parts";
import useRecordLinkSteps from "./useRecordLinkSteps";

// A refused request opened nothing; anything else leaves the owner to check the list.
const ERROR_KEYS = {
  400: "vetShare.error.rejected",
  404: "vetShare.error.gone",
  409: "vetShare.error.changed",
  429: "vetShare.error.tooMany",
};

// What the vet picker says depends on the other ways to reach a vet that this server offers. Until it has said, the copy
// promises none.
function vetCopy(canSearch, canLink) {
  if (canSearch === undefined || canLink === undefined) {
    return { hint: "vetShare.pickHintPlain", none: "vetShare.noVetsPlain" };
  }
  if (canSearch && canLink) return { hint: "vetShare.pickHint", none: "vetShare.noVets" };
  if (canSearch) return { hint: "vetShare.pickHintSearchOnly", none: "vetShare.noVetsSearchOnly" };
  if (canLink) return { hint: "vetShare.pickHintLinkOnly", none: "vetShare.noVetsLinkOnly" };
  return { hint: "vetShare.pickHintNeither", none: "vetShare.noVetsNeither" };
}

function offerErrorKey(error) {
  if (error?.code === OFFERS_UNAVAILABLE) return "unavailable";
  if (error?.code === "offer_limit") return "limit";
  // Replacing an invitation that was accepted meanwhile.
  if (error?.code === "offer_accepted") return "alreadyAccepted";
  if (error?.status === 429) return "tooMany";
  if (error?.status === 404) return "gone";
  if (error?.status === 400) return "rejected";
  return "send";
}

/**
 * Sharing the vet record: the owner picks a vet, the parts and how long, reviews who can see what, and consents.
 * Also lists who has access, with revoke. Mount it only while open (each opening starts with nothing selected).
 *
 * Props: pet ({ id, name, is_shared }), onClose, onOpenRequests (show the pending access requests), and optionally
 * provider ({ providerId, name, checkName }) to share with that one only (a booking, or a request being answered;
 * checkName asks the owner to make sure that business is their vet). Without a provider the owner can also search for
 * any vet on PawPi and send an invitation it has to accept (VetSearch), or create a link for a vet without PawPi
 * (useRecordLinkSteps).
 */
export default function ShareWithVetSheet({ pet, provider, onClose, onOpenRequests }) {
  const { t } = useTranslation();
  const router = useRouter();
  const petId = pet?.id;
  const petName = pet?.name || t("dataAccess.yourPet");
  const isOwner = !pet?.is_shared;
  const fixed = provider?.providerId != null ? provider : null;
  const vetName = (name) => name || t("dataAccess.thisProvider");

  // A vet answers on another phone: what this screen shows is read again while something is waiting.
  useSharingLive();
  const bookings = useMyBookings();
  const grantsQuery = useCareAccessGrants(isOwner ? petId : null);
  const updateGrant = useUpdateGrant(petId);
  const offersOthers = isOwner && !fixed;
  const canSearch = useVetSearch("", { enabled: offersOthers }).data?.available;
  const canLink = useRecordLinks({ enabled: offersOthers }).data?.available;
  const copy = vetCopy(canSearch, canLink);

  const scrollRef = useRef(null);
  const [step, setStep] = useState("choose");
  const [pickedId, setPickedId] = useState(null);
  // A business picked in the search, which is not in the list of booked vets.
  const [found, setFound] = useState(null);
  const [sections, setSections] = useState([]);
  const [expiry, setExpiry] = useState(null);
  const [consent, setConsent] = useState(false);
  const links = useRecordLinkSteps({ pet });
  // State changes too late to stop a second tap in the same frame.
  const sending = useRef(false);

  const reset = () => {
    setStep("choose");
    setPickedId(null);
    setFound(null);
    setSections([]);
    setExpiry(null);
    setConsent(false);
  };

  // Never decide on cached data: a vet may have asked for access, or a booking may be new, since the last read.
  const { refetch: refetchGrants } = grantsQuery;
  const { refetch: refetchBookings } = bookings;
  useEffect(() => {
    if (!isOwner) return;
    refetchGrants();
    refetchBookings();
  }, [isOwner, refetchGrants, refetchBookings]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [step, links.step]);

  const revokeNow = (grantId) =>
    updateGrant
      .mutateAsync({ grantId, action: "revoke" })
      .catch((e) =>
        Alert.alert(t("dataAccess.errorTitle"), friendlyErrorMessage(e, "dataAccess.tryAgain")),
      );

  const reportOutcome = ({ outcome, grant }, sent) => {
    sending.current = false;
    const names = { provider: sent.providerName, pet: petName };
    const revokeButtons = (keepKey) => [
      { text: t(keepKey), style: "cancel" },
      { text: t("dataAccess.revokeCta"), style: "destructive", onPress: () => revokeNow(grant.id) },
    ];
    reset();
    if (outcome === "shared") {
      // Opened to share with one business: that is done, and the screen behind shows its access.
      if (fixed) onClose();
      const list = sent.sections.map((key) => t(`vetShare.section.${key}.title`)).join(", ");
      Alert.alert(
        t("vetShare.doneTitle"),
        grant.expires_at
          ? t("vetShare.doneBodyDate", { ...names, sections: list, date: formatLocalDate(grant.expires_at) })
          : t("vetShare.doneBodyRevoke", { ...names, sections: list }),
      );
    } else if (outcome === "rolledBack") {
      Alert.alert(t("vetShare.unchangedTitle"), t("vetShare.rolledBackBody", names));
    } else if (outcome === "rollbackFailed") {
      Alert.alert(
        t("vetShare.rollbackFailedTitle"),
        t("vetShare.rollbackFailedBody", names),
        revokeButtons("vetShare.later"),
      );
    } else if (outcome === "unchanged") {
      Alert.alert(
        t("vetShare.unchangedTitle"),
        t("vetShare.unchangedBody", names),
        revokeButtons("vetShare.keep"),
      );
    } else if (outcome === "notApplied") {
      Alert.alert(t("vetShare.notSharedTitle"), t("vetShare.notAppliedBody", names));
    } else {
      Alert.alert(t("vetShare.errorTitle"), t("vetShare.error.unconfirmed"));
    }
  };

  const share = useShareRecord({
    onSuccess: reportOutcome,
    onError: (error) => {
      sending.current = false;
      refetchGrants(); // the usual cause is a request or grant this screen had not seen yet
      setStep("choose");
      setConsent(false);
      Alert.alert(
        t("vetShare.errorTitle"),
        t(ERROR_KEYS[error?.status] ?? "vetShare.error.unconfirmed"),
      );
    },
  });

  const reportOffer = ({ outcome }, sent) => {
    reset();
    const names = { provider: sent.providerName, pet: petName };
    if (outcome === "sent") {
      Alert.alert(t("shareOffer.sentTitle"), t("shareOffer.sentBody", names));
    } else if (outcome === "alreadySent") {
      Alert.alert(t("shareOffer.alreadyTitle"), t("shareOffer.alreadyBody", names));
    } else {
      Alert.alert(t("shareOffer.error.sendTitle"), t("shareOffer.error.send"));
    }
  };

  const offer = useSendShareOffer({
    onSuccess: reportOffer,
    onError: (error, sent) => {
      refetchGrants();
      setStep("choose");
      setConsent(false);
      // An unanswered invitation with another choice: nothing is replaced unless the owner says so.
      if (error?.code === "offer_open" && error.offer?.id != null) {
        Alert.alert(
          t("shareOffer.replaceTitle"),
          t("shareOffer.replaceBody", { provider: sent.providerName }),
          [
            { text: t("shareOffer.keep"), style: "cancel" },
            {
              text: t("shareOffer.replace"),
              onPress: () => sendOffer({ ...sent, replaceOfferId: error.offer.id }),
            },
          ],
        );
        return;
      }
      const key = offerErrorKey(error);
      Alert.alert(
        t(`shareOffer.error.${key}Title`),
        t(`shareOffer.error.${key}`, { limit: error?.limit ?? 20 }),
      );
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  function sendOffer(choice) {
    if (sending.current) return;
    sending.current = true;
    offer.mutate(choice);
  }

  const grants = grantsQuery.data;
  const vets = fixed ? [] : bookedVetsForPet(bookings.data, petId);
  // Nothing can be picked until we know who already has access.
  const ready =
    !!grants && !grantsQuery.isError && (!!fixed || (!!bookings.data && !bookings.isError));
  const loadFailed = grantsQuery.isError || (!fixed && bookings.isError);
  const supported = sectionsSupported(grants);
  const canChoose = ready && supported && (!!fixed || vets.length > 0 || !!found);
  const searched = found
    ? { providerId: found.id, name: found.name, searched: true }
    : null;
  const selected = ready
    ? (fixed ??
      vets.find((v) => String(v.providerId) === pickedId) ??
      (searched && String(searched.providerId) === pickedId ? searched : null))
    : null;
  const accessOf = (providerId) => {
    const mine = providerGrants(grants, providerId);
    return {
      pending: mine.some((g) => g.status === "pending"),
      active: mine.some((g) => isGrantActive(g)),
    };
  };
  const access = selected ? accessOf(selected.providerId) : null;
  // A business found by search that has no access and has not asked for it is invited, and has to accept. One the owner
  // already deals with (booked, asking, or with access) gets the access directly.
  const invites = !!selected?.searched && !access.active && !access.pending;
  // Consent is given for one action: it is cleared when what the button would do changes, for example because a
  // request or an access for this business appears or ends while the screen is open.
  const action = selected ? [selected.providerId, invites, access.pending, access.active].join(":") : "";
  const [consentedAction, setConsentedAction] = useState(action);
  if (consentedAction !== action) {
    setConsentedAction(action);
    setConsent(false);
  }
  const canReview = isOwner && canChoose && !!selected && sections.length > 0 && !!expiry;
  const reviewing = step === "review" && canReview;
  const busy = share.isPending || offer.isPending;
  const canSubmit = reviewing && consent && !busy;

  const active = (grants ?? []).filter((g) => isGrantActive(g));
  const ended = (grants ?? []).filter((g) => isGrantEnded(g));
  const pendingCount = (grants ?? []).filter((g) => g.status === "pending").length;

  const chooseFound = (vet) => {
    setFound(vet);
    chooseVet(vet.id);
  };

  const chooseVet = (providerId) => {
    const next = String(providerId);
    // Choices made for one vet are never carried over to another.
    if (pickedId && pickedId !== next) {
      setSections([]);
      setExpiry(null);
    }
    setPickedId(next);
  };

  const toggleSection = (key) =>
    setSections((current) =>
      SHARE_SECTIONS.filter((k) => (k === key ? !current.includes(k) : current.includes(k))),
    );

  const openReview = () => {
    if (!canReview) return;
    setConsent(false);
    setStep("review");
  };

  const backToChoices = () => {
    setConsent(false);
    setStep("choose");
  };

  const submit = () => {
    if (!canSubmit) return;
    const choice = {
      petId,
      providerId: selected.providerId,
      providerName: vetName(selected.name),
      sections,
      expiry,
    };
    if (invites) {
      sendOffer(choice);
      return;
    }
    if (sending.current) return;
    sending.current = true;
    share.mutate(choice);
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
          onPress: () => revokeNow(grant.id),
        },
      ],
    );

  const retry = () => {
    if (!fixed) bookings.refetch();
    grantsQuery.refetch();
  };

  const openEmergencyCard = () => {
    onClose();
    router.push(`/emergency-card?petId=${petId}`);
  };

  const grantCard = (grant) => (
    <View key={grant.id} style={card}>
      <Text style={bold}>{vetName(grant.provider_name)}</Text>
      <GrantAccess grant={grant} petName={petName} />
      {grant.status === "active" ? (
        <SecondaryButton
          testID={`vet-share-revoke-${grant.id}`}
          label={t("dataAccess.revokeCta")}
          onPress={() => confirmRevoke(grant)}
          disabled={updateGrant.isPending}
        />
      ) : null}
    </View>
  );

  const renderVetPicker = () => {
    if (loadFailed) {
      return (
        <View style={card}>
          <Text style={text}>{t("vetShare.loadError")}</Text>
          <SecondaryButton label={t("vetShare.retry")} onPress={retry} />
        </View>
      );
    }
    if (!ready) return <ActivityIndicator color={COLORS.coral} />;
    if (fixed) {
      return (
        <View testID="vet-share-provider" style={card}>
          <Text style={bold}>{vetName(fixed.name)}</Text>
        </View>
      );
    }
    if (vets.length === 0) {
      return (
        <View style={card}>
          <Text style={text}>{t(copy.none, { pet: petName })}</Text>
        </View>
      );
    }
    return vets.map((vet) => {
      const has = accessOf(vet.providerId);
      let status = null;
      if (has.pending) status = t("vetShare.askedAccess");
      else if (has.active) status = t("vetShare.hasAccess");
      return (
        <Choice
          key={vet.providerId}
          testID={`vet-share-vet-${vet.providerId}`}
          role="radio"
          selected={selected?.providerId === vet.providerId}
          onPress={() => chooseVet(vet.providerId)}
          title={vetName(vet.name)}
          description={status}
        />
      );
    });
  };

  const searchStatus = (vet) => {
    const has = accessOf(vet.id);
    if (has.pending) return t("vetShare.askedAccess");
    return has.active ? t("vetShare.hasAccess") : null;
  };

  const accessNotes = () => (
    <>
      {selected?.searched ? (
        <Note testID="vet-share-check-found">
          <Text style={text}>{t("shareOffer.checkName", { provider: vetName(selected.name) })}</Text>
        </Note>
      ) : null}
      {fixed?.checkName && !access?.active ? (
        <Note testID="vet-share-check-name">
          <Text style={text}>{t("vetShare.checkName", { provider: vetName(fixed.name) })}</Text>
        </Note>
      ) : null}
      {access?.pending ? (
        <Note testID="vet-share-pending-note">
          <Text style={text}>{t("vetShare.pendingNote")}</Text>
        </Note>
      ) : null}
      {access?.active ? (
        <Note testID="vet-share-replace-note">
          <Text style={text}>{t("vetShare.replaceNote")}</Text>
        </Note>
      ) : null}
    </>
  );

  const neverShared = (
    <>
      <Text style={muted}>{t("vetShare.neverShared")}</Text>
      <Text style={muted}>{t("vetShare.alreadyVisible", { pet: petName })}</Text>
    </>
  );

  // With no booked vet to pick, a link is the way forward, so it sits right there.
  const noVets = ready && !fixed && vets.length === 0;
  const byLink = fixed ? null : (
    <>
      <RecordLinks pet={pet} onCreate={links.start} />
      {supported ? <InviteVet /> : null}
    </>
  );

  const renderChoices = () => (
    <>
      <Text style={text}>{t("vetShare.intro")}</Text>
      {ready && !supported ? (
        <Note testID="vet-share-unsupported" style={{ marginTop: SPACING.md }}>
          <Text style={text}>{t("vetShare.unsupported")}</Text>
        </Note>
      ) : null}

      {supported ? (
        <>
          <Heading>{t(fixed ? "vetShare.providerTitle" : "vetShare.pickTitle")}</Heading>
          {fixed ? null : (
            <Text style={[muted, { marginBottom: SPACING.sm }]}>{t(copy.hint, { pet: petName })}</Text>
          )}
          {renderVetPicker()}
          {ready && !fixed ? (
            <VetSearch
              picked={found}
              selectedId={pickedId}
              onPick={chooseFound}
              excludeIds={vets.map((v) => v.providerId)}
              describe={searchStatus}
              canLink={canLink}
            />
          ) : null}
          {accessNotes()}
        </>
      ) : null}

      {noVets ? byLink : null}

      {canChoose ? (
        <>
          <Heading>{t("vetShare.sectionsTitle")}</Heading>
          <Text style={[muted, { marginBottom: SPACING.sm }]}>{t("vetShare.sectionsHint")}</Text>
          {SHARE_SECTIONS.map((key) => (
            <Choice
              key={key}
              testID={`vet-share-section-${key}`}
              role="checkbox"
              selected={sections.includes(key)}
              onPress={() => toggleSection(key)}
              title={t(`vetShare.section.${key}.title`)}
              description={t(`vetShare.section.${key}.description`, { pet: petName })}
            />
          ))}
          <Note icon={EyeOff}>{neverShared}</Note>

          <Heading>{t("vetShare.expiryTitle")}</Heading>
          {SHARE_EXPIRIES.map((key) => (
            <Choice
              key={key}
              testID={`vet-share-expiry-${key}`}
              role="radio"
              selected={expiry === key}
              onPress={() => setExpiry(key)}
              title={t(`vetShare.expiry.${key}`)}
            />
          ))}
          {canReview ? null : <Text style={muted}>{t("vetShare.missing")}</Text>}
        </>
      ) : null}

      {fixed ? null : <ShareOffers pet={pet} />}

      <Heading>{t("vetShare.sharedTitle")}</Heading>
      {pendingCount > 0 ? (
        <View style={card}>
          <Text style={text}>{t("vetShare.pending", { count: pendingCount })}</Text>
          <SecondaryButton label={t("vetShare.seeRequests")} onPress={onOpenRequests} />
        </View>
      ) : null}
      {grants && active.length === 0 ? <Text style={muted}>{t("dataAccess.noAccess")}</Text> : null}
      {active.map(grantCard)}
      {ended.length > 0 ? (
        <>
          <Heading>{t("vetShare.endedTitle")}</Heading>
          {ended.map(grantCard)}
        </>
      ) : null}

      {noVets ? null : byLink}

      <Heading>{t("vetShare.linkTitle")}</Heading>
      <View style={card}>
        <Text style={text}>{t("vetShare.linkBody")}</Text>
        <SecondaryButton label={t("vetShare.linkCta")} onPress={openEmergencyCard} />
      </View>

      <Text style={[muted, { marginTop: SPACING.lg }]}>{t("vetShare.noDiagnosis")}</Text>
    </>
  );

  const renderReview = () => {
    const name = vetName(selected.name);
    const end = expiryDate(expiry);
    const date = end ? formatLocalDate(end) : null;
    // An invitation's time starts when it is accepted, so it has a length and no end date yet.
    const length = t(`vetShare.expiry.${expiry}`);
    let until = date ? t("vetShare.reviewUntilDate", { date }) : t("vetShare.reviewUntilRevoked");
    let consentText = date
      ? t("vetShare.consentDate", { provider: name, pet: petName, date })
      : t("vetShare.consentRevoke", { provider: name, pet: petName });
    if (invites) {
      until = date ? t("shareOffer.reviewLength", { length }) : t("shareOffer.reviewUntilRevoked");
      consentText = date
        ? t("shareOffer.consent", { provider: name, pet: petName, length })
        : t("shareOffer.consentRevoke", { provider: name, pet: petName });
    }
    const left = SHARE_SECTIONS.filter((k) => !sections.includes(k));
    return (
      <View testID="vet-share-review">
        <Heading>{t("vetShare.reviewTitle")}</Heading>
        <View style={card}>
          <Text style={bold}>{name}</Text>
          <Text style={muted}>
            {t(invites ? "shareOffer.reviewWho" : "vetShare.reviewWho", { provider: name })}
          </Text>
        </View>
        <View testID="vet-share-review-sections" style={card}>
          <Text style={[bold, { marginBottom: 6 }]}>{t("vetShare.reviewCan", { pet: petName })}</Text>
          {sections.map((key) => (
            <View key={key} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <Check size={16} color={COLORS.sageDark} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[text, { fontWeight: "700" }]}>{t(`vetShare.section.${key}.title`)}</Text>
                <Text style={muted}>{t(`vetShare.section.${key}.description`, { pet: petName })}</Text>
              </View>
            </View>
          ))}
        </View>
        <View testID="vet-share-review-until" style={card}>
          <Text style={bold}>{until}</Text>
          <Text style={muted}>{t("vetShare.reviewLater")}</Text>
        </View>
        {invites ? (
          <Note testID="vet-share-review-invitation">
            <Text style={text}>{t("shareOffer.reviewHow", { pet: petName })}</Text>
          </Note>
        ) : null}
        <Note testID="vet-share-review-ending">
          <Text style={muted}>{t("vetShare.endingLimit")}</Text>
        </Note>
        <Note icon={EyeOff} testID="vet-share-review-not-shared">
          {left.length > 0 ? (
            <>
              <Text style={muted}>{t("vetShare.notSelected")}</Text>
              <Bullets lines={left.map((k) => t(`vetShare.section.${k}.title`))} style={muted} />
            </>
          ) : null}
          {neverShared}
        </Note>
        {accessNotes()}
        <TouchableOpacity
          testID="vet-share-consent"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          onPress={() => setConsent((v) => !v)}
          style={[card, row, { marginTop: SPACING.sm }, consent && picked]}
        >
          {consent ? (
            <SquareCheck size={22} color={COLORS.coral} />
          ) : (
            <Square size={22} color={COLORS.mutedBrown} />
          )}
          <Text style={[text, { flex: 1, fontWeight: "600" }]}>{consentText}</Text>
        </TouchableOpacity>
        <SecondaryButton
          testID="vet-share-back"
          label={t("vetShare.back")}
          onPress={backToChoices}
          disabled={busy}
        />
      </View>
    );
  };

  let ctaLabel = t("common.close");
  let ctaDisabled = false;
  let onCtaPress = onClose;
  if (isOwner && reviewing) {
    if (invites) ctaLabel = offer.isPending ? t("shareOffer.sending") : t("shareOffer.cta");
    else ctaLabel = share.isPending ? t("vetShare.sharing") : t("vetShare.cta");
    ctaDisabled = !canSubmit;
    onCtaPress = submit;
  } else if (isOwner) {
    ctaLabel = t("vetShare.reviewCta");
    ctaDisabled = !canReview;
    onCtaPress = openReview;
  }

  let content = <Text style={text}>{t("vetShare.ownerOnly", { pet: petName })}</Text>;
  if (isOwner) content = reviewing ? renderReview() : renderChoices();
  if (isOwner && links.step) {
    ({ content, ctaLabel, ctaDisabled, onCtaPress } = links);
  }

  return (
    <KeyboardSafeFormModal
      visible
      onClose={onClose}
      title={t(fixed ? "vetShare.titleProvider" : "vetShare.title")}
      subtitle={petName}
      ctaLabel={ctaLabel}
      ctaDisabled={ctaDisabled}
      onCtaPress={onCtaPress}
      scrollRef={scrollRef}
    >
      {content}
    </KeyboardSafeFormModal>
  );
}
