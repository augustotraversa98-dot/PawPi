import React from "react";
import { View, Text, Switch } from "react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";

export default function SocialWalkToggle({
  socialWalkEnabled,
  onSocialWalkEnabledChange,
}) {
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
          Offer as social walk
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
        Allow friends or nearby pets to join
      </Text>
    </View>
  );
}
