import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import ScheduleBlock, { scheduleFromItem } from "./ScheduleBlock";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

// Render pin for ScheduleBlock's conditional controls — nothing else mounts it,
// so this guards the JSX/testID wiring and the per-cadence sub-control switch:
//   - Date / Time / Frequency are always present;
//   - Hourly shows interval presets, no day chips;
//   - Weekly/Biweekly/Custom show multi-select day chips, no interval;
//   - Month-multiple / Once show neither;
//   - the emitted object carries the right fields back to the host.

function renderBlock(frequency, extra = {}) {
  const onChange = jest.fn();
  const value = scheduleFromItem({
    frequency,
    startDate: "2026-06-10",
    days: [2],
    ...extra,
  });
  const utils = render(<ScheduleBlock value={value} onChange={onChange} />);
  return { ...utils, onChange, value };
}

describe("ScheduleBlock — always-present controls", () => {
  it("renders Date, Time and a collapsed Frequency header (not the full list)", () => {
    const { getByTestId, getByText, queryByTestId } = renderBlock(
      ROUTINE_FREQUENCY.WEEKLY,
    );
    expect(getByTestId("schedule-block-date")).toBeTruthy();
    expect(getByTestId("schedule-block-time")).toBeTruthy();
    // Frequency starts collapsed: tappable header + current label, list hidden.
    expect(getByTestId("schedule-block-frequency-toggle")).toBeTruthy();
    expect(getByText("Weekly")).toBeTruthy();
    expect(queryByTestId("schedule-block-frequency-hourly")).toBeNull();
    expect(queryByTestId("schedule-block-frequency-once")).toBeNull();
    // Early reminder always present.
    expect(getByTestId("schedule-block-early-on_time")).toBeTruthy();
  });
});

describe("ScheduleBlock — collapsible Frequency", () => {
  it("tapping the header expands the full list; picking an option emits and collapses", () => {
    const { getByTestId, queryByTestId, onChange } = renderBlock(
      ROUTINE_FREQUENCY.WEEKLY,
    );
    // Collapsed: list hidden.
    expect(queryByTestId("schedule-block-frequency-monthly")).toBeNull();

    // Expand → full list, incl. hourly/yearly/once.
    fireEvent.press(getByTestId("schedule-block-frequency-toggle"));
    expect(getByTestId("schedule-block-frequency-hourly")).toBeTruthy();
    expect(getByTestId("schedule-block-frequency-yearly")).toBeTruthy();
    expect(getByTestId("schedule-block-frequency-once")).toBeTruthy();

    // Pick Monthly → emits the change AND collapses back to the header.
    fireEvent.press(getByTestId("schedule-block-frequency-monthly"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: ROUTINE_FREQUENCY.MONTHLY }),
    );
    expect(queryByTestId("schedule-block-frequency-monthly")).toBeNull();
  });

  it.each([
    [ROUTINE_FREQUENCY.HOURLY, "Hourly"],
    [ROUTINE_FREQUENCY.YEARLY, "Yearly"],
    [ROUTINE_FREQUENCY.ONCE, "Once / Never"],
    [ROUTINE_FREQUENCY.EVERY_3_MONTHS, "Every 3 months"],
  ])("collapsed header shows the human label for %s", (frequency, label) => {
    const { getByText } = renderBlock(frequency);
    expect(getByText(label)).toBeTruthy();
  });
});

describe("ScheduleBlock — conditional sub-controls", () => {
  it("Hourly → interval presets, no day chips", () => {
    const { getByTestId, queryByTestId } = renderBlock(ROUTINE_FREQUENCY.HOURLY);
    expect(getByTestId("schedule-block-interval-4")).toBeTruthy();
    expect(getByTestId("schedule-block-interval-12")).toBeTruthy();
    expect(queryByTestId("schedule-block-days-0")).toBeNull();
  });

  it.each([
    ROUTINE_FREQUENCY.WEEKLY,
    ROUTINE_FREQUENCY.BIWEEKLY,
    ROUTINE_FREQUENCY.CUSTOM,
  ])("%s → multi-select day chips, no interval", (frequency) => {
    const { getByTestId, queryByTestId } = renderBlock(frequency);
    expect(getByTestId("schedule-block-days-0")).toBeTruthy();
    expect(getByTestId("schedule-block-days-6")).toBeTruthy();
    expect(queryByTestId("schedule-block-interval-4")).toBeNull();
  });

  it.each([
    ROUTINE_FREQUENCY.MONTHLY,
    ROUTINE_FREQUENCY.EVERY_6_MONTHS,
    ROUTINE_FREQUENCY.YEARLY,
    ROUTINE_FREQUENCY.ONCE,
  ])("%s → no day chips and no interval (date-anchored)", (frequency) => {
    const { queryByTestId } = renderBlock(frequency);
    expect(queryByTestId("schedule-block-days-0")).toBeNull();
    expect(queryByTestId("schedule-block-interval-4")).toBeNull();
  });
});

describe("ScheduleBlock — emits canonical fields", () => {
  it("toggling a day chip emits days[] (multi-select) with preferredDay tracking", () => {
    const { getByTestId, onChange } = renderBlock(ROUTINE_FREQUENCY.WEEKLY, {
      days: [2],
    });
    fireEvent.press(getByTestId("schedule-block-days-4")); // add Fri
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ days: [2, 4], preferredDay: 2 }),
    );
  });

  it("choosing an interval emits intervalHours", () => {
    const { getByTestId, onChange } = renderBlock(ROUTINE_FREQUENCY.HOURLY);
    fireEvent.press(getByTestId("schedule-block-interval-6"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ intervalHours: 6 }),
    );
  });

  it("choosing an early reminder emits reminderTiming", () => {
    const { getByTestId, onChange } = renderBlock(ROUTINE_FREQUENCY.DAILY);
    fireEvent.press(getByTestId("schedule-block-early-1h"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reminderTiming: "1h" }),
    );
  });

  it("switching to Monthly preserves the picked startDate (the anchor)", () => {
    const { getByTestId, onChange } = renderBlock(ROUTINE_FREQUENCY.WEEKLY, {
      startDate: "2026-06-10",
    });
    fireEvent.press(getByTestId("schedule-block-frequency-toggle")); // expand list
    fireEvent.press(getByTestId("schedule-block-frequency-monthly"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        frequency: ROUTINE_FREQUENCY.MONTHLY,
        startDate: "2026-06-10",
      }),
    );
  });
});
