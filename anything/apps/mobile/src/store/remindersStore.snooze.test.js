// Snooze state in the reminders store. The `snoozes` map (instance id →
// snoozedUntil ISO) is the canonical read path for Today's sectioning: it must
// be written for EVERY snooze — including reminders that don't live in this
// store (vet appointments come from React Query), for which the map entry is
// the entire snooze. Before this map, snoozing a vet appointment was a silent
// no-op. (AUDIT A-25) The map is now PERSISTED (only that slice) so snoozes
// survive an app restart.

jest.mock("@/utils/notifications", () => ({
  scheduleReminderNotification: jest.fn(async () => "notif-1"),
  cancelNotification: jest.fn(async () => {}),
  resolveReminderTiming: jest.fn(() => null),
}));
jest.mock("./socialPetStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({ notifications: [], markNotificationRead: jest.fn() }),
  },
}));

import useRemindersStore from "./remindersStore";

const NOW = new Date(2026, 5, 10, 12, 0, 0); // local noon
const TEN_MIN = { label: "10 minutes", value: 10, unit: "minutes" };

const storeReminder = (overrides = {}) => ({
  id: "reminder_100_2026-06-10_0",
  routineId: 100,
  petId: "2",
  type: "wellness_check",
  title: "Body condition",
  status: "upcoming",
  scheduledAt: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
  nextTriggerAt: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
  snoozedUntil: null,
  notificationEnabled: false,
  ...overrides,
});

describe("remindersStore — snoozes map", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    useRemindersStore.setState({ reminders: [], snoozes: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("snoozing a store-backed reminder writes the map AND the reminder fields", async () => {
    const r = storeReminder();
    useRemindersStore.setState({ reminders: [r] });

    await useRemindersStore.getState().snoozeReminder(r.id, TEN_MIN);

    const expected = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString();
    const state = useRemindersStore.getState();
    expect(state.snoozes[r.id]).toBe(expected);
    const updated = state.reminders.find((x) => x.id === r.id);
    expect(updated.snoozedUntil).toBe(expected);
    expect(updated.nextTriggerAt).toBe(expected);
    // The original scheduled time is untouched — cards keep showing it.
    expect(updated.scheduledAt).toBe(r.scheduledAt);
  });

  it("(AUDIT A-25) persists ONLY the snoozes slice so it survives a restart", () => {
    // zustand's persist middleware exposes a `.persist` API on the store.
    expect(useRemindersStore.persist).toBeDefined();
    const opts = useRemindersStore.persist.getOptions();
    expect(opts.name).toBe("pawpi:reminderSnoozes");
    // reminders are re-derived on load and must NOT be frozen to disk.
    const partial = opts.partialize({
      reminders: [{ id: "x" }],
      snoozes: { a: "2030-01-01T00:00:00.000Z" },
    });
    expect(partial).toEqual({ snoozes: { a: "2030-01-01T00:00:00.000Z" } });
  });

  it("(AUDIT A-25) merge drops already-expired snoozes on rehydrate", () => {
    const { merge } = useRemindersStore.persist.getOptions();
    const past = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    const merged = merge(
      { snoozes: { expired: past, live: future } },
      { snoozes: {}, reminders: [] },
    );
    expect(merged.snoozes).toEqual({ live: future });
  });

  it("snoozing an id NOT in the store (vet appointment) still records the snooze", async () => {
    await useRemindersStore.getState().snoozeReminder("vet_apt_7", TEN_MIN);

    const expected = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString();
    expect(useRemindersStore.getState().snoozes["vet_apt_7"]).toBe(expected);
    expect(useRemindersStore.getState().reminders).toEqual([]);
  });

  it("'tonight' before 8 PM snoozes to 8 PM today", async () => {
    await useRemindersStore
      .getState()
      .snoozeReminder("vet_apt_7", { label: "Tonight", value: "tonight" });

    const tonight = new Date(NOW);
    tonight.setHours(20, 0, 0, 0);
    expect(useRemindersStore.getState().snoozes["vet_apt_7"]).toBe(
      tonight.toISOString(),
    );
  });

  it("clearSnooze drops the entry and is a no-op for unknown ids", async () => {
    await useRemindersStore.getState().snoozeReminder("vet_apt_7", TEN_MIN);

    useRemindersStore.getState().clearSnooze("vet_apt_7");
    expect(useRemindersStore.getState().snoozes).toEqual({});

    expect(() =>
      useRemindersStore.getState().clearSnooze("never-snoozed"),
    ).not.toThrow();
  });

  it("completing a reminder clears its snooze entry", async () => {
    const r = storeReminder();
    useRemindersStore.setState({ reminders: [r] });
    await useRemindersStore.getState().snoozeReminder(r.id, TEN_MIN);

    useRemindersStore.getState().completeReminder(r.id);

    expect(useRemindersStore.getState().snoozes).toEqual({});
    expect(
      useRemindersStore.getState().reminders.find((x) => x.id === r.id).status,
    ).toBe("completed");
  });
});
