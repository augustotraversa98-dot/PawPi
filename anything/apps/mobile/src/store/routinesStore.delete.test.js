// Routine soft-delete path (Routine-deletion ticket). deleteRoutine must:
//   1. soft-delete via DELETE /api/routines (backend sets deleted_at + is_active=false),
//   2. drop FUTURE reminders for the routine (keep completed history),
//   3. clear the routine's `${id}::early` acks via DELETE /api/health/reminder-dismissals,
//   4. AWAIT (2) and (3) BEFORE refetching — the PR #52 ordering lesson, so nothing
//      races back into Today/Upcoming,
//   5. refetch against the pet id captured BEFORE the routine left local state.
//
// Notifications + sibling stores are mocked at the module boundary; fetch is a
// dispatcher that records call order so the ordering contract can be asserted.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));

jest.mock("@/utils/notifications", () => {
  const actual = jest.requireActual("@/utils/notifications");
  return {
    __esModule: true,
    ...actual,
    scheduleReminderNotification: jest.fn(async () => "notif-id"),
    cancelNotification: jest.fn(async () => {}),
  };
});

jest.mock("./socialPetStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      notifications: [],
      markNotificationRead: jest.fn(),
      addNotification: jest.fn(),
    }),
  },
}));

import useRoutinesStore from "./routinesStore";
import useRemindersStore from "./remindersStore";
import { cancelNotification } from "@/utils/notifications";
import { REMINDER_STATUS } from "@/data/remindersData";

const NOW = new Date(2026, 5, 10, 12, 0, 0);

const appRoutine = {
  id: "100",
  petId: "42",
  type: "wellness_check",
  isActive: true,
  notificationEnabled: true,
};

let calls;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  calls = [];
  useRoutinesStore.setState({ routines: [appRoutine], initialized: true });
  useRemindersStore.setState({ reminders: [], snoozes: {} });
  cancelNotification.mockClear();

  // Dispatcher: records {method, url}, returns the right shape per route.
  global.fetch = jest.fn(async (url, opts = {}) => {
    const method = opts.method || "GET";
    calls.push({ method, url });
    if (url.startsWith("/api/routines?petId=")) {
      // Refetch after delete: backend already excludes the deleted routine.
      return { ok: true, json: async () => ({ routines: [] }) };
    }
    return { ok: true, json: async () => ({ success: true }) };
  });
});

afterEach(() => {
  jest.useRealTimers();
});

const urlsFor = (predicate) =>
  calls.filter(predicate).map((c) => `${c.method} ${c.url}`);

describe("routinesStore.deleteRoutine — soft delete", () => {
  it("soft-deletes via API, clears future reminders + early acks, then refetches", async () => {
    // Seed a FUTURE reminder (should be removed) and a COMPLETED one (kept as history).
    useRemindersStore.setState({
      reminders: [
        {
          id: "r-future",
          routineId: "100",
          scheduledAt: new Date(2026, 5, 11, 9, 0, 0).toISOString(),
          status: REMINDER_STATUS.UPCOMING,
          scheduledNotificationId: "notif-future",
          petId: "42",
        },
        {
          id: "r-done",
          routineId: "100",
          scheduledAt: new Date(2026, 5, 9, 9, 0, 0).toISOString(),
          status: REMINDER_STATUS.COMPLETED,
          petId: "42",
        },
      ],
    });

    await useRoutinesStore.getState().deleteRoutine("100");

    // 1. Soft delete hit the routines DELETE endpoint with the id.
    expect(
      calls.some(
        (c) => c.method === "DELETE" && c.url === "/api/routines?id=100",
      ),
    ).toBe(true);

    // 2. Future reminder removed; its OS notification cancelled; completed kept.
    const left = useRemindersStore.getState().reminders;
    expect(left.map((r) => r.id)).toEqual(["r-done"]);
    expect(cancelNotification).toHaveBeenCalledWith("notif-future");

    // 3. Early acks cleared via the dismissals DELETE, scoped by routine + pet.
    expect(
      calls.some(
        (c) =>
          c.method === "DELETE" &&
          c.url ===
            "/api/health/reminder-dismissals?petId=42&routineId=100",
      ),
    ).toBe(true);

    // 4. Ordering: the early-ack clear runs BEFORE the refetch GET (PR #52 lesson).
    const clearIdx = calls.findIndex(
      (c) => c.method === "DELETE" && c.url.startsWith("/api/health/"),
    );
    const refetchIdx = calls.findIndex((c) =>
      c.url.startsWith("/api/routines?petId="),
    );
    expect(clearIdx).toBeGreaterThanOrEqual(0);
    expect(refetchIdx).toBeGreaterThan(clearIdx);

    // 5. Refetched against the pet captured before delete; routine is gone.
    expect(
      urlsFor((c) => c.url.startsWith("/api/routines?petId=")),
    ).toContain("GET /api/routines?petId=42");
    expect(useRoutinesStore.getState().routines).toEqual([]);
  });

  it("throws and does not clear reminders when the API delete fails", async () => {
    useRemindersStore.setState({
      reminders: [
        {
          id: "r-future",
          routineId: "100",
          scheduledAt: new Date(2026, 5, 11, 9, 0, 0).toISOString(),
          status: REMINDER_STATUS.UPCOMING,
          petId: "42",
        },
      ],
    });

    global.fetch = jest.fn(async (url, opts = {}) => {
      const method = opts.method || "GET";
      calls.push({ method, url });
      if (method === "DELETE" && url.startsWith("/api/routines?id=")) {
        return { ok: false, status: 403, text: async () => "Forbidden" };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });

    await expect(
      useRoutinesStore.getState().deleteRoutine("100"),
    ).rejects.toThrow();

    // The reminder survives (no removal ran), and no dismissals clear was attempted.
    expect(useRemindersStore.getState().reminders.map((r) => r.id)).toEqual([
      "r-future",
    ]);
    expect(
      calls.some((c) => c.url.startsWith("/api/health/reminder-dismissals")),
    ).toBe(false);
  });
});
