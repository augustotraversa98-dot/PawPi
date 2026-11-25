import React, { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/theme";
import { useRedeemInviteCode, inviteErrorKey } from "@/hooks/useInviteCodes";
import useSelectedPetStore from "@/store/selectedPetStore";

// "I have a code": joining a dog someone shared with a code. On success the dog is selected and the app opens on it —
// also for a brand-new account that came here from onboarding.
export default function RedeemInviteCard({ initialCode = "" }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const redeem = useRedeemInviteCode();
  const setSelectedPetId = useSelectedPetStore((s) => s.setSelectedPetId);
  const ready = code.replace(/[\s-]/g, "").length >= 12 && !redeem.isPending;

  const join = () => {
    if (!ready) return;
    redeem.mutate(code, {
      onSuccess: (data) => {
        setCode("");
        if (data?.pet_id != null) setSelectedPetId(data.pet_id);
        Alert.alert(t("inviteCode.joinedTitle"), t("inviteCode.joinedBody", { name: data?.pet_name }));
        router.replace("/(tabs)");
      },
      onError: (error) => Alert.alert(t("inviteCode.errorTitle"), t(inviteErrorKey(error))),
    });
  };

  return (
    <View testID="redeem-invite-card" style={styles.box}>
      <Text style={styles.title}>{t("inviteCode.haveTitle")}</Text>
      <Text style={styles.hint}>{t("inviteCode.haveHint")}</Text>
      <View style={styles.row}>
        <TextInput
          testID="redeem-invite-input"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={20}
          placeholder="ABCD-EFGH-JKMN"
          placeholderTextColor={COLORS.mutedBrown + "80"}
          accessibilityLabel={t("inviteCode.haveTitle")}
          returnKeyType="join"
          onSubmitEditing={join}
          style={styles.input}
        />
        <TouchableOpacity
          testID="redeem-invite-join"
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={join}
          style={[styles.button, !ready && { opacity: 0.5 }]}
        >
          <Text style={styles.buttonText}>{t("inviteCode.join")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = {
  box: {
    marginTop: 4,
    marginBottom: 16,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.peach,
    padding: 14,
  },
  title: { fontSize: 15, fontWeight: "800", color: COLORS.warmBrown },
  hint: { fontSize: 12, color: COLORS.mutedBrown, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.peach,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    letterSpacing: 1,
    color: COLORS.warmBrown,
  },
  button: { backgroundColor: COLORS.coral, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  buttonText: { color: "#FFF", fontWeight: "800" },
};
