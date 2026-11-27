import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, EyeOff, Square, SquareCheck, TriangleAlert } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import {
  LINKS_UNAVAILABLE,
  useCreateRecordLink,
  useEditRecordLink,
  useRevokeRecordLink,
} from "@/hooks/useRecordLinks";
import { formatLocalDate } from "@/utils/localeDateTime";
import {
  KEEP_EXPIRY,
  LINK_EXPIRIES,
  choiceOfShare,
  expiryDate,
  isSameChoice,
} from "@/utils/vetShare";
import { Bullets } from "./GrantAccess";
import SecondaryButton from "./SecondaryButton";
import SectionPicker, { ExpiryChips } from "./SectionPicker";
import { addLines, addNames } from "./ShareAccess";
import { Choice, Heading, Note, bold, card, muted, picked, row, text } from "./parts";

// Names one request to create a link, so that sending it again cannot create a second one.
const newRequestKey = () => `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function errorKey(error) {
  if (error?.code === LINKS_UNAVAILABLE) return "unavailable";
  if (error?.code === "edit_access_unavailable") return "editUnavailable";
  if (error?.code === "link_limit") return "limit";
  if (error?.status === 429) return "tooMany";
  if (error?.status === 404) return "notAllowed";
  if (error?.status === 400) return "rejected";
  return "create";
}

function editErrorKey(error) {
  if (error?.code === "edit_access_unavailable") return "editUnavailable";
  if (error?.code === "link_not_active") return "notActive";
  if (error?.status === 429) return "tooMany";
  if (error?.status === 404) return "gone";
  if (error?.status === 400) return "rejected";
  return "save";
}

// What a section opens through a link. Files saved with a web address are listed but never opened through one.
const descriptionKey = (key) =>
  key === "files" || key === "photos"
    ? `recordLink.section.${key}`
    : `vetShare.section.${key}.description`;

// A link can take vet notes without showing the ones there are.
const ADD_WITHOUT_SEEING = ["vet_notes"];

const NOTHING = { sections: [], editSections: [], expiry: null };

const startingState = (link) =>
  link
    ? { step: "linkChoose", editing: link, choice: choiceOfShare(link) }
    : { step: null, editing: null, choice: NOTHING };

/**
 * Creating or changing a record link inside the share sheet: choose the parts, how long and what can be added, read who
 * will be able to see it and agree. A new link is handed to the phone's share sheet; a changed one keeps its address.
 * Nothing is selected beforehand for a new link, and nothing can be added unless the owner turns it on.
 *
 * `canAdd`: the server can store what can be added (each part has its own "Can add"; a link can be changed). Without
 * it a new link only offers adding vet notes. `initialLink`: open straight on changing that link. `onDone`: called when
 * the steps are left, saved or not.
 *
 * Returns { step: null | "linkChoose" | "linkReview", editing, start, startEdit, content, ctaLabel, ctaDisabled,
 * onCtaPress }.
 */
export default function useRecordLinkSteps({ pet, canAdd = false, initialLink = null, onDone }) {
  const { t } = useTranslation();
  const [{ step, editing, choice }, setState] = useState(() => startingState(initialLink));
  const [consent, setConsent] = useState(false);
  // State changes too late to stop a second tap in the same frame.
  const inFlight = useRef(false);
  // The key of the last request, kept while the choice is the same: an answer that got lost is asked for again.
  const request = useRef(null);

  const petName = (editing ? editing.pet_name : pet?.name) || t("dataAccess.yourPet");
  const { sections, expiry } = choice;
  const adds = choice.editSections;
  const allowNotes = adds.includes("vet_notes");

  const close = () => {
    request.current = null;
    setState(startingState(null));
    setConsent(false);
  };
  const leave = () => {
    close();
    onDone?.();
  };
  const start = () => {
    close();
    setState({ step: "linkChoose", editing: null, choice: NOTHING });
  };
  const startEdit = (link) => {
    close();
    setState(startingState(link));
  };
  const change = (next) => setState((s) => ({ ...s, choice: { ...s.choice, ...next } }));
  const goTo = (nextStep) => {
    setConsent(false);
    setState((s) => ({ ...s, step: nextStep }));
  };

  const remove = useRevokeRecordLink({
    onError: () => Alert.alert(t("recordLink.error.removeTitle"), t("recordLink.error.remove")),
  });
  const removeButtons = (linkId, keepKey) => [
    { text: t(keepKey), style: "cancel" },
    ...(linkId != null
      ? [{ text: t("recordLink.remove"), style: "destructive", onPress: () => remove.mutate(linkId) }]
      : []),
  ];

  const create = useCreateRecordLink({
    onSuccess: ({ outcome, linkId }) => {
      leave();
      if (outcome === "shared") {
        Alert.alert(t("recordLink.sharedTitle"), t("recordLink.sharedBody"));
      } else if (outcome === "notShared") {
        Alert.alert(t("recordLink.notSentTitle"), t("recordLink.notSentBody"), removeButtons(linkId, "recordLink.keep"));
      } else if (outcome === "mismatch") {
        Alert.alert(t("vetShare.notSharedTitle"), t("recordLink.mismatchBody"));
      } else {
        Alert.alert(t("recordLink.mismatchKeptTitle"), t("recordLink.mismatchKeptBody"), removeButtons(linkId, "vetShare.later"));
      }
    },
    onError: (error) => {
      goTo("linkChoose");
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

  const save = useEditRecordLink({
    onSuccess: ({ outcome, linkId }) => {
      leave();
      if (outcome === "saved") {
        Alert.alert(t("recordLink.edit.savedTitle"), t("recordLink.edit.savedBody"));
      } else {
        Alert.alert(
          t("recordLink.edit.mismatchTitle"),
          t("recordLink.edit.mismatchBody"),
          removeButtons(linkId, "vetShare.later"),
        );
      }
    },
    onError: (error) => {
      goTo("linkChoose");
      const key = editErrorKey(error);
      Alert.alert(t("recordLink.edit.errorTitle"), t(`recordLink.edit.error.${key}`));
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const busy = create.isPending || save.isPending;
  const chosen = sections.length > 0 && !!expiry;
  const changed = !editing || !isSameChoice(editing, choice);
  const complete = chosen && changed;
  const keptEnd = editing?.expires_at ? formatLocalDate(editing.expires_at) : "";
  const end = expiryDate(expiry);
  const date = expiry === KEEP_EXPIRY ? keptEnd : end ? formatLocalDate(end) : "";

  const submit = () => {
    if (!complete || !consent || inFlight.current) return;
    inFlight.current = true;
    if (editing) {
      save.mutate({ link: editing, sections, editSections: adds, expiry });
      return;
    }
    const key = JSON.stringify([pet.id, sections, expiry, adds]);
    if (request.current?.choice !== key) request.current = { choice: key, key: newRequestKey() };
    create.mutate({
      requestKey: request.current.key,
      petId: pet.id,
      petName,
      sections,
      expiry,
      allowNotes,
      // A server that cannot store what can be added is told about notes only, as before.
      editSections: canAdd ? adds : undefined,
      message: t("recordLink.message", { pet: petName, date }),
    });
  };

  const expiryOptions = [
    ...(editing
      ? [{ key: KEEP_EXPIRY, label: t("vetShare.expiry.keepDate", { date: keptEnd }) }]
      : []),
    ...LINK_EXPIRIES.map((key) => ({ key, label: t(`vetShare.expiry.${key}`) })),
  ];

  const renderChoose = () => (
    <View testID="record-link-choose">
      {/* The sheet's own title says that a link is being changed. */}
      {editing ? null : <Heading>{t("recordLink.title")}</Heading>}
      <Text style={text}>
        {t(editing ? "recordLink.edit.intro" : "recordLink.chooseIntro", { pet: petName })}
      </Text>

      <SectionPicker
        testPrefix="record-link"
        sections={sections}
        editSections={adds}
        onChange={change}
        canAdd={canAdd}
        addWithoutSeeing={ADD_WITHOUT_SEEING}
        describe={(key) => t(descriptionKey(key), { pet: petName })}
        footer={
          <Note icon={EyeOff}>
            <Text style={muted}>{t("vetShare.neverShared")}</Text>
          </Note>
        }
      />

      <Heading>{t("vetShare.expiryTitle")}</Heading>
      <ExpiryChips
        testPrefix="record-link-expiry"
        options={expiryOptions}
        value={expiry}
        onChange={(key) => change({ expiry: key })}
      />

      {canAdd ? null : (
        <>
          <Heading>{t("recordLink.notesTitle")}</Heading>
          <Choice
            testID="record-link-allow-notes"
            role="checkbox"
            selected={allowNotes}
            onPress={() => change({ editSections: allowNotes ? [] : ["vet_notes"] })}
            title={t("recordLink.allowNotes")}
            description={t("recordLink.allowNotesHint")}
          />
        </>
      )}
      {complete ? null : (
        <Text style={[muted, { marginTop: 8 }]}>
          {t(chosen ? "vetShare.edit.unchanged" : "vetShare.missing")}
        </Text>
      )}
      <SecondaryButton testID="record-link-cancel" label={t("common.cancel")} onPress={leave} />
    </View>
  );

  const renderAdds = () => {
    if (!canAdd) {
      return (
        <View testID="record-link-review-notes" style={card}>
          <Text style={text}>
            {t(allowNotes ? "recordLink.reviewNotesOn" : "recordLink.reviewNotesOff")}
          </Text>
        </View>
      );
    }
    return (
      <View testID="record-link-review-add" style={card}>
        {adds.length > 0 ? (
          <>
            <Text style={[bold, { marginBottom: 6 }]}>{t("vetShare.reviewCanAdd")}</Text>
            <Bullets lines={addLines(t, adds)} style={text} />
            <Text style={muted}>{t("recordLink.reviewAddNames")}</Text>
          </>
        ) : (
          <Text style={text}>{t("recordLink.reviewNoAdds")}</Text>
        )}
      </View>
    );
  };

  const renderReview = () => (
    <View testID="record-link-review">
      <Heading>{t(editing ? "recordLink.edit.reviewTitle" : "recordLink.reviewTitle")}</Heading>
      <Note icon={TriangleAlert} testID="record-link-warning" style={picked}>
        <Text style={bold}>{t("recordLink.warning", { pet: petName, date })}</Text>
        <Text style={text}>{t("recordLink.warningForward")}</Text>
      </Note>
      <View testID="record-link-review-sections" style={card}>
        <Text style={[bold, { marginBottom: 6 }]}>
          {t("recordLink.reviewCan", { pet: petName })}
        </Text>
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
      {renderAdds()}
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
          {canAdd && adds.length > 0
            ? ` ${t("recordLink.consentAdds", { adds: addNames(t, adds) })}`
            : ""}
        </Text>
      </TouchableOpacity>
      <SecondaryButton
        testID="record-link-back"
        label={t("vetShare.back")}
        onPress={() => goTo("linkChoose")}
        disabled={busy}
      />
    </View>
  );

  const shared = { step, editing, start, startEdit };
  if (step === "linkReview") {
    let ctaLabel = t(create.isPending ? "recordLink.creating" : "recordLink.cta");
    if (editing) ctaLabel = t(save.isPending ? "vetShare.edit.saving" : "vetShare.edit.cta");
    return {
      ...shared,
      content: renderReview(),
      ctaLabel,
      ctaDisabled: !consent || busy,
      onCtaPress: submit,
    };
  }
  return {
    ...shared,
    content: step ? renderChoose() : null,
    ctaLabel: t(editing ? "vetShare.edit.reviewCta" : "vetShare.reviewCta"),
    ctaDisabled: !complete,
    onCtaPress: () => {
      if (complete) goTo("linkReview");
    },
  };
}
