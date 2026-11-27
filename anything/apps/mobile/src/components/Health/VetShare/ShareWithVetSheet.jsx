import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronUp, EyeOff, Square, SquareCheck } from "lucide-react-native";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import { COLORS, SPACING } from "@/constants/theme";
import { useMyBookings } from "@/hooks/useProviders";
import {
  useCareAccessGrants,
  useEditGrant,
  useShareRecord,
  useUpdateGrant,
} from "@/hooks/useCareAccessGrants";
import { useRecordLinks } from "@/hooks/useRecordLinks";
import { OFFERS_UNAVAILABLE, useSendShareOffer, useVetSearch } from "@/hooks/useShareOffers";
import { useSharingLive } from "@/hooks/useSharingLive";
import { friendlyErrorMessage } from "@/utils/appAlert";
import { formatLocalDate } from "@/utils/localeDateTime";
import {
  KEEP_EXPIRY,
  SHARE_EXPIRIES,
  SHARE_SECTIONS,
  activeRecordLinks,
  addableSections,
  bookedVetsForPet,
  choiceOfShare,
  expiryDate,
  isGrantActive,
  isGrantEditable,
  isGrantEnded,
  isSameChoice,
  providerGrants,
  sectionsSupported,
  vetsForPet,
} from "@/utils/vetShare";
import GrantAccess, { Bullets } from "./GrantAccess";
import InviteVet from "./InviteVet";
import RecordLinks from "./RecordLinks";
import SecondaryButton from "./SecondaryButton";
import SectionPicker, { ExpiryChips } from "./SectionPicker";
import { addLines, addNames } from "./ShareAccess";
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

function shareErrorKey(error) {
  if (error?.code === "edit_access_unavailable") return "vetShare.error.editUnavailable";
  return ERROR_KEYS[error?.status] ?? "vetShare.error.unconfirmed";
}

// A refused change leaves the access as it was.
function editErrorKey(error) {
  if (error?.code === "edit_access_unavailable") return "editUnavailable";
  if (error?.code === "grant_not_editable") return "notEditable";
  if (error?.code === "grant_not_active") return "notActive";
  if (error?.status === 429) return "tooMany";
  if (error?.status === 404) return "gone";
  if (error?.status === 400) return "rejected";
  return "unconfirmed";
}

// What an empty vet list says depends on the other ways to reach a vet that this server offers. Until it has said, the
// copy promises none.
function noVetsKey(canSearch, canLink) {
  if (canSearch === undefined || canLink === undefined) return "vetShare.noVetsPlain";
  if (canSearch && canLink) return "vetShare.noVets";
  if (canSearch) return "vetShare.noVetsSearchOnly";
  if (canLink) return "vetShare.noVetsLinkOnly";
  return "vetShare.noVetsNeither";
}

function offerErrorKey(error) {
  if (error?.code === OFFERS_UNAVAILABLE) return "unavailable";
  if (error?.code === "edit_access_unavailable") return "editUnavailable";
  if (error?.code === "offer_limit") return "limit";
  // Replacing an invitation that was accepted meanwhile.
  if (error?.code === "offer_accepted") return "alreadyAccepted";
  if (error?.status === 429) return "tooMany";
  if (error?.status === 404) return "gone";
  if (error?.status === 400) return "rejected";
  return "send";
}

const NOTHING = { sections: [], editSections: [], expiry: null };

// A row that shows or hides secondary content.
function Disclosure({ testID, label, hint, open, onPress }) {
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, marginTop: SPACING.sm }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[bold, { color: COLORS.terracotta }]}>{label}</Text>
        {hint ? <Text style={muted}>{hint}</Text> : null}
      </View>
      <Icon size={18} color={COLORS.terracotta} />
    </TouchableOpacity>
  );
}

/**
 * Sharing the vet record, in steps: the owner picks a vet (search first), then the parts, what the vet may add and for
 * how long, reviews who can see what, and consents. A vet who already has access by section is changed in place, never
 * ended and shared again. Sharing by link, for a vet without PawPi, sits below as the second way. Mount it only while
 * open (each opening starts with nothing selected).
 *
 * Props: pet ({ id, name, is_shared }), onClose, onOpenRequests (show the pending access requests), and optionally
 * provider ({ providerId, name, checkName }) to share with that one only (a booking, a request being answered or an
 * access being edited; checkName asks the owner to make sure that business is their vet), or editLink (a record link to
 * change: the sheet shows only that, and closes when done).
 */
