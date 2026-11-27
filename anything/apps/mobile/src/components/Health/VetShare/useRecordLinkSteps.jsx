import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, EyeOff, Square, SquareCheck, TriangleAlert } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { LINKS_UNAVAILABLE, useCreateRecordLink, useRevokeRecordLink } from "@/hooks/useRecordLinks";
import { formatLocalDate } from "@/utils/localeDateTime";
import { LINK_EXPIRIES, SHARE_SECTIONS, expiryDate } from "@/utils/vetShare";
import SecondaryButton from "./SecondaryButton";
import { Choice, Heading, Note, bold, card, muted, picked, row, text } from "./parts";

function errorKey(error) {
  if (error?.code === LINKS_UNAVAILABLE) return "unavailable";
  if (error?.code === "link_limit") return "limit";
  if (error?.status === 429) return "tooMany";
  if (error?.status === 404) return "notAllowed";
  if (error?.status === 400) return "rejected";
  return "create";
}

// What a section opens through a link. Files saved with a web address are listed but never opened through one.
const descriptionKey = (key) =>
  key === "files" || key === "photos"
    ? `recordLink.section.${key}`
    : `vetShare.section.${key}.description`;

/**
 * Creating a record link inside the share sheet: choose the parts, how long and whether notes can be added, read who
 * will be able to see it, agree, and hand the link to the phone's share sheet. Nothing is selected beforehand and
 * notes are off.
 *
 * Returns { step: null | "linkChoose" | "linkReview", start, content, ctaLabel, ctaDisabled, onCtaPress }.
 */
