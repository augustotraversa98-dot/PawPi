// Render pin for "Today's Progress" (Health → Today). The block's contract:
//   - numbers are REAL — derived from the pet's routines via buildTodayProgress
//     and today's logs, never hardcoded (the block used to render sample
//     strings like "Fed 2 times" no matter what was logged);
//   - nothing scheduled today and nothing overdue → the explicit empty state,
//     never sample numbers;
//   - the overdue badge mirrors the Overdue section's own list length, and
//     shows even when nothing is scheduled today.
// The counting math itself is pinned in todayProgress.test.js against the #42
// real-shape fixture; this test pins the wiring into the screen.

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
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
jest.mock("@/hooks/useVetAppointments", () => ({
  useVetAppointments: () => ({ appointments: [] }),
}));

const mockFood = { data: { logs: [] } };
jest.mock("@/hooks/useFetchHealthData", () => ({
  useFoodLogs: () => mockFood,
  useWalkLogs: () => ({ data: { logs: [] } }),
}));

jest.mock("@/store/remindersStore", () => ({
  __esModule: true,
  default: () => ({
    reminders: [],
    snoozes: {},
    completeReminder: jest.fn(),
    snoozeReminder: jest.fn(),
    clearSnooze: jest.fn(),
  }),
}));

const mockRoutinesState = { routines: [] };
jest.mock("@/store/routinesStore", () => ({
  __esModule: true,
  default: (selector) =>
    selector({ routines: mockRoutinesState.routines, loadRoutines: jest.fn() }),
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

const mockToday = {
  overdue: [],
  dismiss: jest.fn(),
  dismissedKeys: new Set(),
  resolutionIndex: undefined,
  isLoading: false,
  now: new Date("2026-06-10T17:51:00+02:00").getTime(),
  refreshNow: jest.fn(),
};
jest.mock("@/hooks/useTodayReminders", () => ({
  useTodayReminders: () => mockToday,
}));

import HealthToday from "./HealthToday";

const feedingRoutine = {
  id: "8",
  petId: "2",
  type: "feeding",
  isActive: true,
  notificationEnabled: true,
  meals: [
    { name: "Breakfast", time: "08:00", frequency: "daily", days: [], reminderEnabled: true },
    { name: "Dinner", time: "21:00", frequency: "daily", days: [], reminderEnabled: true },
  ],
  walks: [],
  medicalCareItems: [],
  wellnessCheckItems: [],
  times: [],
  days: [],
};

describe("HealthToday — Today's Progress renders real data", () => {
  afterEach(() => {
    mockRoutinesState.routines = [];
    mockFood.data = { logs: [] };
    mockToday.overdue = [];
  });

  it("shows scheduled-vs-logged counts from the routines + today's logs", () => {
    mockRoutinesState.routines = [feedingRoutine];
    mockFood.data = { logs: [{ logged_at: "2026-06-10T06:10:00+00:00" }] };

    const { getByText, queryByText } = render(<HealthToday />);
    getByText("Today's Progress");
    getByText("🍽️ Meals 1/2");
    // The old sample strings are gone for good.
    expect(queryByText(/Fed 2 times/)).toBeNull();
    expect(queryByText(/Medication given/)).toBeNull();
  });

  it("renders the explicit empty state when nothing is scheduled today", () => {
    const { getByText } = render(<HealthToday />);
    getByText("No scheduled items today");
  });

  it("surfaces the overdue badge from the section's own list — even with nothing scheduled today", () => {
    mockToday.overdue = [
      { id: "reminder_7_mc_x_2026-06-08_0", type: "medical_care" },
      { id: "reminder_7_mc_x_2026-06-07_0", type: "medical_care" },
    ];
    const { getByText, queryByText } = render(<HealthToday />);
    getByText("⚠️ 2 overdue");
    expect(queryByText("No scheduled items today")).toBeNull();
  });
});
