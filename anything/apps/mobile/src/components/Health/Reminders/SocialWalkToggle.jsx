import React from "react";
import { View, Text, Switch } from "react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";
import { useTranslation } from "react-i18next";

export default function SocialWalkToggle({
  socialWalkEnabled,
  onSocialWalkEnabledChange,
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        backgroundColor: C.sand,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: C.warmBrown,
          }}
        >
          {t("routinesUi.socialWalkToggle.offerAsSocialWalk")}
        </Text>
        <Switch
          value={socialWalkEnabled}
          onValueChange={onSocialWalkEnabledChange}
          trackColor={{ false: C.peach, true: C.sage + "60" }}
          thumbColor={socialWalkEnabled ? C.sage : "#fff"}
        />
      </View>
      <Text
        style={{
          fontSize: 11,
          color: C.mutedBrown,
        }}
      >
        {t("routinesUi.socialWalkToggle.allowFriendsOrNearbyPets")}
      </Text>
    </View>
  );
}
