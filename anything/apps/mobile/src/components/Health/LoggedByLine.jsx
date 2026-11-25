import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/theme";
import { memberDisplayName } from "@/utils/sharingLabels";

// "Logged by Sam" under a history entry of a dog several people care for. The server sends the public display name only
// (`logged_by_name`, migration 0144); a deleted account reads "Former member". Older entries have no author: nothing.
export default function LoggedByLine({ name, style }) {
  const { t } = useTranslation();
  const shown = memberDisplayName(t, name);
  if (!shown) return null;
  return (
    <Text testID="logged-by" numberOfLines={1} style={[{ fontSize: 11, color: COLORS.mutedBrown, marginTop: 4 }, style]}>
      {t("health.loggedBy", { name: shown })}
    </Text>
  );
}
