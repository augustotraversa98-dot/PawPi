import { syncTelehealthBookingReminders } from "./telehealthReminderSync";
import { syncTelehealthReminderNotifications } from "./telehealthReminders";

jest.mock("./telehealthReminders", () => ({
  syncTelehealthReminderNotifications: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete global.fetch;
});

describe("syncTelehealthBookingReminders", () => {
  it("fetches upcoming bookings with the device's local today= and reconciles them", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ upcoming: [{ id: 1, capability: "telehealth" }] }),
    });

    await syncTelehealthBookingReminders();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/me\/bookings\?today=\d{4}-\d{2}-\d{2}$/),
    );
    expect(syncTelehealthReminderNotifications).toHaveBeenCalledWith([
      { id: 1, capability: "telehealth" },
    ]);
  });

  it("treats a 401 (logged out) as nothing to sync, not an error", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 });

    await syncTelehealthBookingReminders();

    expect(syncTelehealthReminderNotifications).toHaveBeenCalledWith([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("swallows an unexpected failure (never crashes the app)", async () => {
    global.fetch.mockRejectedValue(new Error("network down"));

    await expect(syncTelehealthBookingReminders()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
