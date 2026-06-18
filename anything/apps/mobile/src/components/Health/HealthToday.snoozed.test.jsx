// Render pin for the Snoozed section (Health → Today). The section's contract:
//   - it renders (header + items) whenever the store's snooze map puts an
//     active snooze on a visible reminder — snoozing must NOT make the item
//     disappear, so it can be logged/skipped during the snooze window;
//   - cards show the original scheduled time AND when the snooze ends, both
//     via the shared formatter ("5:34 PM · snoozed until 6:30 PM");
//   - cards keep full log/skip actions (the same handlers Overdue uses);
//   - map-only snoozes work for reminders that don't live in the store
//     (vet appointments from React Query);
//   - the #34 collapse behavior may hide the ITEMS when the list is long, but
//     NEVER the header/count;
//   - no active snoozes → no Snoozed section at all.
//
// Unlike the Overdue pin (which controls useTodayReminders), the snoozed list
// is computed by the REAL sectioner from the store mock's reminders + snoozes,
// so this also pins the wiring from store map → section.

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

// Controlled per-test vet reminders.
const mockVet = { data: [] };
jest.mock("@/hooks/useVetAppointmentReminders", () => ({
  useVetAppointmentReminders: () => mockVet,
}));
jest.mock("@/hooks/useTodayProgress", () => ({
  useTodayProgress: () => ({ chips: [], isEmpty: true }),
}));

// Controlled per-test store state (reminders + snooze map).
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

const NOW_MS = new Date("2026-06-10T17:51:00+02:00").getTime();
const mockToday = {
  overdue: [],
  dismiss: jest.fn(),
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

const SCHEDULED = "2026-06-10T15:34:00.000Z"; // 17:34 local (UTC+2), passed
const SNOOZE_END = "2026-06-10T16:30:00.000Z"; // 18:30 local, still ahead

const storeReminder = (i = 0) => ({
  id: `reminder_6_general_${i}_2026-06-10`,
  routineId: "6",
  petId: "2",
  type: "wellness_check",
  title: `General check ${i + 1}`,
  status: "upcoming",
  timeSensitive: true,
  scheduledAt: SCHEDULED,
  nextTriggerAt: SCHEDULED,
  snoozedUntil: null,
});

describe("HealthToday — Snoozed section render contract", () => {
  afterEach(() => {
    mockStore.reminders = [];
    mockStore.snoozes = {};
    mockVet.data = [];
  });

  it("renders header, item, both times and log/skip actions for an active snooze", () => {
    const r = storeReminder(0);
    mockStore.reminders = [r];
    mockStore.snoozes = { [r.id]: SNOOZE_END };

    const { getByText } = render(<HealthToday />);
    getByText("Snoozed (1)");
    getByText("General check 1");
    getByText(
      `${formatScheduledTime(SCHEDULED, NOW_MS)} · snoozed until ${formatScheduledTime(SNOOZE_END, NOW_MS)}`,
    );
    getByText("Skip"); // dismiss action present
    getByText("Start check"); // the type's log action, same as Overdue
  });

  it("a map-only snooze shows a vet appointment in Snoozed (no store object)", () => {
    mockVet.data = [
      {
        id: "vet_apt_7",
        petId: "2",
        type: "vet_appointment",
        title: "Annual checkup",
        status: "upcoming",
        timeSensitive: true,
        scheduledAt: SCHEDULED,
        nextTriggerAt: SCHEDULED,
        snoozedUntil: null,
      },
    ];
    mockStore.snoozes = { vet_apt_7: SNOOZE_END };

    const { getByText } = render(<HealthToday />);
    getByText("Snoozed (1)");
    getByText("Annual checkup");
  });

  it("an elapsed snooze renders no Snoozed section", () => {
    const r = storeReminder(0);
    mockStore.reminders = [r];
    mockStore.snoozes = { [r.id]: "2026-06-10T15:40:00.000Z" }; // already over

    const { queryByText } = render(<HealthToday />);
    expect(queryByText(/Snoozed \(/)).toBeNull();
  });

  it("auto-collapses a long list but NEVER hides the header/count", () => {
    const items = Array.from({ length: 6 }, (_, i) => storeReminder(i));
    mockStore.reminders = items;
    mockStore.snoozes = Object.fromEntries(
      items.map((r) => [r.id, SNOOZE_END]),
    );

    const { getByText, queryByText } = render(<HealthToday />);
    getByText("Snoozed (6)"); // header always visible
    expect(queryByText("General check 1")).toBeNull(); // items collapsed (>5)
  });
});
