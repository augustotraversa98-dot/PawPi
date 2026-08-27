import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { BadgeCheck, X, Clock, Check } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { useAuth } from "@/utils/auth/useAuth";
import {
  useMyClaimForProvider,
  useOpenClaim,
} from "@/hooks/useProviderClaims";

// "¿Es tu negocio? Reclamalo" call-to-action shown on an UNCLAIMED provider
// storefront (claim_status='unclaimed'). Renders nothing when the provider is
// already claimed, when the caller has an approved claim (they're the owner
// now), or before claim_status has loaded.
//
// The three visible states:
//   • unclaimed + no claim by me            → "¿Es tu negocio? Reclamalo" (opens modal)
//   • unclaimed + my claim is pending       → "Solicitud enviada" (disabled chip)
//   • unclaimed + my claim was rejected     → "Reintentar reclamo" (opens modal, re-opens)
//
// The modal collects an optional verification METHOD (phone/email/document) + a
// short NOTE. On success the server-side row transitions to 'pending' and the
// per-provider claim query invalidates → the button flips to "Solicitud enviada".
export default function ClaimCTA({ providerId, claimStatus }) {
  const { t } = useTranslation();
  const { isAuthenticated, signIn } = useAuth();
  const [open, setOpen] = useState(false);

  // Only render when the listing is actually unclaimed.
  const isUnclaimed = claimStatus === "unclaimed";
  const { data: myClaim } = useMyClaimForProvider(isUnclaimed ? providerId : null);

  if (!isUnclaimed) return null;

  const status = myClaim?.status ?? null; // null | pending | rejected | approved | withdrawn

  const onPress = () => {
    if (!isAuthenticated) {
      Alert.alert(t("claim.signInPrompt"), undefined, [
        { text: t("claim.signIn"), onPress: signIn },
        { text: t("common.cancel"), style: "cancel" },
      ]);
      return;
    }
    if (status === "pending") return;
    setOpen(true);
  };

  const label =
    status === "pending"
      ? t("claim.pendingBadge")
      : status === "rejected"
      ? t("claim.retryCta")
      : t("claim.cta");
  const Icon = status === "pending" ? Clock : BadgeCheck;
  const disabled = status === "pending";

  return (
    <View
      style={{
        marginBottom: SPACING.md,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.peach,
        backgroundColor: COLORS.cream,
        padding: SPACING.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <BadgeCheck size={20} color={COLORS.coral} />
        <Text style={[TYPE.h4, { color: COLORS.brown, flex: 1 }]}>
          {t("claim.headline")}
        </Text>
      </View>
      <Text
        style={[
          TYPE.body,
          { color: COLORS.brown, opacity: 0.8, marginTop: SPACING.xs, marginBottom: SPACING.md },
        ]}
      >
        {t("claim.subhead")}
      </Text>
      <PressableScale
        testID="provider-claim-cta"
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm + 4,
          borderRadius: RADIUS.chip,
          backgroundColor: disabled ? COLORS.card : COLORS.coral,
          borderWidth: 1.5,
          borderColor: disabled ? COLORS.peach : COLORS.coral,
          opacity: disabled ? 0.9 : 1,
        }}
      >
        <Icon size={16} color={disabled ? COLORS.coral : "#FFF"} />
        <Text
          style={[TYPE.body, { fontWeight: "800", color: disabled ? COLORS.coral : "#FFF" }]}
        >
          {label}
        </Text>
      </PressableScale>

      <ClaimModal
        visible={open}
        providerId={providerId}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

// The claim form modal — kept in-file since it's tightly coupled to the CTA and
// nothing else uses it. Method chips + optional note. On success closes itself;
// the parent CTA re-renders as "Solicitud enviada" via the invalidated query.
function ClaimModal({ visible, providerId, onClose }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState(null); // 'phone' | 'email' | 'document' | null
  const [note, setNote] = useState("");
  const openClaim = useOpenClaim();

  const submit = () => {
    if (openClaim.isPending) return;
    openClaim.mutate(
      { providerId, method, note: note.trim() || null },
      {
        onSuccess: () => {
          setMethod(null);
          setNote("");
          onClose();
          Alert.alert(t("claim.submittedTitle"), t("claim.submittedBody"));
        },
        onError: (err) => {
          const msg =
            err?.status === 409
              ? err?.claim_status === "claimed"
                ? t("claim.errorAlreadyClaimed")
                : t("claim.errorAlreadyPending")
              : err?.status === 404
              ? t("claim.errorNotFound")
              : t("claim.errorGeneric");
          Alert.alert(t("claim.errorTitle"), msg);
        },
      },
    );
  };

  const methods = [
    { key: "phone", label: t("claim.methodPhone") },
    { key: "email", label: t("claim.methodEmail") },
    { key: "document", label: t("claim.methodDocument") },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
          }}
        >
          <Text style={[TYPE.h3, { color: COLORS.brown }]}>{t("claim.modalTitle")}</Text>
          <PressableScale onPress={onClose} accessibilityLabel={t("common.close")}>
            <X size={22} color={COLORS.brown} />
          </PressableScale>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.md, gap: SPACING.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[TYPE.body, { color: COLORS.brown }]}>{t("claim.modalIntro")}</Text>

          <View>
            <Text style={[TYPE.h4, { color: COLORS.brown, marginBottom: SPACING.sm }]}>
              {t("claim.methodLabel")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
              {methods.map((m) => {
                const selected = method === m.key;
                return (
                  <PressableScale
                    key={m.key}
                    onPress={() => setMethod(selected ? null : m.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: SPACING.md,
                      paddingVertical: SPACING.sm,
                      borderRadius: RADIUS.chip,
                      borderWidth: 1.5,
                      borderColor: selected ? COLORS.coral : COLORS.peach,
                      backgroundColor: selected ? COLORS.coral : COLORS.card,
                    }}
                  >
                    {selected ? <Check size={14} color="#FFF" /> : null}
                    <Text
                      style={[
                        TYPE.body,
                        { fontWeight: "700", color: selected ? "#FFF" : COLORS.brown },
                      ]}
                    >
                      {m.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={[TYPE.h4, { color: COLORS.brown, marginBottom: SPACING.sm }]}>
              {t("claim.noteLabel")}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t("claim.notePlaceholder")}
              placeholderTextColor={COLORS.brown + "80"}
              multiline
              maxLength={500}
              style={{
                minHeight: 96,
                textAlignVertical: "top",
                padding: SPACING.sm,
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: COLORS.peach,
                backgroundColor: COLORS.card,
                color: COLORS.brown,
                fontFamily: TYPE.body.fontFamily,
              }}
            />
          </View>

          <PressableScale
            onPress={submit}
            disabled={openClaim.isPending}
            accessibilityRole="button"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: SPACING.md,
              borderRadius: RADIUS.chip,
              backgroundColor: COLORS.coral,
              opacity: openClaim.isPending ? 0.7 : 1,
            }}
          >
            {openClaim.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <BadgeCheck size={18} color="#FFF" />
            )}
            <Text style={[TYPE.body, { color: "#FFF", fontWeight: "800" }]}>
              {t("claim.submitCta")}
            </Text>
          </PressableScale>
          <Text
            style={[
              TYPE.caption,
              { color: COLORS.brown, opacity: 0.7, textAlign: "center" },
            ]}
          >
            {t("claim.reviewNote")}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