export default function useRecordLinkSteps({ pet }) {
  const { t } = useTranslation();
  const petName = pet?.name || t("dataAccess.yourPet");
  const [step, setStep] = useState(null);
  const [sections, setSections] = useState([]);
  const [expiry, setExpiry] = useState(null);
  const [allowNotes, setAllowNotes] = useState(false);
  const [consent, setConsent] = useState(false);
  // State changes too late to stop a second tap in the same frame.
  const inFlight = useRef(false);

  const close = () => {
    setStep(null);
    setSections([]);
    setExpiry(null);
    setAllowNotes(false);
    setConsent(false);
  };
  const start = () => {
    close();
    setStep("linkChoose");
  };

  const remove = useRevokeRecordLink({
    onError: () => Alert.alert(t("recordLink.error.removeTitle"), t("recordLink.error.remove")),
  });

  const create = useCreateRecordLink({
    onSuccess: ({ outcome, linkId }) => {
      close();
      const removeButtons = (keepKey) => [
        { text: t(keepKey), style: "cancel" },
        ...(linkId != null
          ? [{ text: t("recordLink.remove"), style: "destructive", onPress: () => remove.mutate(linkId) }]
          : []),
      ];
      if (outcome === "shared") {
        Alert.alert(t("recordLink.sharedTitle"), t("recordLink.sharedBody"));
      } else if (outcome === "notShared") {
        Alert.alert(t("recordLink.notSentTitle"), t("recordLink.notSentBody"), removeButtons("recordLink.keep"));
      } else if (outcome === "mismatch") {
        Alert.alert(t("vetShare.notSharedTitle"), t("recordLink.mismatchBody"));
      } else {
        Alert.alert(t("recordLink.mismatchKeptTitle"), t("recordLink.mismatchKeptBody"), removeButtons("vetShare.later"));
      }
    },
    onError: (error) => {
      setConsent(false);
      setStep("linkChoose");
      const key = errorKey(error);
      Alert.alert(
        t(`recordLink.error.${key}Title`),
        t(`recordLink.error.${key}`, { limit: error?.limit ?? 10 }),
      );
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const complete = sections.length > 0 && !!expiry;
  const end = expiryDate(expiry);
  const date = end ? formatLocalDate(end) : "";

  const toggleSection = (key) =>
    setSections((current) =>
      SHARE_SECTIONS.filter((k) => (k === key ? !current.includes(k) : current.includes(k))),
    );

  const submit = () => {
    if (!complete || !consent || inFlight.current) return;
    inFlight.current = true;
    create.mutate({
      petId: pet.id,
      sections,
      expiry,
      allowNotes,
      message: t("recordLink.message", { pet: petName, date }),
    });
  };

  const renderChoose = () => (
    <View testID="record-link-choose">
      <Heading>{t("recordLink.title")}</Heading>
      <Text style={text}>{t("recordLink.chooseIntro", { pet: petName })}</Text>

      <Heading>{t("vetShare.sectionsTitle")}</Heading>
      <Text style={[muted, { marginBottom: 8 }]}>{t("vetShare.sectionsHint")}</Text>
      {SHARE_SECTIONS.map((key) => (
        <Choice
          key={key}
          testID={`record-link-section-${key}`}
          role="checkbox"
          selected={sections.includes(key)}
          onPress={() => toggleSection(key)}
          title={t(`vetShare.section.${key}.title`)}
          description={t(descriptionKey(key), { pet: petName })}
        />
      ))}
      <Note icon={EyeOff}>
        <Text style={muted}>{t("vetShare.neverShared")}</Text>
      </Note>

      <Heading>{t("vetShare.expiryTitle")}</Heading>
      {LINK_EXPIRIES.map((key) => (
        <Choice
          key={key}
          testID={`record-link-expiry-${key}`}
          role="radio"
          selected={expiry === key}
          onPress={() => setExpiry(key)}
          title={t(`vetShare.expiry.${key}`)}
        />
      ))}

      <Heading>{t("recordLink.notesTitle")}</Heading>
      <Choice
        testID="record-link-allow-notes"
        role="checkbox"
        selected={allowNotes}
        onPress={() => setAllowNotes((v) => !v)}
        title={t("recordLink.allowNotes")}
        description={t("recordLink.allowNotesHint")}
      />
      {complete ? null : <Text style={muted}>{t("vetShare.missing")}</Text>}
      <SecondaryButton testID="record-link-cancel" label={t("common.cancel")} onPress={close} />
    </View>
  );

  const renderReview = () => (
    <View testID="record-link-review">
      <Heading>{t("recordLink.reviewTitle")}</Heading>
      <Note icon={TriangleAlert} testID="record-link-warning" style={picked}>
        <Text style={bold}>{t("recordLink.warning", { pet: petName, date })}</Text>
        <Text style={text}>{t("recordLink.warningForward")}</Text>
      </Note>
      <View testID="record-link-review-sections" style={card}>
        <Text style={[bold, { marginBottom: 6 }]}>{t("recordLink.reviewCan", { pet: petName })}</Text>
        {sections.map((key) => (
          <View key={key} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <Check size={16} color={COLORS.sageDark} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[text, { fontWeight: "700" }]}>{t(`vetShare.section.${key}.title`)}</Text>
              <Text style={muted}>{t(descriptionKey(key), { pet: petName })}</Text>
            </View>
          </View>
        ))}
        <Text style={muted}>{t("recordLink.reviewNames", { pet: petName })}</Text>
      </View>
      <View testID="record-link-review-notes" style={card}>
        <Text style={text}>
          {t(allowNotes ? "recordLink.reviewNotesOn" : "recordLink.reviewNotesOff")}
        </Text>
      </View>
      <Note>
        <Text style={muted}>{t("recordLink.endingLimit")}</Text>
      </Note>
      <TouchableOpacity
        testID="record-link-consent"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent((v) => !v)}
        style={[card, row, { marginTop: 8 }, consent && picked]}
      >
        {consent ? (
          <SquareCheck size={22} color={COLORS.coral} />
        ) : (
          <Square size={22} color={COLORS.mutedBrown} />
        )}
        <Text style={[text, { flex: 1, fontWeight: "600" }]}>
          {t("recordLink.consent", { pet: petName, date })}
        </Text>
      </TouchableOpacity>
      <SecondaryButton
        testID="record-link-back"
        label={t("vetShare.back")}
        onPress={() => {
          setConsent(false);
          setStep("linkChoose");
        }}
        disabled={create.isPending}
      />
    </View>
  );

  if (step === "linkReview") {
    return {
      step,
      start,
      content: renderReview(),
      ctaLabel: t(create.isPending ? "recordLink.creating" : "recordLink.cta"),
      ctaDisabled: !consent || create.isPending,
      onCtaPress: submit,
    };
  }
  return {
    step,
    start,
    content: step ? renderChoose() : null,
    ctaLabel: t("vetShare.reviewCta"),
    ctaDisabled: !complete,
    onCtaPress: () => {
      if (!complete) return;
      setConsent(false);
      setStep("linkReview");
    },
  };
}
