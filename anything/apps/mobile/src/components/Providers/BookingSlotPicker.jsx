import React, { useState, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { useProviderAvailability } from "@/hooks/useProviders";
import {
  monthRange,
  buildMonthMatrix,
  slotZonedParts,
} from "@/utils/providerSlots";
import { formatDisplayTime, uses12HourClock } from "@/utils/canonicalDateTime";

// OSDE-style slot picker (PR-2): a month calendar where only days WITH availability are
// selectable, then discrete time-slot chips for the chosen day. Consumes PR-1's
// GET /availability ({ time_zone, availability:[{date, slots:[{start,end}]}] }) — slots are
// absolute-UTC instants formatted in the provider's time_zone. Selection is lifted to the
// parent via onSelect(slot, timeZone); the parent derives appointment_date/time + start_at.
// No free-form entry: a range with no availability shows an empty state, never a text field.

// Monday-first short weekday headers, localized (reference week starts Mon 2024-01-01).
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(
    new Date(2024, 0, 1 + i),
  ),
);

function monthLabel(year, month) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));
}

export default function BookingSlotPicker({
  providerId,
  capability,
  selected,
  onSelect,
  t,
}) {
  const now = new Date();
  const [visible, setVisible] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const { from, to } = monthRange(visible.year, visible.month);
  const { data, isLoading } = useProviderAvailability(providerId, {
    from,
    to,
    capability,
  });
  const timeZone = data?.time_zone ?? null;

  // date → slots[] for days that actually have at least one open slot.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const d of data?.availability ?? []) {
      if ((d.slots?.length ?? 0) > 0) map.set(d.date, d.slots);
    }
    return map;
  }, [data]);

  const [day, setDay] = useState(null);
  // Keep the open day valid for the current data: default to the first available day, and
  // clear a day that no longer has slots (after month nav / capability switch).
  useEffect(() => {
    if (day && byDay.has(day)) return;
    setDay([...byDay.keys()].sort()[0] ?? null);
  }, [byDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const weeks = buildMonthMatrix(visible.year, visible.month);
  const daySlots = day ? byDay.get(day) ?? [] : [];
  const hour12 = uses12HourClock();

  const goMonth = (delta) => {
    onSelect?.(null, timeZone); // a slot from the old month no longer applies
    setDay(null);
    setVisible((v) => {
      const m = v.month + delta;
      return {
        year: v.year + Math.floor(m / 12),
        month: ((m % 12) + 12) % 12,
      };
    });
  };

  const selectDay = (date) => {
    if (date === day) return;
    onSelect?.(null, timeZone); // switching day clears the chosen slot
    setDay(date);
  };

  return (
    <View>
      {/* Month navigation */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <TouchableOpacity
          testID="booking-month-prev"
          onPress={() => goMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel={t("booking.prevMonth")}
          style={{ padding: 8 }}
        >
          <ChevronLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}>
          {monthLabel(visible.year, visible.month)}
        </Text>
        <TouchableOpacity
          testID="booking-month-next"
          onPress={() => goMonth(1)}
          accessibilityRole="button"
          accessibilityLabel={t("booking.nextMonth")}
          style={{ padding: 8 }}
        >
          <ChevronRight size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
      </View>

      {/* Weekday header (Mon-first) */}
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text
            key={i}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 12,
              fontWeight: "700",
              color: COLORS.mutedBrown,
            }}
          >
            {label}
          </Text>
        ))}
      </View>

      {/* Day grid — a day is selectable only if it has ≥1 slot. */}
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: "row" }}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={{ flex: 1, height: 44 }} />;
            const available = byDay.has(date);
            const isSelectedDay = date === day;
            const dayNum = Number(date.slice(8, 10));
            return (
              <View key={di} style={{ flex: 1, alignItems: "center" }}>
                <TouchableOpacity
                  testID={`booking-day-${date}`}
                  disabled={!available}
                  onPress={() => selectDay(date)}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !available,
                    selected: isSelectedDay,
                  }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    margin: 3,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isSelectedDay
                      ? COLORS.coral
                      : available
                        ? COLORS.sand
                        : "transparent",
                    borderWidth: available && !isSelectedDay ? 1 : 0,
                    borderColor: COLORS.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: available ? "700" : "400",
                      color: isSelectedDay
                        ? "#FFF"
                        : available
                          ? COLORS.warmBrown
                          : COLORS.mutedBrown,
                      opacity: available ? 1 : 0.4,
                    }}
                  >
                    {dayNum}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ))}

      {/* Slots for the open day, or an honest empty state (no free-form fallback). */}
      <View style={{ marginTop: 14 }}>
        {isLoading ? (
          <ActivityIndicator color={COLORS.coral} />
        ) : byDay.size === 0 ? (
          <Text
            testID="booking-no-slots"
            style={{ color: COLORS.mutedBrown, fontSize: 14, textAlign: "center" }}
          >
            {t("booking.noSlots")}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            {daySlots.map((slot) => {
              const isSel = selected?.start === slot.start;
              const label = timeZone
                ? formatDisplayTime(
                    slotZonedParts(slot.start, timeZone).time,
                    hour12,
                  )
                : "";
              return (
                <TouchableOpacity
                  key={slot.start}
                  testID={`booking-slot-${slot.start}`}
                  onPress={() => onSelect?.(slot, timeZone)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: isSel ? COLORS.coral : COLORS.peach,
                    backgroundColor: isSel ? COLORS.coral : COLORS.sand,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 13,
                      color: isSel ? "#FFF" : COLORS.mutedBrown,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
