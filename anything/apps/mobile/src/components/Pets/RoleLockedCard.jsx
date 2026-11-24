import React from "react";
import { View, Text } from "react-native";
import { Lock } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";

// A friendly, non-technical "this part is for the owner and family" card. Shown INSTEAD of a section the person's role on the shared
// dog cannot open (e.g. a caregiver and the vet record) — the server would answer 403, so we never fire the requests at all.
export function RoleLockedCard({ petName, testID = "role-locked-card" }) {
  const { t } = useTranslation();
  return (
    <View
      testID={testID}
      style={{
        margin: 20,
        padding: 20,
        borderRadius: 18,
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.peach,
        alignItems: "center",
      }}
    >
      <Lock size={28} color={COLORS.coral} />
      <Text style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown, marginTop: 10, textAlign: "center" }}>
        {t("sharedDog.lockedCaregiverTitle")}
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.mutedBrown, marginTop: 8, lineHeight: 20, textAlign: "center" }}>
        {t("sharedDog.lockedCaregiverBody", { name: petName || t("common.yourPet") })}
      </Text>
    </View>
  );
}

export default RoleLockedCard;
