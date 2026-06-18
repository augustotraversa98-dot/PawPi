// Render pin for the Overdue section (Health → Today). The section's contract:
//   - it renders (header + items) whenever the reconciled overdue list is
//     non-empty — there is no other flag that can suppress it;
//   - the #34 collapse behavior may hide the ITEMS when the list is long, but
//     NEVER the header/count;
//   - empty list → no Overdue section at all;
//   - every overdue card shows its scheduled time via the shared formatter.
//
// Children that don't participate in this contract (countdown cards, log
// modals) are mocked to nulls — this test pins the section render condition,
// not the card internals.

import React from "react";
import { render } from "@testing-library/react-native";

// Mutable so the Today's-Progress tests can vary it (ticket 2.66); defaults empty.
let mockProgress = { chips: [], isEmpty: true };

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
jest.mock("@/hooks/useTodayProgress", () => ({
  useTodayProgress: () => mockProgress,
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
jest.mock("@/store/routinesStore", () => ({
  __esModule: true,
  default: (selector) =>
    selector({ routines: [], loadRoutines: jest.fn() }),
}));
jest.mock("./Reminders/CountdownCard", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./FeedingCountdownCard", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./WalkActivity/WalkCountdownCard", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./VetAppointmentCountdownCard", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./Reminders/SnoozeModal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./PhotoCheck/PhotoCheckCaptureModal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./Reminders/MedicalCareIssueModal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./WellnessCheck/WellnessLogModal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./FeedingIssueModal", () => ({
  __esModule: true,
  default: () => null,
}));

// Controlled per-test return for the hook the section derives from.
const mockToday = {
  overdue: [],
  dismiss: jest.fn(),
  dismissedKeys: new Set(),
  isLoading: false,
  now: new Date("2026-06-10T17:51:00+02:00").getTime(),
  refreshNow: jest.fn(),
};
jest.mock("@/hooks/useTodayReminders", () => ({
  useTodayReminders: () => mockToday,
}));

import HealthToday from "./HealthToday";
import { formatScheduledTime } from "@/utils/scheduledTimeFormat";

const overdueItem = (i = 0) => ({
  id: `reminder_7_med_2026-06-0${9 - (i % 9)}_${i}`,
  routineId: "7",
  petId: "2",
  type: "medical_care",
  title: `Heart pill ${i + 1}`,
  scheduledAt: "2026-06-10T15:34:00.000Z", // 17:34 local, passed
  nextTriggerAt: "2026-06-10T15:34:00.000Z",
});

describe("HealthToday — Overdue section render contract", () => {
  afterEach(() => {
    mockToday.overdue = [];
  });

  it("renders header, item and its scheduled time whenever count > 0", () => {
    mockToday.overdue = [overdueItem(0)];
    const { getByText } = render(<HealthToday />);
    getByText("Overdue (1)");
    getByText("Heart pill 1");
    getByText("Skip");
    // The shared formatter output (locale-safe: computed with the same call).
    getByText(
      formatScheduledTime("2026-06-10T15:34:00.000Z", mockToday.now),
    );
  });

  it("auto-collapses a long list but NEVER hides the header/count", () => {
    mockToday.overdue = Array.from({ length: 6 }, (_, i) => overdueItem(i));
    const { getByText, queryByText } = render(<HealthToday />);
    getByText("Overdue (6)"); // header always visible
    expect(queryByText("Heart pill 1")).toBeNull(); // items collapsed (>5)
  });

  it("renders no Overdue section when the list is empty", () => {
    mockToday.overdue = [];
    const { queryByText } = render(<HealthToday />);
    expect(queryByText(/Overdue/)).toBeNull();
  });
});

describe("HealthToday — Today's Progress on real data (2.66)", () => {
  afterEach(() => {
    mockProgress = { chips: [], isEmpty: true };
  });

  it("shows an empty/encouraging state (no fake numbers) when nothing is logged", () => {
    mockProgress = { chips: [], isEmpty: true };
    const { getByTestId, queryByText } = render(<HealthToday />);
    expect(getByTestId("today-progress-empty")).toBeTruthy();
    // The old hardcoded chips must be gone.
    expect(queryByText("🍽️ Fed 2 times")).toBeNull();
    expect(queryByText("💊 Medication given")).toBeNull();
  });

  it("renders the REAL computed chips when there is logged activity", () => {
    mockProgress = {
      isEmpty: false,
      chips: [
        { key: "feeding", emoji: "🍽️", label: "1/3 meals" },
        { key: "medication", emoji: "💊", label: "Medication given" },
      ],
    };
    const { getByText, queryByTestId } = render(<HealthToday />);
    expect(getByText("🍽️ 1/3 meals")).toBeTruthy();
    expect(queryByTestId("progress-chip-feeding")).toBeTruthy();
    expect(getByText("💊 Medication given")).toBeTruthy();
  });
});
