import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Share,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Share2, Trash2, ShieldAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import QRCode from "react-native-qrcode-svg";
import { COLORS } from "@/constants/colors";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  useEmergencyCard,
  useUpdateEmergencyCard,
  useCreateEmergencyLink,
  useRevokeEmergencyLink,
  tagUrl,
  cardUrl,
} from "@/hooks/useEmergencyCard";

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
      activeOpacity={0.85}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? COLORS.coral : COLORS.peach,
        backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
      }}
    >
      <Text style={{ color: selected ? COLORS.coral : COLORS.warmBrown, fontWeight: "700", fontSize: 13 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function EmergencyCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const { data: currentPet } = useCurrentPet();
  const petId = params.petId || (currentPet?.id != null ? String(currentPet.id) : "");

  const { data, isLoading } = useEmergencyCard(petId || null);
  const update = useUpdateEmergencyCard(petId);
  const createLink = useCreateEmergencyLink(petId);
  const revokeLink = useRevokeEmergencyLink(petId);

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
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", padding: 6 }}>
          <ChevronLeft size={22} color={COLORS.coral} />
          <Text style={{ color: COLORS.coral, fontWeight: "700" }}>{t("common.back")}</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: COLORS.warmBrown, marginRight: 60 }}>
          {t("emergencyCard.title")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {isLoading ? (
          <Text style={{ color: COLORS.mutedBrown, textAlign: "center", marginTop: 24 }}>{t("common.loading")}</Text>
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
                <Row label={t("emergencyCard.species")} value={pet?.species} />
                <Row label={t("emergencyCard.breed")} value={pet?.breed} />
                <Row label={t("emergencyCard.microchip")} value={medical?.microchip_id} />
                <Row label={t("emergencyCard.bloodType")} value={card?.blood_type} />
                <Row label={t("emergencyCard.spayNeuter")} value={medical?.spayed_neutered_status} />
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

            {/* Tag QR */}
            <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginTop: 18, borderWidth: 1, borderColor: COLORS.peach }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>{t("emergencyCard.tagQrTitle")}</Text>
              <Text style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 2 }}>
                {t("emergencyCard.tagQrHint")}
              </Text>
              {card?.tag_token ? (
                <View testID="tag-qr" style={{ alignItems: "center", marginTop: 12 }}>
                  <QRCode value={tagUrl(card.tag_token)} size={160} />
                  <Text selectable style={{ color: COLORS.mutedBrown, fontSize: 11, marginTop: 8 }}>
                    {tagUrl(card.tag_token)}
                  </Text>
                </View>
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

              <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 14, marginBottom: 8 }}>
                {t("emergencyCard.finderReach")}
              </Text>
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
              {(card?.contact_mode === "phone" || card?.contact_mode === "email") && (
                <TextInput
                  testID="contact-value"
                  defaultValue={card?.contact_value || ""}
                  onEndEditing={(e) => update.mutate({ contact_value: e.nativeEvent.text })}
                  placeholder={card?.contact_mode === "phone" ? t("emergencyCard.phoneNumberPlaceholder") : t("emergencyCard.emailPlaceholder")}
                  placeholderTextColor={COLORS.mutedBrown}
                  style={{ marginTop: 10, backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, color: COLORS.warmBrown }}
                />
              )}
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

              <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 12, marginBottom: 6 }}>{t("emergencyCard.expires")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
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
                onPress={() => createLink.mutate({ scope: linkScope, ttlHours: linkTtl })}
                activeOpacity={0.85}
                style={{ marginTop: 14, backgroundColor: COLORS.sageDark, borderRadius: 14, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>{t("emergencyCard.createVetLink")}</Text>
              </TouchableOpacity>

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
                        {l.expires_at ? t("emergencyCard.expiresOn", { date: new Date(l.expires_at).toLocaleDateString() }) : t("emergencyCard.expiryNoneShort")}
                      </Text>
                      <TouchableOpacity testID={`share-link-${l.id}`} onPress={() => shareVetLink(l.token)}>
                        <Text style={{ color: COLORS.coral, fontSize: 12 }} numberOfLines={1}>
                          {cardUrl(l.token)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
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
        )}
      </ScrollView>
    </View>
  );
}
