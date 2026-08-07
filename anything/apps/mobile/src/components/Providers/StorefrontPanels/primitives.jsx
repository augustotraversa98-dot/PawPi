import React from "react";
import { View, Text } from "react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, SPACING } from "@/constants/theme";
import { formatMoney } from "@/utils/money";

// Shared bits for the storefront section panels (extracted verbatim from
// app/service/provider.jsx during the Phase-1 shell refactor — presentational only).

// Shared formatter (src/utils/money.js) so a price never renders as one currency here and
// another in the Shop. Services carry no currency column → default ARS; products pass theirs.
export function formatPrice(cents, currency) {
  return formatMoney(cents, currency);
}

export function Section({ title, children }) {
  return (
    <View style={{ marginBottom: SPACING.lg + 2 }}>
      <Text
        style={[
          TYPE.subhead,
          {
            fontWeight: "800",
            color: COLORS.mutedBrown,
            marginBottom: SPACING.md,
            letterSpacing: 0.6,
          },
        ]}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export function Row({ icon, children }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}
    >
      {icon}
      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", flex: 1 }]}>
        {children}
      </Text>
    </View>
  );
}
