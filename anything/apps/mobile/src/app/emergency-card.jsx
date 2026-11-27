import React, { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/ui";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  Share,
  Alert,
  Pressable,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Share2, Trash2, ShieldAlert, Info, Copy, Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { COLORS } from "@/constants/colors";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { usePetPermissions } from "@/hooks/usePetPermissions";
import { breedLabel } from "@/data/dogBreeds";
import {
  useEmergencyCard,
  useUpdateEmergencyCard,
  useCreateEmergencyLink,
  useRevokeEmergencyLink,
  tagUrl,
  cardUrl,
} from "@/hooks/useEmergencyCard";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { spayNeuterLabel } from "@/utils/healthText";
import { formatLocalDate } from "@/utils/localeDateTime";
import { shareQrImage } from "@/utils/emergencyQrShare";
import { goBackOr } from "@/utils/navigationBack";

const contactModes = (t) => [
  { key: "relay", label: t("emergencyCard.contactRelay") },
  { key: "phone", label: t("emergencyCard.contactPhone") },
  { key: "email", label: t("emergencyCard.contactEmail") },
  { key: "none", label: t("emergencyCard.contactNone") },
];
const expiryOptions = (t) => [
  { key: 24, label: t("emergencyCard.expiry24h") },
  { key: 168, label: t("emergencyCard.expiry7d") },
  { key: null, label: t("emergencyCard.expiryNone") },
];

// One plain sentence per way a finder can reach the owner (shown under the chips for the selected one).
const contactHint = (t, mode) =>
  ({
    relay: t("emergencyCard.contactRelayHint"),
    phone: t("emergencyCard.contactPhoneHint"),
    email: t("emergencyCard.contactEmailHint"),
    none: t("emergencyCard.contactNoneHint"),
  })[mode];

// One plain sentence for what the two switches show a finder right now.
const channelsHint = (t, card) => {
  const phone = !!card.contact_phone_enabled;
  const email = !!card.contact_email_enabled;
  if (phone && email) return t("emergencyCard.channelsBothHint");
  if (phone) return t("emergencyCard.channelsPhoneHint");
  if (email) return t("emergencyCard.channelsEmailHint");
  return contactHint(t, card.contact_message_enabled ? "relay" : "none");
};

// A phone / email is shown only when it looks like one (the server applies the same rule).
const isShown = (mode, value) => {
  const text = String(value || "").trim();
  return !!text && text.includes("@") === (mode === "email");
};

// Say when a finder would not see the saved value. With nothing at all to show they get the message form instead;
// `otherShown` = the other channel is on and showing, so there is no form.
const contactWarning = (t, mode, value, otherShown = false) => {
  if ((mode !== "phone" && mode !== "email") || isShown(mode, value)) return null;
  const missing = !String(value || "").trim();
  if (mode === "phone") {
    if (missing) {
      return otherShown ? t("emergencyCard.contactPhoneMissingHidden") : t("emergencyCard.contactPhoneMissing");
    }
    return otherShown ? t("emergencyCard.contactPhoneMismatchHidden") : t("emergencyCard.contactPhoneMismatch");
  }
  if (missing) {
    return otherShown ? t("emergencyCard.contactEmailMissingHidden") : t("emergencyCard.contactEmailMissing");
  }
  return otherShown ? t("emergencyCard.contactEmailMismatchHidden") : t("emergencyCard.contactEmailMismatch");
};

function speciesLabel(t, species) {
  const key = String(species || "").toLowerCase();
  if (key === "dog") return t("emergencyCard.speciesDog");
  if (key === "cat") return t("emergencyCard.speciesCat");
  return species;
}

function Row({ label, value }) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.peach,
      }}
    >
      <Text style={{ color: COLORS.mutedBrown, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: COLORS.warmBrown, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>
        {value == null || value === "" ? t("emergencyCard.notRecorded") : String(value)}
      </Text>
    </View>
  );
}

