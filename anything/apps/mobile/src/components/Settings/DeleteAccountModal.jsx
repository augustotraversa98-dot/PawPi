// The delete-account confirmation (App Store 5.1.1(v)) — OPTION B of docs/delete-account-contributions-options.md.
//
// A native Alert cannot hold a switch, so the first confirmation is this small modal:
//   • the body says what is deleted (no over-promise),
//   • the owner sentence appears ONLY for the owner of a dog that is shared with other people (real dog names),
//   • the switch "Also delete my posts about dogs shared with me" appears ONLY for a person who is a member of a dog that is not
//     their own. Default OFF. Its hint changes with the switch.
// onConfirm(deleteContributions) hands the choice back to the caller, which sends the request.

import React, { useEffect, useState } from "react";
import { Modal, View, Text, Switch, ScrollView, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/theme";
import { joinNames } from "@/utils/deleteAccountContext";

export default function DeleteAccountModal({
  visible,
  isMember = false,
  sharedDogNames = [],
  busy = false,
  onCancel,
  onConfirm,
}) {
  const { t } = useTranslation();
  const [deleteContributions, setDeleteContributions] = useState(false);

  // Every time the dialog opens it starts from the safe default (OFF).
  useEffect(() => {
    if (visible) setDeleteContributions(false);
  }, [visible]);

  const names = Array.isArray(sharedDogNames) ? sharedDogNames : [];
  const ownerSentence =
    names.length === 0
      ? null
      : names.length === 1
        ? t("settings.deleteAccountOwnerShared", { name: names[0] })
        : t("settings.deleteAccountOwnerSharedMany", {
            name: joinNames(names, t("settings.deleteAccountAnd")),
          });

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(59,36,27,0.45)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          testID="delete-account-modal"
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 20,
            padding: 20,
            maxHeight: "88%",
          }}
        >
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown, marginBottom: 10 }}>
              {t("settings.deleteAccountTitle")}
            </Text>
            <Text style={{ fontSize: 15, lineHeight: 21, color: COLORS.warmBrown }}>
              {t("settings.deleteAccountBody")}
            </Text>

            {ownerSentence ? (
              <Text
                testID="delete-account-owner-sentence"
                style={{ fontSize: 15, lineHeight: 21, color: COLORS.warmBrown, marginTop: 12, fontWeight: "700" }}
              >
                {ownerSentence}
              </Text>
            ) : null}

            {isMember ? (
              <View
                testID="delete-contributions-row"
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.sand,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.warmBrown, marginRight: 12 }}>
                    {t("settings.deleteContributionsLabel")}
                  </Text>
                  <Switch
                    testID="delete-contributions-switch"
                    value={deleteContributions}
                    onValueChange={setDeleteContributions}
                    disabled={busy}
                    accessibilityLabel={t("settings.deleteContributionsLabel")}
                  />
                </View>
                <Text
                  testID="delete-contributions-hint"
                  style={{ fontSize: 13, lineHeight: 18, color: COLORS.mutedBrown, marginTop: 6 }}
                >
                  {deleteContributions
                    ? t("settings.deleteContributionsHintOn")
                    : t("settings.deleteContributionsHintOff")}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 18, gap: 10 }}>
            <TouchableOpacity
              testID="delete-account-cancel"
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              style={{ paddingVertical: 12, paddingHorizontal: 16 }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: COLORS.mutedBrown }}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="delete-account-confirm"
              onPress={() => onConfirm(deleteContributions)}
              disabled={busy}
              accessibilityRole="button"
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 12,
                backgroundColor: "#B23A2E",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}>{t("settings.deleteAccountCta")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
