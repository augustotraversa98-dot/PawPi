import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check, Circle, CircleDot, EyeOff, Info, Square, SquareCheck } from "lucide-react-native";
import KeyboardSafeFormModal from "@/components/KeyboardSafeFormModal";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";
import { useMyBookings } from "@/hooks/useProviders";
import {
  useCareAccessGrants,
  useShareRecord,
  useUpdateGrant,
} from "@/hooks/useCareAccessGrants";
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
import SecondaryButton from "./SecondaryButton";

// A refused request opened nothing; anything else leaves the owner to check the list.
const ERROR_KEYS = {
  400: "vetShare.error.rejected",
  404: "vetShare.error.gone",
  409: "vetShare.error.changed",
};

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
const row = { flexDirection: "row", gap: 12 };
const picked = { borderColor: COLORS.coral, borderWidth: 2 };

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

// A radio or checkbox row with a title and an optional explanation.
function Choice({ testID, role, selected, onPress, title, description }) {
  const On = role === "checkbox" ? SquareCheck : CircleDot;
  const Off = role === "checkbox" ? Square : Circle;
  const Icon = selected ? On : Off;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole={role}
      accessibilityState={role === "checkbox" ? { checked: selected } : { selected }}
      onPress={onPress}
      style={[card, row, { alignItems: "center" }, selected && picked]}
    >
      <Icon size={22} color={selected ? COLORS.coral : COLORS.mutedBrown} />
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.warmBrown }]}>{title}</Text>
        {description ? <Text style={muted}>{description}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function Note({ icon: Icon = Info, children, testID, style }) {
  return (
    <View testID={testID} style={[card, { flexDirection: "row", gap: 8 }, style]}>
      <Icon size={16} color={COLORS.mutedBrown} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 4 }}>{children}</View>
    </View>
  );
}

/**
 * Sharing the vet record: the owner picks a vet, the parts and how long, reviews who can see what, and consents.
 * Also lists who has access, with revoke. Mount it only while open (each opening starts with nothing selected).
 *
 * Props: pet ({ id, name, is_shared }), onClose, onOpenRequests (show the pending access requests), and optionally
 * provider ({ providerId, name, checkName }) to share with that one only (a booking, or a request being answered;
 * checkName asks the owner to make sure that business is their vet). Without a provider the owner can also invite a
 * vet by link.
 */
