// Render pin for the Upcoming heads-up section (Health → Today). The contract:
//   - an active heads-up (from useTodayReminders.headsUp) renders a distinct
//     "Upcoming" section ABOVE Next Up, with the type icon, the task title, and
//     "Due <when>" naming the real event time — independent of the 6h Next Up
//     horizon (the section renders whatever headsUp contains);
//   - the card has EXACTLY two actions — Close and Edit — and NO Complete/Log/
//     Take-photo action;
//   - Close calls dismissEarly (acknowledge-only), never completeReminder;
//   - Edit deep-links to the Routines screen with the routineId.
//
// useTodayReminders is mocked (it owns the heads-up derivation, tested purely in
// utils/headsUpReminders.test.js); this pins the wiring from hook → section/card.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 2, name: "Carly" } }),
}));
jest.mock("@/hooks/useVetAppointmentReminders", () => ({
  useVetAppointmentReminders: () => ({ data: [] }),
}));
jest.mock("@/hooks/useTodayProgress", () => ({
  useTodayProgress: () => ({ chips: [], isEmpty: true }),
}));

const mockStore = {
  reminders: [],
  snoozes: {},
  completeReminder: jest.fn(),
  snoozeReminder: jest.fn(),
  clearSnooze: jest.fn(),
};
jest.mock("@/store/remindersStore", () => ({
  __esModule: true,
  default: () => mockStore,
}));
jest.mock("@/store/routinesStore", () => ({
  __esModule: true,
  default: (selector) => selector({ routines: [], loadRoutines: jest.fn() }),
}));
jest.mock("./Reminders/CountdownCard", () => ({ __esModule: true, default: () => null }));
jest.mock("./FeedingCountdownCard", () => ({ __esModule: true, default: () => null }));
jest.mock("./WalkActivity/WalkCountdownCard", () => ({ __esModule: true, default: () => null }));
jest.mock("./VetAppointmentCountdownCard", () => ({ __esModule: true, default: () => null }));
jest.mock("./Reminders/SnoozeModal", () => ({ __esModule: true, default: () => null }));
jest.mock("./PhotoCheck/PhotoCheckCaptureModal", () => ({ __esModule: true, default: () => null }));
jest.mock("./Reminders/MedicalCareIssueModal", () => ({ __esModule: true, default: () => null }));
jest.mock("./WellnessCheck/WellnessLogModal", () => ({ __esModule: true, default: () => null }));
jest.mock("./FeedingIssueModal", () => ({ __esModule: true, default: () => null }));

const NOW_MS = new Date("2026-06-11T12:00:00+02:00").getTime();
const EVENT = "2026-06-12T13:00:00+02:00"; // tomorrow, >6h out

const dismissEarly = jest.fn(() => Promise.resolve());
const mockToday = {
  overdue: [],
  headsUp: [],
  headsUpIds: new Set(),
  dismiss: jest.fn(),
  dismissEarly,
  dismissedKeys: new Set(),
  isLoading: false,
  now: NOW_MS,
  refreshNow: jest.fn(),
};
jest.mock("@/hooks/useTodayReminders", () => ({
  useTodayReminders: () => mockToday,
}));

import HealthToday from "./HealthToday";
import { formatScheduledTime } from "@/utils/scheduledTimeFormat";

const headsUpItem = {
  id: "reminder_7_general_0_2026-06-12",
  routineId: "7",
  petId: "2",
  type: "wellness_check",
  title: "General check",
  status: "upcoming",
  scheduledAt: EVENT,
  nextTriggerAt: EVENT,
  eventTime: EVENT,
};

describe("HealthToday — Upcoming heads-up section", () => {
  afterEach(() => {
    mockToday.headsUp = [];
    mockToday.headsUpIds = new Set();
    dismissEarly.mockClear();
    mockPush.mockClear();
    mockStore.completeReminder.mockClear();
  });

  it("renders the section, title and 'Due <when>' for an event >6h out", () => {
    mockToday.headsUp = [headsUpItem];
    mockToday.headsUpIds = new Set([headsUpItem.id]);

    const { getByText } = render(<HealthToday />);
    getByText("Upcoming");
    getByText("General check");
    getByText(`Due ${formatScheduledTime(EVENT, NOW_MS)}`);
    // Sanity: the real formatter reads "Tomorrow" for an event the next day.
    expect(formatScheduledTime(EVENT, NOW_MS)).toContain("Tomorrow");
  });

  it("has Close + Edit and NO Complete/log action", () => {
    mockToday.headsUp = [headsUpItem];
    const { getByText, queryByText } = render(<HealthToday />);
    getByText("Close");
    getByText("Edit");
    expect(queryByText("Start check")).toBeNull();
    expect(queryByText("Complete")).toBeNull();
    expect(queryByText("Log food")).toBeNull();
  });

  it("Close calls dismissEarly (acknowledge-only), never completeReminder", () => {
    mockToday.headsUp = [headsUpItem];
    const { getByText } = render(<HealthToday />);
    fireEvent.press(getByText("Close"));
    expect(dismissEarly).toHaveBeenCalledTimes(1);
    expect(dismissEarly).toHaveBeenCalledWith(headsUpItem);
    expect(mockStore.completeReminder).not.toHaveBeenCalled();
  });

  it("Edit deep-links to the Routines screen with the routineId", () => {
    mockToday.headsUp = [headsUpItem];
    const { getByText } = render(<HealthToday />);
    fireEvent.press(getByText("Edit"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/more/reminders",
      params: { editRoutineId: "7" },
    });
  });

  it("no heads-up → no Upcoming section", () => {
    mockToday.headsUp = [];
    const { queryByText } = render(<HealthToday />);
    expect(queryByText("Upcoming")).toBeNull();
  });
});
