import React, { useState } from "react";
import { Alert, Share, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/theme";
import { formatLocalDate } from "@/utils/localeDateTime";
import {
  useInviteCodes,
  useCreateInviteCode,
  useRevokeInviteCode,
  inviteErrorKey,
} from "@/hooks/useInviteCodes";

// OWNER: invite someone you cannot find by name. The new code is shown once (only its fingerprint is stored), can be
// shared, and works once for this dog. Codes still waiting can be cancelled.
export default function InviteCodePanel({ petId, petName, role }) {
  const { t } = useTranslation();
  const [fresh, setFresh] = useState(null); // { code, petId } — never persisted
  const { data: invites } = useInviteCodes(petId);
  const create = useCreateInviteCode(petId);
  const revoke = useRevokeInviteCode(petId);
  const roleName = (r) => t(r === "family" ? "petSharing.roleFamilyLabel" : "petSharing.roleCaregiverLabel");

  const fail = (error) => Alert.alert(t("inviteCode.errorTitle"), t(inviteErrorKey(error)));
  const makeCode = () => {
    if (create.isPending) return;
    create.mutate(role, {
      onSuccess: (data) => setFresh({ code: data.code, petId }),
      onError: fail,
    });
  };
  const share = async () => {
    try {
      await Share.share({
        message: t("inviteCode.shareMessage", {
          name: petName,
          code: fresh.code,
          link: `pawpi://pet-sharing?code=${fresh.code}`,
        }),
      });
    } catch {
      // the person closed the sheet, or sharing is unavailable: the code stays on screen
    }
  };

  return (
    <View testID="invite-code-panel" style={styles.box}>
      <Text style={styles.title}>{t("inviteCode.title")}</Text>
      <Text style={styles.hint}>{t("inviteCode.hint", { name: petName })}</Text>

      {fresh && fresh.petId === petId ? (
        <View style={styles.codeBox}>
          <Text testID="invite-code-value" selectable style={styles.code}>
            {fresh.code}
          </Text>
          <Text style={styles.hint}>{t("inviteCode.shownOnce")}</Text>
          <TouchableOpacity testID="invite-code-share" accessibilityRole="button" onPress={share} style={styles.primary}>
            <Text style={styles.primaryText}>{t("inviteCode.share")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        testID="invite-code-create"
        accessibilityRole="button"
        disabled={create.isPending}
        onPress={makeCode}
        style={[styles.secondary, create.isPending && { opacity: 0.6 }]}
      >
        <Text style={styles.secondaryText}>{t("inviteCode.create", { role: roleName(role) })}</Text>
      </TouchableOpacity>

      {(invites ?? []).map((invite) => (
        <View key={invite.id} testID={`invite-code-row-${invite.id}`} style={styles.row}>
          <Text style={styles.rowText}>
            {t("inviteCode.waiting", {
              role: roleName(invite.role),
              date: formatLocalDate(invite.expires_at, { day: "numeric", month: "short" }),
            })}
          </Text>
          <TouchableOpacity
            testID={`invite-code-revoke-${invite.id}`}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() =>
              revoke.mutate(invite.id, {
                onSuccess: () => setFresh(null),
                onError: fail,
              })
            }
          >
            <Text style={styles.cancel}>{t("inviteCode.revoke")}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = {
  box: {
    marginTop: 16,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.peach,
    padding: 14,
  },
  title: { fontSize: 15, fontWeight: "800", color: COLORS.warmBrown },
  hint: { fontSize: 12, color: COLORS.mutedBrown, lineHeight: 18, marginTop: 4 },
  codeBox: { marginTop: 12, alignItems: "center" },
  code: { fontSize: 24, fontWeight: "800", letterSpacing: 2, color: COLORS.warmBrown },
  primary: { marginTop: 10, backgroundColor: COLORS.coral, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 22 },
  primaryText: { color: "#FFF", fontWeight: "800" },
  secondary: { marginTop: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.coral, paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: COLORS.coral, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 12 },
  rowText: { flex: 1, fontSize: 13, color: COLORS.warmBrown },
  cancel: { fontSize: 12, fontWeight: "700", color: COLORS.terracotta },
};
