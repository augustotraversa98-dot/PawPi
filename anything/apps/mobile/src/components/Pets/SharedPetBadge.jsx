import React from "react";
import { View, Text } from "react-native";
import { Users } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { roleOfPet, isSharedPet, ownerNameOfPet } from "@/utils/petPermissions";
import { roleBadgeLabel, sharedByLabel } from "@/utils/sharingLabels";

// "Family" / "Caregiver" pill + "Shared by <owner>" for a dog that is SHARED with the viewer. Renders nothing for the viewer's own
// dog (an owner needs no badge). The owner's name is the public display name only (never an e-mail), or "Shared with you" when unset.
// Each viewer sees their OWN role on the same dog: the owner sees no badge, the partner sees "Family · Shared by Sam".
export function SharedPetBadge({ pet, showOwner = true, align = "flex-start", style }) {
  const { t } = useTranslation();
  if (!isSharedPet(pet)) return null;
  const role = roleOfPet(pet);
  return (
    <View testID="shared-pet-badge" style={[{ alignItems: align }, style]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: role === "family" ? COLORS.coral + "22" : COLORS.sage + "33",
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <Users size={11} color={role === "family" ? COLORS.coral : COLORS.sageDark} />
        <Text
          testID="shared-pet-role"
          style={{ fontSize: 11, fontWeight: "800", color: role === "family" ? COLORS.coral : COLORS.sageDark }}
        >
          {roleBadgeLabel(t, role)}
        </Text>
      </View>
      {showOwner ? (
        <Text testID="shared-pet-owner" style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 3 }} numberOfLines={1}>
          {sharedByLabel(t, ownerNameOfPet(pet))}
        </Text>
      ) : null}
    </View>
  );
}

export default SharedPetBadge;