function Chip({ selected, label, onPress, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, checked: !!selected }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        minHeight: 36,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? COLORS.coral : COLORS.peach,
        backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
      }}
    >
      {selected ? <Check size={14} color={COLORS.coral} /> : null}
      <Text style={{ color: selected ? COLORS.coral : COLORS.warmBrown, fontWeight: "700", fontSize: 13 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function InfoRow({ text, testID }) {
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", gap: 8, marginTop: 10, backgroundColor: COLORS.sand, borderRadius: 12, padding: 10 }}
    >
      <Info size={16} color={COLORS.mutedBrown} />
      <Text style={{ flex: 1, color: COLORS.warmBrown, fontSize: 12, lineHeight: 17 }}>{text}</Text>
    </View>
  );
}

// Memoised: the QR only redraws when its link changes, never because a toggle or chip was tapped.
const TagQr = React.memo(function TagQr({ url, getRef, onLongPress, hint }) {
  return (
    <View testID="tag-qr" style={{ alignItems: "center", marginTop: 12 }}>
      <Pressable testID="tag-qr-press" onLongPress={onLongPress} accessibilityHint={hint}>
        <QRCode value={url} size={176} quietZone={10} backgroundColor="#FFFFFF" getRef={getRef} />
      </Pressable>
      <Text selectable style={{ color: COLORS.mutedBrown, fontSize: 11, marginTop: 8, textAlign: "center" }}>
        {url}
      </Text>
    </View>
  );
});

function SmallButton({ testID, icon: Icon, label, onPress, disabled }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: 40,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: COLORS.coral,
        backgroundColor: COLORS.card,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {Icon ? <Icon size={15} color={COLORS.coral} /> : null}
      <Text style={{ color: COLORS.coral, fontWeight: "800", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// The phone / email a finder may see. It saves from its own button (enabled only when the text changed), and
// also when the field is left or the screen is closed, so a typed number is never lost.
function ContactValueField({ mode, savedValue, onSave, testID = "contact" }) {
  const { t } = useTranslation();
  const saved = savedValue || "";
  const [draft, setDraft] = useState(null); // null = untouched
  const draftRef = useRef(null);
  const sentRef = useRef(saved);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Follows the cache: after a refused save it rolls back, so the same text can be sent again.
  useEffect(() => {
    sentRef.current = saved;
  }, [saved]);

  const commit = useCallback((text) => {
    if (text == null || text === sentRef.current) return;
    sentRef.current = text;
    onSaveRef.current(text);
  }, []);

  useEffect(() => () => commit(draftRef.current), [commit]);

  const dirty = draft != null && draft !== saved;
  return (
    <View style={{ marginTop: 10 }}>
      <TextInput
        testID={`${testID}-value`}
        defaultValue={saved}
        onChangeText={(text) => {
          draftRef.current = text;
          setDraft(text);
        }}
        onEndEditing={(e) => commit(e.nativeEvent.text)}
        keyboardType={mode === "phone" ? "phone-pad" : "email-address"}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={mode === "phone" ? t("emergencyCard.phoneNumberPlaceholder") : t("emergencyCard.emailPlaceholder")}
        placeholderTextColor={COLORS.mutedBrown}
        style={{ backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, color: COLORS.warmBrown }}
      />
      <TouchableOpacity
        testID={`${testID}-save`}
        accessibilityRole="button"
        disabled={!dirty}
        onPress={() => {
          commit(draftRef.current);
          Keyboard.dismiss();
        }}
        activeOpacity={0.85}
        style={{ marginTop: 8, backgroundColor: COLORS.coral, borderRadius: 12, paddingVertical: 10, alignItems: "center", opacity: dirty ? 1 : 0.45 }}
      >
        <Text style={{ color: "#fff", fontWeight: "800" }}>
          {draft != null && !dirty ? t("emergencyCard.saved") : t("common.save")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ContactWarning({ testID, text }) {
  if (!text) return null;
  return (
    <Text testID={testID} style={{ color: COLORS.warmBrown, fontSize: 12, fontWeight: "700", marginTop: 8 }}>
      {text}
    </Text>
  );
}

function SwitchRow({ testID, label, value, onValueChange }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
      <Text style={{ color: COLORS.warmBrown, fontWeight: "700", flex: 1 }}>{label}</Text>
      <Switch testID={testID} accessibilityLabel={label} value={value} onValueChange={onValueChange} />
    </View>
  );
}

// Phone and email are switched on separately, each with its own value. With both off, one more switch chooses
// between the private message form and no way to get in touch.
function FinderChannels({ card, onChange }) {
  const { t } = useTranslation();
  const phoneOn = !!card.contact_phone_enabled;
  const emailOn = !!card.contact_email_enabled;
  const phoneShown = phoneOn && isShown("phone", card.contact_phone);
  const emailShown = emailOn && isShown("email", card.contact_email);
  return (
    <View>
      <SwitchRow
        testID="toggle-contact-phone"
        label={t("emergencyCard.showPhoneToFinder")}
        value={phoneOn}
        onValueChange={(v) => onChange({ contact_phone_enabled: v })}
      />
      {phoneOn ? (
        <View>
          <ContactValueField
            testID="contact-phone"
            mode="phone"
            savedValue={card.contact_phone}
            onSave={(contact_phone) => onChange({ contact_phone })}
          />
          <ContactWarning
            testID="contact-phone-warning"
            text={contactWarning(t, "phone", card.contact_phone, emailShown)}
          />
        </View>
      ) : null}
      <SwitchRow
        testID="toggle-contact-email"
        label={t("emergencyCard.showEmailToFinder")}
        value={emailOn}
        onValueChange={(v) => onChange({ contact_email_enabled: v })}
      />
      {emailOn ? (
        <View>
          <ContactValueField
            testID="contact-email"
            mode="email"
            savedValue={card.contact_email}
            onSave={(contact_email) => onChange({ contact_email })}
          />
          <ContactWarning
            testID="contact-email-warning"
            text={contactWarning(t, "email", card.contact_email, phoneShown)}
          />
        </View>
      ) : null}
      {!phoneOn && !emailOn ? (
        <SwitchRow
          testID="toggle-contact-message"
          label={t("emergencyCard.allowFinderMessage")}
          value={!!card.contact_message_enabled}
          onValueChange={(v) => onChange({ contact_message_enabled: v })}
        />
      ) : null}
      <InfoRow testID="contact-hint" text={channelsHint(t, card)} />
    </View>
  );
}

export default function EmergencyCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const { data: currentPet } = useCurrentPet();
  // The tag QR, who-can-reach-me settings and vet links are the OWNER's. A family member or caregiver sees the card itself (read-only):
  // the server sends them no tag token, no contacts and no links, and refuses the writes.
  const { can } = usePetPermissions();
  const canEditCard = can("editEmergencyCard");
  const petId = params.petId || (currentPet?.id != null ? String(currentPet.id) : "");

  const { data, isLoading, isError, refetch } = useEmergencyCard(petId || null);
  const saveFailed = () => Alert.alert(t("emergencyCard.saveError"));
  const update = useUpdateEmergencyCard(petId, { onError: saveFailed });
  const createLink = useCreateEmergencyLink(petId, { onError: saveFailed });
  const revokeLink = useRevokeEmergencyLink(petId, { onError: saveFailed });

  const cardRef = useRef(null);
  const [linkScope, setLinkScope] = useState("full");
  const [linkTtl, setLinkTtl] = useState(168);

  const card = data?.card;
  const pet = data?.pet;
  const medical = data?.medical;
  const allergies = data?.allergies || [];
  const conditions = data?.conditions || [];
  const lost = data?.lost;
  const links = data?.links || [];
  // Null / absent = the server does not support the setting yet, so there is no switch to show.
  const tagKinSetting = card?.show_emergency_contact_on_tag;
  // Null / absent = the server only knows the single choice, so the screen offers that.
  const hasChannelSwitches = typeof card?.contact_phone_enabled === "boolean";
  const hasEmergencyContact = !!(
    String(medical?.emergency_contact_name || "").trim() || String(medical?.emergency_contact_phone || "").trim()
  );

  // "Save and create link" rests once this exact choice has a live link; changing a choice wakes it up.
  const linkSaved =
    !!createLink.isSuccess &&
    createLink.variables?.scope === linkScope &&
    createLink.variables?.ttlHours === linkTtl &&
    links.some((l) => l.id === createLink.data?.link?.id);
  const createDisabled = !!createLink.isPending || linkSaved;

  const [copied, setCopied] = useState(null); // which link was just copied
  useEffect(() => {
    if (copied == null) return undefined;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copyLink = async (key, url) => {
    try {
      await Clipboard.setStringAsync(url);
      setCopied(key);
    } catch (e) {
      Alert.alert(t("emergencyCard.copyError"));
    }
  };

  const qrSvgRef = useRef(null);
  const getQrRef = useCallback((svg) => {
    qrSvgRef.current = svg;
  }, []);
  const sharingQr = useRef(false);
  const shareQrRef = useRef(null);
  shareQrRef.current = async () => {
    if (sharingQr.current || !card?.tag_token) return;
    sharingQr.current = true;
    try {
      await shareQrImage({ svg: qrSvgRef.current, petName: pet?.name, url: tagUrl(card.tag_token), t });
    } catch (e) {
      Alert.alert(t("emergencyCard.qrShareError"));
    } finally {
      sharingQr.current = false;
    }
  };
  const shareQr = useCallback(() => shareQrRef.current?.(), []);

  const shareCard = async () => {
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1 });
      const available = await Sharing.isAvailableAsync().catch(() => false);
      if (available && uri) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: `${pet?.name || t("emergencyCard.myPet")} — ${t("emergencyCard.title")}`,
          UTI: "public.png",
        });
      }
    } catch (e) {
      // Graceful no-op (capture/sharing unavailable, e.g. Expo Go).
    }
  };

  const shareVetLink = async (token) => {
    try {
      await Share.share({ message: cardUrl(token) });
    } catch (e) {
      // no-op
    }
  };

  if (!petId) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: COLORS.mutedBrown }}>{t("emergencyCard.noPetSelected")}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => goBackOr(router, "/(tabs)/health")} style={{ flexDirection: "row", alignItems: "center", padding: 6 }}>
          <ChevronLeft size={22} color={COLORS.coral} />
          <Text style={{ color: COLORS.coral, fontWeight: "700" }}>{t("common.back")}</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: COLORS.warmBrown, marginRight: 60 }}>
          {t("emergencyCard.title")}
        </Text>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {isLoading ? (
          <Text style={{ color: COLORS.mutedBrown, textAlign: "center", marginTop: 24 }}>{t("common.loading")}</Text>
        ) : isError && !data ? (
          // A failed load must not render an empty card (reads as "no allergies / no vet").
          <ErrorState testID="emergency-error" onRetry={() => refetch?.()} style={{ marginTop: 24 }} />
        ) : (
          <>
            {lost && (
              <View
                testID="lost-banner"
                style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#C2410C", borderRadius: 12, padding: 12, marginBottom: 14 }}
              >
                <ShieldAlert size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }}>
                  {t("emergencyCard.lostBanner")}{lost.reward ? ` · ${t("emergencyCard.reward")}: ${lost.reward}` : ""}
                </Text>
              </View>
            )}

            {/* The capturable card (shared as an image). */}
            <View
              ref={cardRef}
              collapsable={false}
              style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.peach }}
            >
              <View style={{ alignItems: "center" }}>
                <PetAvatar uri={pet?.avatar_url || undefined} name={pet?.name} size={84} />
                <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown, marginTop: 8 }}>
                  {pet?.name || t("emergencyCard.myPet")}
                </Text>
                <Text style={{ color: COLORS.coral, fontWeight: "700" }}>{t("emergencyCard.hasHome")}</Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <Row label={t("emergencyCard.species")} value={speciesLabel(t, pet?.species)} />
                <Row label={t("emergencyCard.breed")} value={breedLabel(t, pet?.breed)} />
                <Row label={t("emergencyCard.microchip")} value={medical?.microchip_id} />
                <Row label={t("emergencyCard.bloodType")} value={card?.blood_type} />
                <Row label={t("emergencyCard.spayNeuter")} value={spayNeuterLabel(medical?.spayed_neutered_status)} />
                <Row label={t("emergencyCard.allergies")} value={allergies.map((a) => a.allergen).join(", ")} />
                <Row label={t("emergencyCard.conditions")} value={conditions.map((c) => c.condition).join(", ")} />
                <Row label={t("emergencyCard.primaryVet")} value={medical?.primary_vet_name} />
                <Row label={t("emergencyCard.vetPhone")} value={medical?.vet_phone} />
                <Row label={t("emergencyCard.emergencyContact")} value={medical?.emergency_contact_name} />
                <Row label={t("emergencyCard.emergencyPhone")} value={medical?.emergency_contact_phone} />
              </View>
              <Text style={{ color: COLORS.mutedBrown, fontSize: 11, marginTop: 10, textAlign: "center" }}>
                {t("emergencyCard.footerHint")}
              </Text>
            </View>

            <TouchableOpacity
              testID="share-card"
              onPress={shareCard}
              activeOpacity={0.85}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, backgroundColor: COLORS.coral, borderRadius: 14, paddingVertical: 12 }}
            >
              <Share2 size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800" }}>{t("emergencyCard.shareCardImage")}</Text>
            </TouchableOpacity>

            {canEditCard ? (
              <>
            {/* Tag QR */}
            <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginTop: 18, borderWidth: 1, borderColor: COLORS.peach }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>{t("emergencyCard.tagQrTitle")}</Text>
              <Text style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 2 }}>
                {t("emergencyCard.tagQrHint")}
              </Text>
              {card?.tag_token ? (
                <>
                  <TagQr
                    url={tagUrl(card.tag_token)}
                    getRef={getQrRef}
                    onLongPress={shareQr}
                    hint={t("emergencyCard.qrLongPressHint")}
                  />
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 }}>
                    <SmallButton testID="share-qr" icon={Share2} label={t("emergencyCard.shareQr")} onPress={shareQr} />
                    <SmallButton
                      testID="copy-tag-link"
                      icon={copied === "tag" ? Check : Copy}
                      label={copied === "tag" ? t("emergencyCard.linkCopied") : t("emergencyCard.copyLink")}
                      onPress={() => copyLink("tag", tagUrl(card.tag_token))}
                    />
                  </View>
                </>
              ) : null}

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                <Text style={{ color: COLORS.warmBrown, fontWeight: "700", flex: 1 }}>
                  {t("emergencyCard.showMedicalOnTag")}
                </Text>
                <Switch
                  testID="toggle-medical"
                  value={!!card?.show_medical_on_tag}
                  onValueChange={(v) => update.mutate({ show_medical_on_tag: v })}
                />
              </View>

              {typeof tagKinSetting === "boolean" ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                    <Text style={{ color: COLORS.warmBrown, fontWeight: "700", flex: 1 }}>
                      {t("emergencyCard.showEmergencyContactOnTag")}
                    </Text>
                    <Switch
                      testID="toggle-emergency-contact"
                      accessibilityLabel={t("emergencyCard.showEmergencyContactOnTag")}
                      value={tagKinSetting}
                      onValueChange={(v) => update.mutate({ show_emergency_contact_on_tag: v })}
                    />
                  </View>
                  <Text testID="emergency-contact-hint" style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 4 }}>
                    {t("emergencyCard.showEmergencyContactOnTagHint")}
                  </Text>
                  {tagKinSetting && !hasEmergencyContact ? (
                    <Text testID="emergency-contact-missing" style={{ color: COLORS.warmBrown, fontSize: 12, fontWeight: "700", marginTop: 6 }}>
                      {t("emergencyCard.emergencyContactMissing")}
                    </Text>
                  ) : null}
                </>
              ) : null}

              <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 14, marginBottom: 8 }}>
                {t("emergencyCard.finderReach")}
              </Text>
              {hasChannelSwitches ? (
                <FinderChannels card={card} onChange={(patch) => update.mutate(patch)} />
              ) : (
                <>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {contactModes(t).map((m) => (
                      <Chip
                        key={m.key}
                        testID={`contact-${m.key}`}
                        label={m.label}
                        selected={(card?.contact_mode || "relay") === m.key}
                        onPress={() => update.mutate({ contact_mode: m.key })}
                      />
                    ))}
                  </View>
                  <InfoRow testID="contact-hint" text={contactHint(t, card?.contact_mode || "relay")} />
                  {(card?.contact_mode === "phone" || card?.contact_mode === "email") && (
                    <ContactValueField
                      key={card.contact_mode}
                      mode={card.contact_mode}
                      savedValue={card?.contact_value}
                      onSave={(contact_value) => update.mutate({ contact_value })}
                    />
                  )}
                  <ContactWarning
                    testID="contact-warning"
                    text={contactWarning(t, card?.contact_mode, card?.contact_value)}
                  />
                </>
              )}
              <Text style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 10 }}>{t("emergencyCard.autoSaveHint")}</Text>
            </View>

            {/* Vet links */}
            <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginTop: 18, borderWidth: 1, borderColor: COLORS.peach }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>{t("emergencyCard.shareWithVetTitle")}</Text>
              <Text style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 2 }}>
                {t("emergencyCard.shareWithVetHint")}
              </Text>

              <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 12, marginBottom: 6 }}>{t("emergencyCard.scope")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Chip testID="scope-full" label={t("emergencyCard.scopeFull")} selected={linkScope === "full"} onPress={() => setLinkScope("full")} />
                <Chip testID="scope-basic" label={t("emergencyCard.scopeBasic")} selected={linkScope === "basic"} onPress={() => setLinkScope("basic")} />
              </View>
              <InfoRow
                testID="scope-hint"
                text={linkScope === "basic" ? t("emergencyCard.scopeBasicHint") : t("emergencyCard.scopeFullHint")}
              />

              <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 12, marginBottom: 6 }}>{t("emergencyCard.expires")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {expiryOptions(t).map((e) => (
                  <Chip
                    key={String(e.key)}
                    testID={`ttl-${e.key}`}
                    label={e.label}
                    selected={linkTtl === e.key}
                    onPress={() => setLinkTtl(e.key)}
                  />
                ))}
              </View>

              <TouchableOpacity
                testID="create-link"
                // (AUDIT A-26) Guard against a double-tap creating two links.
                disabled={createDisabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: createDisabled }}
                onPress={() => {
                  if (createDisabled) return;
                  createLink.mutate({ scope: linkScope, ttlHours: linkTtl });
                }}
                activeOpacity={0.85}
                style={{ marginTop: 14, backgroundColor: COLORS.sageDark, borderRadius: 14, paddingVertical: 12, alignItems: "center", opacity: createDisabled ? 0.6 : 1 }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  {createLink.isPending
                    ? t("emergencyCard.saving")
                    : linkSaved
                      ? t("emergencyCard.linkSaved")
                      : t("emergencyCard.createVetLink")}
                </Text>
              </TouchableOpacity>
              {linkSaved ? (
                <Text testID="link-saved-hint" style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 6, textAlign: "center" }}>
                  {t("emergencyCard.linkSavedHint")}
                </Text>
              ) : null}

              {links.length === 0 ? (
                <Text testID="links-empty" style={{ color: COLORS.mutedBrown, marginTop: 12, fontSize: 13 }}>
                  {t("emergencyCard.noActiveLinks")}
                </Text>
              ) : (
                links.map((l) => (
                  <View
                    key={l.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.peach }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.warmBrown, fontWeight: "700" }}>
                        {l.scope === "basic" ? t("emergencyCard.scopeBasic") : t("emergencyCard.scopeFull")} ·{" "}
                        {l.expires_at ? t("emergencyCard.expiresOn", { date: formatLocalDate(l.expires_at) }) : t("emergencyCard.expiryNoneShort")}
                      </Text>
                      <TouchableOpacity testID={`share-link-${l.id}`} onPress={() => shareVetLink(l.token)}>
                        <Text style={{ color: COLORS.coral, fontSize: 12 }} numberOfLines={1}>
                          {cardUrl(l.token)}
                        </Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                        <SmallButton testID={`share-link-button-${l.id}`} icon={Share2} label={t("emergencyCard.shareLink")} onPress={() => shareVetLink(l.token)} />
                        <SmallButton
                          testID={`copy-link-${l.id}`}
                          icon={copied === l.id ? Check : Copy}
                          label={copied === l.id ? t("emergencyCard.linkCopied") : t("emergencyCard.copyLink")}
                          onPress={() => copyLink(l.id, cardUrl(l.token))}
                        />
                      </View>
                    </View>
                    <TouchableOpacity accessibilityLabel={t("common.delete")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      testID={`revoke-link-${l.id}`}
                      onPress={() =>
                        Alert.alert(t("emergencyCard.revokeTitle"), t("emergencyCard.revokeBody"), [
                          { text: t("common.cancel"), style: "cancel" },
                          { text: t("emergencyCard.revoke"), style: "destructive", onPress: () => revokeLink.mutate(l.id) },
                        ])
                      }
                    >
                      <Trash2 size={18} color="#C2410C" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
              </>
            ) : (
              <Text testID="emergency-owner-only" style={{ color: COLORS.mutedBrown, fontSize: 13, marginTop: 18, textAlign: "center" }}>
                {t("sharedDog.ownerOnlyHint")}
              </Text>
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
