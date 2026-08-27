import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { PawPrint } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";

// "Dogs allowed" chip for pet-friendly places (seeded providers of type
// 'pet_friendly' with a location.pet_policy string). Renders nothing when no
// policy is present, so it's safe to sprinkle on any location card.
export default function PetPolicyBadge({ policy }) {
  const { t } = useTranslation();
  if (!policy) return null;

  // The seed source (OSM tag / SerpAPI note) is free-text; we treat any non-empty
  // value as "dogs welcome". If the policy string is short and readable we show
  // it verbatim, otherwise we fall back to the localized label.
  const label =
    typeof policy === "string" && policy.length > 0 && policy.length <= 40
      ? policy
      : t("claim.dogsAllowedBadge");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        paddingHorizontal: SPACING.sm,
        paddingVertical: 4,
        borderRadius: RADIUS.chip,
        borderWidth: 1,
        borderColor: COLORS.peach,
        backgroundColor: COLORS.cream,
      }}
      accessibilityLabel={t("claim.dogsAllowedBadge")}
    >
      <PawPrint size={12} color={COLORS.coral} />
      <Text style={[TYPE.caption, { color: COLORS.brown, fontWeight: "700" }]}>
        {label}
      </Text>
    </View>
  );
}
