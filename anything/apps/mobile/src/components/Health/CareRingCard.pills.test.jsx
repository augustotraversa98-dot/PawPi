// CareRingCard — the three segment pills must stay tappable at EVERY done-count (0/3, 1/3,
// 2/3, 3/3). Regression: the Walk / Care pills routed to "/(tabs)/health" while the owner
// was already on Health → Today, so tapping them did nothing. Now:
//   walk  -> opens the quick walk log in place
//   care  -> opens the quick check (GeneralCheckModal, quick mode)
//   moment-> hands off to onPressSegment (feed tab)
// A completed pill behaves the same way (log another) — a tap is never swallowed.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
// Expose the ring's own arc press so we can assert the arcs share the pills' behaviour.
jest.mock("@/components/Health/CareRing", () => {
  const { Pressable, Text } = require("react-native");
  return {
    CareRing: ({ onPressSegment }) => (
      <Pressable onPress={() => onPressSegment?.("walk")}>
        <Text>RING_ARC_WALK</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/ui/Card", () => {
  const { View } = require("react-native");
  return { Card: ({ children }) => <View>{children}</View> };
});
jest.mock("@/utils/engagementNotifications", () => ({
  maybeScheduleStreakSave: () => Promise.resolve(),
}));
jest.mock("@/components/Health/GeneralCheck/GeneralCheckModal", () => {
  const { Text } = require("react-native");
  return function MockGeneralCheckModal({ visible, mode }) {
    return visible ? <Text>{`QUICK_CHECK_OPEN:${mode}`}</Text> : null;
  };
});
jest.mock("@/components/Health/WalkActivity/WalkActivityModal", () => {
  const { Text } = require("react-native");
  return function MockWalkActivityModal({ visible }) {
    return visible ? <Text>WALK_LOG_OPEN</Text> : null;
  };
});
jest.mock("@/hooks/useFetchHealthData", () => ({
  useGeneralChecks: () => ({ data: { checks: [] } }),
}));

let mockRing = {};
jest.mock("@/hooks/useCareRing", () => ({
  useCareRing: () => ({ data: mockRing }),
  useSetRestDay: () => ({ mutate: jest.fn() }),
  useSetPause: () => ({ mutate: jest.fn() }),
  useRepairStreak: () => ({ mutate: jest.fn() }),
  careRingKey: (id) => ["care-ring", id],
}));
jest.mock("@/hooks/useHealthReinforcement", () => ({
  useDeleteGeneralCheck: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, vars) => {
      const dict = require("@/i18n/locales/en.json");
      const val = key.split(".").reduce((o, p) => (o == null ? o : o[p]), dict);
      if (typeof val !== "string") return key;
      return vars ? val.replace(/\{\{(\w+)\}\}/g, (_, n) => String(vars[n] ?? "")) : val;
    },
  }),
}));

import { CareRingCard } from "./CareRingCard";

const ring = (walk, moment, care) => ({
  walk_done: walk,
  moment_done: moment,
  care_done: care,
  ring_closed: walk && moment && care,
  rest_day: false,
  paused: false,
});

// Done-count scenarios, with different segments done so every pill is exercised both
// pending and completed.
const CASES = [
  ["0/3", ring(false, false, false)],
  ["1/3 (walk done)", ring(true, false, false)],
  ["1/3 (care done)", ring(false, false, true)],
  ["2/3 (walk+moment done)", ring(true, true, false)],
  ["2/3 (moment+care done)", ring(false, true, true)],
  ["3/3", ring(true, true, true)],
];

describe.each(CASES)("ring at %s", (_label, state) => {
  beforeEach(() => {
    mockRing = state;
  });

  test("Walk pill opens the quick walk log (pending or done)", () => {
    const { getByLabelText, getByText, queryByText } = render(<CareRingCard petId={7} petName="Rex" />);
    expect(queryByText("WALK_LOG_OPEN")).toBeNull();
    fireEvent.press(getByLabelText("Log a walk to fill this segment."));
    expect(getByText("WALK_LOG_OPEN")).toBeTruthy();
  });

  test("Care pill opens the quick check (pending or done)", () => {
    const { getByLabelText, getByText, queryByText } = render(<CareRingCard petId={7} petName="Rex" />);
    expect(queryByText("QUICK_CHECK_OPEN:quick")).toBeNull();
    fireEvent.press(getByLabelText("Log any care action to fill this segment."));
    expect(getByText("QUICK_CHECK_OPEN:quick")).toBeTruthy();
  });

  test("Moment pill hands off to onPressSegment('moment')", () => {
    const onPressSegment = jest.fn();
    const { getByLabelText } = render(
      <CareRingCard petId={7} petName="Rex" onPressSegment={onPressSegment} />,
    );
    fireEvent.press(getByLabelText("Post today's moment to fill this segment."));
    expect(onPressSegment).toHaveBeenCalledWith("moment");
  });

  test("the ring's own walk arc behaves like the Walk pill", () => {
    const { getByText } = render(<CareRingCard petId={7} petName="Rex" />);
    fireEvent.press(getByText("RING_ARC_WALK"));
    expect(getByText("WALK_LOG_OPEN")).toBeTruthy();
  });
});

test("Walk/Care pills do not call onPressSegment (no silent same-screen navigation)", () => {
  mockRing = ring(true, false, false);
  const onPressSegment = jest.fn();
  const { getByLabelText } = render(
    <CareRingCard petId={7} petName="Rex" onPressSegment={onPressSegment} />,
  );
  fireEvent.press(getByLabelText("Log a walk to fill this segment."));
  fireEvent.press(getByLabelText("Log any care action to fill this segment."));
  expect(onPressSegment).not.toHaveBeenCalled();
});
