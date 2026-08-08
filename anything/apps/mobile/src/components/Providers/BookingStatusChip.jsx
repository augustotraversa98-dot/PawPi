import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS } from "@/constants/theme";

// Owner-facing status chip for a booking (booking_status). The single source of truth for the
// status label + tone shown in My Activity rows and the booking summary, so a booking never
// reads as an ambiguous/absent status. Active states are tinted (pending=coral, confirmed=green);
// completed is muted; the closed states (declined/cancelled) use a muted warning tone. An unknown
// or empty status renders nothing (the caller falls back to its raw value).
const TONES = {
  requested: { bg: COLORS.coral + "22", fg: COLORS.coral, key: "bookingStatus.requested" },
  confirmed: { bg: COLORS.sageDark + "22", fg: COLORS.sageDark, key: "bookingStatus.confirmed" },
  completed: { bg: COLORS.sand, fg: COLORS.mutedBrown, key: "bookingStatus.completed" },
  declined: { bg: COLORS.terracotta + "1F", fg: COLORS.terracotta, key: "bookingStatus.declined" },
  cancelled: { bg: COLORS.terracotta + "1F", fg: COLORS.terracotta, key: "bookingStatus.cancelled" },
};

// The booking_status values that resolve to a chip — lets callers decide whether to render the
// chip or fall back to the raw value for a legacy/unknown status.
export const BOOKING_STATUSES = Object.keys(TONES);

export default function BookingStatusChip({ status, testID }) {
  const { t } = useTranslation();
  const tone = TONES[status];
  if (!tone) return null;
  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: RADIUS.chip,
        backgroundColor: tone.bg,
      }}
    >
      <Text style={[TYPE.caption, { color: tone.fg, fontWeight: "800" }]}>
        {t(tone.key)}
      </Text>
    </View>
  );
}
