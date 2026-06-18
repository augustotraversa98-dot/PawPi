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

const CONTACT_MODES = [
  { key: "relay", label: "Relay (private)" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "none", label: "None" },
];
const EXPIRY = [
  { key: 24, label: "24 hours" },
  { key: 168, label: "7 days" },
  { key: null, label: "No expiry" },
];

function Row({ label, value }) {
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
        {value == null || value === "" ? "Not recorded" : String(value)}
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
          dialogTitle: `${pet?.name || "My pet"} — Emergency Card`,
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
        <Text style={{ color: COLORS.mutedBrown }}>No pet selected</Text>
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
          <Text style={{ color: COLORS.coral, fontWeight: "700" }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: COLORS.warmBrown, marginRight: 60 }}>
          Emergency Card
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {isLoading ? (
          <Text style={{ color: COLORS.mutedBrown, textAlign: "center", marginTop: 24 }}>Loading…</Text>
        ) : (
          <>
            {lost && (
              <View
                testID="lost-banner"
                style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#C2410C", borderRadius: 12, padding: 12, marginBottom: 14 }}
              >
                <ShieldAlert size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }}>
                  This pet is marked LOST{lost.reward ? ` · Reward: ${lost.reward}` : ""}
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
                  {pet?.name || "My pet"}
                </Text>
                <Text style={{ color: COLORS.coral, fontWeight: "700" }}>This dog has a home 💛</Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <Row label="Species" value={pet?.species} />
                <Row label="Breed" value={pet?.breed} />
                <Row label="Microchip" value={medical?.microchip_id} />
                <Row label="Blood type" value={card?.blood_type} />
                <Row label="Spay/neuter" value={medical?.spayed_neutered_status} />
                <Row label="Allergies" value={allergies.map((a) => a.allergen).join(", ")} />
                <Row label="Conditions" value={conditions.map((c) => c.condition).join(", ")} />
                <Row label="Primary vet" value={medical?.primary_vet_name} />
                <Row label="Vet phone" value={medical?.vet_phone} />
                <Row label="Emergency contact" value={medical?.emergency_contact_name} />
                <Row label="Emergency phone" value={medical?.emergency_contact_phone} />
              </View>
              <Text style={{ color: COLORS.mutedBrown, fontSize: 11, marginTop: 10, textAlign: "center" }}>
                Organized for a real vet. PawPi does not diagnose.
              </Text>
            </View>

            <TouchableOpacity
              testID="share-card"
              onPress={shareCard}
              activeOpacity={0.85}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, backgroundColor: COLORS.coral, borderRadius: 14, paddingVertical: 12 }}
            >
              <Share2 size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800" }}>Share card (image)</Text>
            </TouchableOpacity>

            {/* Tag QR */}
            <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginTop: 18, borderWidth: 1, borderColor: COLORS.peach }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>Printable tag QR</Text>
              <Text style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 2 }}>
                Print this on your dog’s tag. Anyone who finds them scans it — no app needed.
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
                  Show medical info on the public tag
                </Text>
                <Switch
                  testID="toggle-medical"
                  value={!!card?.show_medical_on_tag}
                  onValueChange={(v) => update.mutate({ show_medical_on_tag: v })}
                />
              </View>

              <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 14, marginBottom: 8 }}>
                How can a finder reach you?
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {CONTACT_MODES.map((m) => (
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
                  placeholder={card?.contact_mode === "phone" ? "Phone number" : "Email address"}
                  placeholderTextColor={COLORS.mutedBrown}
                  style={{ marginTop: 10, backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, color: COLORS.warmBrown }}
                />
              )}
            </View>

            {/* Vet links */}
            <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginTop: 18, borderWidth: 1, borderColor: COLORS.peach }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>Share with a vet</Text>
              <Text style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 2 }}>
                A private link to the full card. Set an expiry and revoke anytime.
              </Text>

              <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 12, marginBottom: 6 }}>Scope</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Chip testID="scope-full" label="Full" selected={linkScope === "full"} onPress={() => setLinkScope("full")} />
                <Chip testID="scope-basic" label="Basic" selected={linkScope === "basic"} onPress={() => setLinkScope("basic")} />
              </View>

              <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 12, marginBottom: 6 }}>Expires</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {EXPIRY.map((e) => (
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
                <Text style={{ color: "#fff", fontWeight: "800" }}>Create vet link</Text>
              </TouchableOpacity>

              {links.length === 0 ? (
                <Text testID="links-empty" style={{ color: COLORS.mutedBrown, marginTop: 12, fontSize: 13 }}>
                  No active links.
                </Text>
              ) : (
                links.map((l) => (
                  <View
                    key={l.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.peach }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.warmBrown, fontWeight: "700" }}>
                        {l.scope === "basic" ? "Basic" : "Full"} ·{" "}
                        {l.expires_at ? "expires " + new Date(l.expires_at).toLocaleDateString() : "no expiry"}
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
                        Alert.alert("Revoke link?", "This link will stop working immediately.", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Revoke", style: "destructive", onPress: () => revokeLink.mutate(l.id) },
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