export default function ShareWithVetSheet({ pet, provider, editLink, onClose, onOpenRequests }) {
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
  // False (an older server or database) hides everything about what a vet may add and about changing a share.
  const canAdd = grantsQuery.editAccessAvailable === true;
  const updateGrant = useUpdateGrant(petId);
  const offersOthers = isOwner && !fixed;
  const canSearch = useVetSearch("", { enabled: offersOthers && !editLink }).data?.available;
  const linkList = useRecordLinks({ enabled: offersOthers && !editLink }).data;
  const canLink = linkList?.available;
  const canEditLinks = linkList?.editAccessAvailable === true;

  const scrollRef = useRef(null);
  const [step, setStep] = useState("choose");
  const [pickedId, setPickedId] = useState(null);
  // A business picked in the search, which may not be in the list below it.
  const [found, setFound] = useState(null);
  const [fromSearch, setFromSearch] = useState(false);
  // The choices, and which vet and access they are for.
  const [draft, setDraft] = useState({ for: null, ...NOTHING });
  const [consent, setConsent] = useState(false);
  const [showLinks, setShowLinks] = useState(null);
  const [showEnded, setShowEnded] = useState(false);
  const links = useRecordLinkSteps({
    pet,
    // A link opened for editing was offered by a server that can change it.
    canAdd: !!editLink || canEditLinks,
    initialLink: editLink,
    onDone: editLink ? onClose : undefined,
  });
  // State changes too late to stop a second tap in the same frame.
  const sending = useRef(false);

  const reset = () => {
    setStep("choose");
    setPickedId(null);
    setFound(null);
    setDraft({ for: null, ...NOTHING });
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

  const revokeNow = (grantId) =>
    updateGrant
      .mutateAsync({ grantId, action: "revoke" })
      .catch((e) =>
        Alert.alert(t("dataAccess.errorTitle"), friendlyErrorMessage(e, "dataAccess.tryAgain")),
      );
  const revokeButtons = (grantId, keepKey) => [
    { text: t(keepKey), style: "cancel" },
    { text: t("dataAccess.revokeCta"), style: "destructive", onPress: () => revokeNow(grantId) },
  ];

  const sectionNames = (keys) => addNames(t, keys);
  // " They can also add: …" after a sentence about what they can see; nothing when they can add nothing.
  const alsoAdds = (key, keys) =>
    keys?.length ? ` ${t(key, { adds: sectionNames(keys) })}` : "";

  const reportOutcome = ({ outcome, grant }, sent) => {
    sending.current = false;
    const names = { provider: sent.providerName, pet: petName };
    reset();
    if (outcome === "shared") {
      // Opened to share with one business: that is done, and the screen behind shows its access.
      if (fixed) onClose();
      const list = sectionNames(sent.sections);
      const body = grant.expires_at
        ? t("vetShare.doneBodyDate", { ...names, sections: list, date: formatLocalDate(grant.expires_at) })
        : t("vetShare.doneBodyRevoke", { ...names, sections: list });
      Alert.alert(t("vetShare.doneTitle"), `${body}${alsoAdds("vetShare.doneAdds", sent.editSections)}`);
    } else if (outcome === "rolledBack") {
      Alert.alert(t("vetShare.unchangedTitle"), t("vetShare.rolledBackBody", names));
    } else if (outcome === "rollbackFailed") {
      Alert.alert(
        t("vetShare.rollbackFailedTitle"),
        t("vetShare.rollbackFailedBody", names),
        revokeButtons(grant.id, "vetShare.later"),
      );
    } else if (outcome === "unchanged") {
      Alert.alert(
        t("vetShare.unchangedTitle"),
        t("vetShare.unchangedBody", names),
        revokeButtons(grant.id, "vetShare.keep"),
      );
    } else if (outcome === "notApplied") {
      Alert.alert(t("vetShare.notSharedTitle"), t("vetShare.notAppliedBody", names));
    } else {
      Alert.alert(t("vetShare.errorTitle"), t("vetShare.error.unconfirmed"));
    }
  };

  // A refused share or change: back to the choices, with what the server has now.
  const failed = () => {
    sending.current = false;
    refetchGrants(); // the usual cause is a request or grant this screen had not seen yet
    setStep("choose");
    setConsent(false);
  };

  const share = useShareRecord({
    onSuccess: reportOutcome,
    onError: (error) => {
      failed();
      Alert.alert(t("vetShare.errorTitle"), t(shareErrorKey(error)));
    },
  });

  const edit = useEditGrant({
    onSuccess: ({ outcome, grant }, sent) => {
      sending.current = false;
      const names = { provider: sent.providerName, pet: petName };
      reset();
      if (outcome === "saved") {
        if (fixed) onClose();
        const list = sectionNames(sent.sections);
        const body = grant.expires_at
          ? t("vetShare.doneBodyDate", { ...names, sections: list, date: formatLocalDate(grant.expires_at) })
          : t("vetShare.doneBodyRevoke", { ...names, sections: list });
        Alert.alert(t("vetShare.edit.savedTitle"), `${body}${alsoAdds("vetShare.doneAdds", sent.editSections)}`);
      } else {
        Alert.alert(
          t("vetShare.edit.mismatchTitle"),
          t("vetShare.edit.mismatchBody", names),
          revokeButtons(sent.grant.id, "vetShare.later"),
        );
      }
    },
    onError: (error) => {
      failed();
      Alert.alert(t("vetShare.edit.errorTitle"), t(`vetShare.edit.error.${editErrorKey(error)}`));
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
  // Nothing can be picked until we know who already has access.
  const ready =
    !!grants && !grantsQuery.isError && (!!fixed || (!!bookings.data && !bookings.isError));
  const loadFailed = grantsQuery.isError || (!fixed && bookings.isError);
  const supported = sectionsSupported(grants);
  const vets = ready
    ? vetsForPet(grants, fixed ? undefined : bookings.data, petId)
    : { sharing: [], asking: [], booked: [] };
  const listed = [...vets.sharing, ...vets.asking, ...vets.booked];

  const selectedVet = () => {
    if (!ready) return null;
    if (fixed) return fixed;
    if (pickedId === null) return null;
    const known = listed.find((v) => String(v.providerId) === pickedId);
    const searched = found && String(found.id) === pickedId ? found : null;
    const booked = bookedVetsForPet(bookings.data, petId).some((v) => String(v.providerId) === pickedId);
    if (known) {
      return { providerId: known.providerId, name: known.name, searched: fromSearch && !booked };
    }
    return searched ? { providerId: searched.id, name: searched.name, searched: true } : null;
  };
  const selected = supported ? selectedVet() : null;

  const mine = selected ? providerGrants(grants, selected.providerId) : [];
  const current = mine.find((g) => isGrantActive(g)) ?? null;
  const access = { pending: mine.some((g) => g.status === "pending"), active: !!current };
  // The access being changed in place. An older one (not by section) keeps being replaced, as before.
  const editing = canAdd && current && isGrantEditable(current) ? current : null;
  // A business found by search that has no access and has not asked for it is invited, and has to accept. One the owner
  // already deals with (booked, asking, or with access) gets the access directly.
  const invites = !!selected?.searched && !access.active && !access.pending;

  // The choices start as the access being changed is now, otherwise with nothing selected. They are never carried over
  // to another vet.
  const draftFor = selected
    ? `${selected.providerId}:${
        editing
          ? [editing.id, editing.sections, addableSections(editing), editing.expires_at].join("|")
          : "new"
      }`
    : null;
  let choice = draft;
  if (draftFor && draft.for !== draftFor) {
    choice = { for: draftFor, ...(editing ? choiceOfShare(editing) : NOTHING) };
    setDraft(choice);
  }
  const { sections, expiry } = choice;
  // Without the server's support nothing can be added, whatever was chosen before it said so.
  const adds = canAdd ? choice.editSections : [];
  const change = (next) => setDraft((d) => ({ ...d, ...next }));

  // Consent is given for one action: it is cleared when what the button would do changes, for example because a
  // request or an access for this business appears or ends while the screen is open.
  const action = draftFor
    ? [draftFor, invites, access.pending, access.active, canAdd].join(":")
    : "";
  const [consentedAction, setConsentedAction] = useState(action);
  if (consentedAction !== action) {
    setConsentedAction(action);
    setConsent(false);
  }

  const chosen = sections.length > 0 && !!expiry;
  const unchanged = !!editing && isSameChoice(editing, { sections, editSections: adds, expiry });
  const canReview = isOwner && !!selected && chosen && !unchanged;
  const reviewing = step === "review" && canReview;
  const busy = share.isPending || offer.isPending || edit.isPending;
  const canSubmit = reviewing && consent && !busy;

  // Each step starts at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [step, links.step, selected?.providerId]);

  const ended = (grants ?? []).filter((g) => isGrantEnded(g));
  const pendingCount = (grants ?? []).filter((g) => g.status === "pending").length;

  const chooseVet = (providerId, bySearch = false) => {
    setPickedId(String(providerId));
    setFromSearch(bySearch);
    setStep("choose");
  };
  const chooseFound = (vet) => {
    setFound(vet);
    chooseVet(vet.id, true);
  };

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
    const request = {
      petId,
      providerName: vetName(selected.name),
      sections,
      expiry,
      // Sent only to a server that can store it.
      ...(canAdd ? { editSections: adds } : {}),
    };
    if (invites) {
      sendOffer({ ...request, providerId: selected.providerId });
      return;
    }
    if (sending.current) return;
    sending.current = true;
    if (editing) edit.mutate({ ...request, grant: editing });
    else share.mutate({ ...request, providerId: selected.providerId });
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

  const revokeButton = (grant) =>
    grant.status === "active" ? (
      <SecondaryButton
        testID={`vet-share-revoke-${grant.id}`}
        label={t("dataAccess.revokeCta")}
        onPress={() => confirmRevoke(grant)}
        disabled={updateGrant.isPending || edit.isPending}
      />
    ) : null;

  // One vet that has access now. Where a vet can be picked, tapping it does: to change what it has, or (an older
  // access) to replace it. A sheet opened for one business only offers to end another's.
  const sharingCard = ({ providerId, name, grant }) => {
    const editable = canAdd && isGrantEditable(grant);
    const pickable = supported && !fixed;
    return (
      <View key={grant.id} style={card}>
        {pickable ? (
          <TouchableOpacity
            testID={`vet-share-vet-${providerId}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: false }}
            onPress={() => chooseVet(providerId)}
          >
            <Text style={bold}>{vetName(name)}</Text>
            <Text style={muted}>{t("vetShare.hasAccess")}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={bold}>{vetName(name)}</Text>
        )}
        <GrantAccess grant={grant} petName={petName} />
        {/* Side by side, so the next vet stays close. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: SPACING.sm }}>
          {pickable ? (
            <View style={{ flexGrow: 1 }}>
              <SecondaryButton
                testID={`vet-share-edit-${grant.id}`}
                label={t(editable ? "vetShare.editCta" : "vetShare.replaceCta")}
                onPress={() => chooseVet(providerId)}
              />
            </View>
          ) : null}
          <View style={{ flexGrow: 1 }}>{revokeButton(grant)}</View>
        </View>
      </View>
    );
  };

  const vetRow = (vet, description) => (
    <Choice
      key={vet.providerId}
      testID={`vet-share-vet-${vet.providerId}`}
      role="radio"
      selected={false}
      onPress={() => chooseVet(vet.providerId)}
      title={vetName(vet.name)}
      description={description}
    />
  );

  const searchStatus = (vet) => {
    const has = providerGrants(grants, vet.id);
    if (has.some((g) => g.status === "pending")) return t("vetShare.askedAccess");
    return has.some((g) => isGrantActive(g)) ? t("vetShare.hasAccess") : null;
  };

  const loadState = () => {
    if (loadFailed) {
      return (
        <View style={card}>
          <Text style={text}>{t("vetShare.loadError")}</Text>
          <SecondaryButton label={t("vetShare.retry")} onPress={retry} />
        </View>
      );
    }
    return ready ? null : <ActivityIndicator color={COLORS.coral} />;
  };

  const unsupportedNote =
    ready && !supported ? (
      <Note testID="vet-share-unsupported" style={{ marginTop: SPACING.md }}>
        <Text style={text}>{t("vetShare.unsupported")}</Text>
      </Note>
    ) : null;

  const requestsCard =
    pendingCount > 0 ? (
      <View style={card}>
        <Text style={text}>{t("vetShare.pending", { count: pendingCount })}</Text>
        <SecondaryButton label={t("vetShare.seeRequests")} onPress={onOpenRequests} />
      </View>
    ) : null;

  const emergencyCard = (
    <>
      <Heading>{t("vetShare.linkTitle")}</Heading>
      <View style={card}>
        <Text style={text}>{t("vetShare.linkBody")}</Text>
        <SecondaryButton label={t("vetShare.linkCta")} onPress={openEmergencyCard} />
      </View>
    </>
  );

  const endedList =
    ended.length > 0 ? (
      <>
        <Disclosure
          testID="vet-share-ended-toggle"
          label={`${t("vetShare.endedTitle")} (${ended.length})`}
          open={showEnded}
          onPress={() => setShowEnded((v) => !v)}
        />
        {showEnded
          ? ended.map((grant) => (
              <View key={grant.id} style={card}>
                <Text style={bold}>{vetName(grant.provider_name)}</Text>
                <GrantAccess grant={grant} petName={petName} />
                {revokeButton(grant)}
              </View>
            ))
          : null}
      </>
    ) : null;

  const noDiagnosis = (
    <Text style={[muted, { marginTop: SPACING.lg }]}>{t("vetShare.noDiagnosis")}</Text>
  );

  // Step 1: which vet. Search first; the vets already dealt with below it; a link as the second way.
  const renderPick = () => {
    const noVets = ready && listed.length === 0;
    // With no vet to pick and no search, a link is the way forward, so it is already open.
    const linksOpen = showLinks ?? (noVets && canSearch === false);
    const linksInUse = activeRecordLinks(linkList?.links).length;
    return (
      <>
        <Text style={text}>{t("vetShare.introPick")}</Text>
        {unsupportedNote}
        {requestsCard}
        {loadState()}
        {ready && supported ? (
          <VetSearch
            picked={found}
            selectedId={pickedId}
            onPick={chooseFound}
            describe={searchStatus}
            canLink={canLink}
          />
        ) : null}
        {vets.sharing.length > 0 ? (
          <>
            <Heading>{t("vetShare.sharingTitle")}</Heading>
            {vets.sharing.map(sharingCard)}
          </>
        ) : null}
        {supported && vets.asking.length > 0 ? (
          <>
            <Heading>{t("vetShare.askingTitle")}</Heading>
            {vets.asking.map((vet) => vetRow(vet, t("vetShare.askedAccess")))}
          </>
        ) : null}
        {supported && vets.booked.length > 0 ? (
          <>
            <Heading>{t("vetShare.bookedTitle")}</Heading>
            {vets.booked.map((vet) => vetRow(vet, null))}
          </>
        ) : null}
        {noVets && supported ? (
          <View style={[card, { marginTop: SPACING.sm }]}>
            <Text style={text}>{t(noVetsKey(canSearch, canLink), { pet: petName })}</Text>
          </View>
        ) : null}

        <ShareOffers pet={pet} />

        <Disclosure
          testID="vet-share-by-link"
          label={t("vetShare.byLink")}
          hint={linksInUse > 0 ? t("vetShare.linksInUse", { count: linksInUse }) : null}
          open={linksOpen}
          onPress={() => setShowLinks(!linksOpen)}
        />
        {linksOpen ? (
          <View testID="vet-share-link-panel">
            <RecordLinks
              pet={pet}
              onCreate={links.start}
              onEdit={canEditLinks ? links.startEdit : undefined}
            />
            {supported ? <InviteVet /> : null}
            {emergencyCard}
          </View>
        ) : null}
        {endedList}
        {noDiagnosis}
      </>
    );
  };

  // `besideName`: the vet's card above already says that a change applies to what they have.
  const accessNotes = ({ besideName = false } = {}) => (
    <>
      {selected?.searched ? (
        <Note testID="vet-share-check-found">
          <Text style={text}>{t("shareOffer.checkName", { provider: vetName(selected.name) })}</Text>
        </Note>
      ) : null}
      {fixed?.checkName && !access.active ? (
        <Note testID="vet-share-check-name">
          <Text style={text}>{t("vetShare.checkName", { provider: vetName(fixed.name) })}</Text>
        </Note>
      ) : null}
      {access.pending ? (
        <Note testID="vet-share-pending-note">
          <Text style={text}>{t("vetShare.pendingNote")}</Text>
        </Note>
      ) : null}
      {access.active && !(besideName && editing) ? (
        <Note testID={editing ? "vet-share-edit-note" : "vet-share-replace-note"}>
          <Text style={text}>{t(editing ? "vetShare.edit.note" : "vetShare.replaceNote")}</Text>
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

  // The vet the sheet is about, or why there is nothing to choose yet.
  const renderFixedWait = () => (
    <>
      <Text style={text}>{t("vetShare.intro")}</Text>
      {unsupportedNote}
      <Heading>{t("vetShare.providerTitle")}</Heading>
      {loadState() ?? (
        <View testID="vet-share-provider" style={card}>
          <Text style={bold}>{vetName(fixed.name)}</Text>
        </View>
      )}
      {requestsCard}
      {vets.sharing.map(sharingCard)}
      {emergencyCard}
      {endedList}
      {noDiagnosis}
    </>
  );

  // Step 2: what to share, what can be added and for how long, for the vet picked.
  const renderAccess = () => {
    const keptEnd = editing?.expires_at ? formatLocalDate(editing.expires_at) : null;
    const expiryOptions = [
      ...(editing
        ? [{
            key: KEEP_EXPIRY,
            label: keptEnd
              ? t("vetShare.expiry.keepDate", { date: keptEnd })
              : t("vetShare.expiry.keepRevoked"),
          }]
        : []),
      // Keeping an access that has no end already says "until I revoke it".
      ...SHARE_EXPIRIES.filter((key) => !(editing && !keptEnd && key === "until_revoked")).map(
        (key) => ({
          key,
          // Short enough for the four lengths to share one line.
          label: t(key === "until_revoked" ? "vetShare.expiry.untilRevokedShort" : `vetShare.expiry.${key}`),
        }),
      ),
    ];
    const others = fixed ? vets.sharing.filter((v) => String(v.providerId) !== String(fixed.providerId)) : [];
    return (
      <View testID="vet-share-access">
        <View
          testID="vet-share-selected"
          style={[card, row, { alignItems: "center", paddingVertical: SPACING.sm }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={muted}>{t("vetShare.providerTitle")}</Text>
            <Text style={bold}>{vetName(selected.name)}</Text>
            {editing ? (
              <Text testID="vet-share-edit-note" style={muted}>{t("vetShare.edit.note")}</Text>
            ) : access.active || access.pending ? (
              <Text style={muted}>{t(access.pending ? "vetShare.askedAccess" : "vetShare.hasAccess")}</Text>
            ) : null}
          </View>
          {fixed ? null : (
            <TouchableOpacity
              testID="vet-share-change"
              accessibilityRole="button"
              onPress={() => setPickedId(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[bold, { color: COLORS.terracotta }]}>{t("vetShare.changeVet")}</Text>
            </TouchableOpacity>
          )}
        </View>
        {accessNotes({ besideName: true })}
        <SectionPicker
          key={selected.providerId}
          testPrefix="vet-share"
          sections={sections}
          editSections={adds}
          onChange={change}
          canAdd={canAdd}
          describe={(key) => t(`vetShare.section.${key}.description`, { pet: petName })}
          footer={<Note icon={EyeOff}>{neverShared}</Note>}
        />
        <Heading>{t("vetShare.expiryTitle")}</Heading>
        <ExpiryChips
          testPrefix="vet-share-expiry"
          options={expiryOptions}
          value={expiry}
          onChange={(key) => change({ expiry: key })}
        />
        {canReview ? null : (
          <Text style={[muted, { marginTop: SPACING.sm }]}>
            {t(chosen ? "vetShare.edit.unchanged" : "vetShare.missing")}
          </Text>
        )}
        {current ? (
          <View style={[card, { marginTop: SPACING.lg }]}>
            <Text style={bold}>{t("vetShare.currentTitle")}</Text>
            <GrantAccess grant={current} petName={petName} />
            {revokeButton(current)}
          </View>
        ) : null}
        {fixed ? (
          <>
            {requestsCard}
            {others.length > 0 ? <Heading>{t("vetShare.sharingTitle")}</Heading> : null}
            {others.map(sharingCard)}
            {emergencyCard}
            {endedList}
          </>
        ) : null}
        {noDiagnosis}
      </View>
    );
  };

  // Step 3: who will see (and add) what, until when, and consent.
  const renderReview = () => {
    const name = vetName(selected.name);
    const kept = expiry === KEEP_EXPIRY;
    const end = kept
      ? editing.expires_at && new Date(editing.expires_at)
      : expiryDate(expiry);
    const date = end ? formatLocalDate(end) : null;
    // An invitation's time starts when it is accepted, so it has a length and no end date yet.
    const length = invites ? t(`vetShare.expiry.${expiry}`) : null;
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
    consentText += alsoAdds("vetShare.consentAdds", adds);
    const left = SHARE_SECTIONS.filter((k) => !sections.includes(k));
    // "Read only" is said only when nothing can be added.
    let canKey = invites ? "shareOffer.reviewCan" : "vetShare.reviewCan";
    if (adds.length > 0) canKey = invites ? "shareOffer.reviewCanSee" : "vetShare.reviewCanSee";
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
          <Text style={[bold, { marginBottom: 6 }]}>{t(canKey, { pet: petName })}</Text>
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
        {canAdd ? (
          <View testID="vet-share-review-add" style={card}>
            {adds.length > 0 ? (
              <>
                <Text style={[bold, { marginBottom: 6 }]}>{t("vetShare.reviewCanAdd")}</Text>
                <Bullets lines={addLines(t, adds)} style={text} />
                <Text style={muted}>{t("vetShare.noDelete")}</Text>
              </>
            ) : (
              <Text style={text}>{t("vetShare.reviewNoAdds")}</Text>
            )}
          </View>
        ) : null}
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
    else if (editing) ctaLabel = t(edit.isPending ? "vetShare.edit.saving" : "vetShare.edit.cta");
    else ctaLabel = share.isPending ? t("vetShare.sharing") : t("vetShare.cta");
    ctaDisabled = !canSubmit;
    onCtaPress = submit;
  } else if (isOwner && selected) {
    ctaLabel = t(editing ? "vetShare.edit.reviewCta" : "vetShare.reviewCta");
    ctaDisabled = !canReview;
    onCtaPress = openReview;
  }

  let content = <Text style={text}>{t("vetShare.ownerOnly", { pet: petName })}</Text>;
  if (isOwner) {
    if (reviewing) content = renderReview();
    else if (selected) content = renderAccess();
    else content = fixed ? renderFixedWait() : renderPick();
  }
  if (isOwner && links.step) {
    ({ content, ctaLabel, ctaDisabled, onCtaPress } = links);
  }

  let title = fixed ? "vetShare.titleProvider" : "vetShare.title";
  if (fixed && editing) title = "vetShare.titleEdit";
  if (editLink || links.editing) title = "recordLink.edit.sheetTitle";

  return (
    <KeyboardSafeFormModal
      visible
      onClose={onClose}
      title={t(title)}
      // A link being changed may be another dog's: the list holds every dog's links.
      subtitle={links.editing ? links.editing.pet_name || t("dataAccess.yourPet") : petName}
      ctaLabel={ctaLabel}
      ctaDisabled={ctaDisabled}
      onCtaPress={onCtaPress}
      scrollRef={scrollRef}
    >
      {content}
    </KeyboardSafeFormModal>
  );
}