export default function ShareWithVetSheet({ pet, provider, onClose, onOpenRequests }) {
  const { t } = useTranslation();
  const router = useRouter();
  const petId = pet?.id;
  const petName = pet?.name || t("dataAccess.yourPet");
  const isOwner = !pet?.is_shared;
  const fixed = provider?.providerId != null ? provider : null;
  const vetName = (name) => name || t("dataAccess.thisProvider");

  const bookings = useMyBookings();
  const grantsQuery = useCareAccessGrants(isOwner ? petId : null);
  const updateGrant = useUpdateGrant(petId);

  const scrollRef = useRef(null);
  const [step, setStep] = useState("choose");
  const [pickedId, setPickedId] = useState(null);
  const [sections, setSections] = useState([]);
  const [expiry, setExpiry] = useState(null);
  const [consent, setConsent] = useState(false);

  const reset = () => {
    setStep("choose");
    setPickedId(null);
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
  }, [step]);

  const revokeNow = (grantId) =>
    updateGrant
      .mutateAsync({ grantId, action: "revoke" })
      .catch((e) =>
        Alert.alert(t("dataAccess.errorTitle"), friendlyErrorMessage(e, "dataAccess.tryAgain")),
      );

  const reportOutcome = ({ outcome, grant }, sent) => {
    const names = { provider: sent.providerName, pet: petName };
    const revokeButtons = (keepKey) => [
      { text: t(keepKey), style: "cancel" },
      { text: t("dataAccess.revokeCta"), style: "destructive", onPress: () => revokeNow(grant.id) },
    ];
    reset();
    if (outcome === "shared") {
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
      refetchGrants(); // the usual cause is a request or grant this screen had not seen yet
      setStep("choose");
      setConsent(false);
      Alert.alert(
        t("vetShare.errorTitle"),
        t(ERROR_KEYS[error?.status] ?? "vetShare.error.unconfirmed"),
      );
    },
  });

  const grants = grantsQuery.data;
  const vets = fixed ? [] : bookedVetsForPet(bookings.data, petId);
  // Nothing can be picked until we know who already has access.
  const ready =
    !!grants && !grantsQuery.isError && (!!fixed || (!!bookings.data && !bookings.isError));
  const loadFailed = grantsQuery.isError || (!fixed && bookings.isError);
  const supported = sectionsSupported(grants);
  const canChoose = ready && supported && (!!fixed || vets.length > 0);
  const selected = ready
    ? (fixed ?? vets.find((v) => String(v.providerId) === pickedId) ?? null)
    : null;
  const accessOf = (providerId) => {
    const mine = providerGrants(grants, providerId);
    return {
      pending: mine.some((g) => g.status === "pending"),
      active: mine.some((g) => isGrantActive(g)),
    };
  };
  const access = selected ? accessOf(selected.providerId) : null;
  const canReview = isOwner && canChoose && !!selected && sections.length > 0 && !!expiry;
  const reviewing = step === "review" && canReview;
  const canSubmit = reviewing && consent && !share.isPending;

  const active = (grants ?? []).filter((g) => isGrantActive(g));
  const ended = (grants ?? []).filter((g) => isGrantEnded(g));
  const pendingCount = (grants ?? []).filter((g) => g.status === "pending").length;

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
    share.mutate({
      petId,
      providerId: selected.providerId,
      providerName: vetName(selected.name),
      sections,
      expiry,
    });
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
          <Text style={text}>{t("vetShare.noVets", { pet: petName })}</Text>
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

  const accessNotes = () => (
    <>
      {fixed?.checkName ? (
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

  // With no booked vet to pick, the invite is the way forward, so it sits right there.
  const noVets = ready && !fixed && vets.length === 0;
  const invite = !fixed && supported ? <InviteVet pet={pet} /> : null;

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
            <Text style={[muted, { marginBottom: SPACING.sm }]}>{t("vetShare.pickHint", { pet: petName })}</Text>
          )}
          {renderVetPicker()}
          {accessNotes()}
        </>
      ) : null}

      {noVets ? invite : null}

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

      {noVets ? null : invite}

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
    const left = SHARE_SECTIONS.filter((k) => !sections.includes(k));
    return (
      <View testID="vet-share-review">
        <Heading>{t("vetShare.reviewTitle")}</Heading>
        <View style={card}>
          <Text style={bold}>{name}</Text>
          <Text style={muted}>{t("vetShare.reviewWho", { provider: name })}</Text>
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
          <Text style={bold}>
            {date ? t("vetShare.reviewUntilDate", { date }) : t("vetShare.reviewUntilRevoked")}
          </Text>
          <Text style={muted}>{t("vetShare.reviewLater")}</Text>
        </View>
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
          <Text style={[text, { flex: 1, fontWeight: "600" }]}>
            {date
              ? t("vetShare.consentDate", { provider: name, pet: petName, date })
              : t("vetShare.consentRevoke", { provider: name, pet: petName })}
          </Text>
        </TouchableOpacity>
        <SecondaryButton
          testID="vet-share-back"
          label={t("vetShare.back")}
          onPress={backToChoices}
          disabled={share.isPending}
        />
      </View>
    );
  };

  let ctaLabel = t("common.close");
  let ctaDisabled = false;
  let onCtaPress = onClose;
  if (isOwner && reviewing) {
    ctaLabel = share.isPending ? t("vetShare.sharing") : t("vetShare.cta");
    ctaDisabled = !canSubmit;
    onCtaPress = submit;
  } else if (isOwner) {
    ctaLabel = t("vetShare.reviewCta");
    ctaDisabled = !canReview;
    onCtaPress = openReview;
  }

  let content = <Text style={text}>{t("vetShare.ownerOnly", { pet: petName })}</Text>;
  if (isOwner) content = reviewing ? renderReview() : renderChoices();

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
