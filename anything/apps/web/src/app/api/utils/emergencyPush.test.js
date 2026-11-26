import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The finder push: bilingual copy, time-sensitive only when urgent, the owner always, members by their own
// settings, and it never throws or hangs.

const mock = vi.hoisted(() => ({ send: vi.fn(), locale: vi.fn(), allowed: vi.fn() }));
vi.mock("@/app/api/utils/push", () => ({ sendPush: mock.send, resolveRecipientLocale: mock.locale }));
vi.mock("@/app/api/utils/ownerNotifications", () => ({ ownerSettingsAllowPush: mock.allowed }));

import { PUSH_WAIT_MS, renderEmergencyPush, sendEmergencyFinderPush } from "./emergencyPush";

const finder = { name: "Marta", phone: "123456", email: "m@example.test", message: "At the park" };
const job = { recipient: 7, petId: 3, petName: "Rex", finder, urgent: true };
const recipients = () => mock.send.mock.calls.map((c) => c[0]).sort();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.locale.mockResolvedValue("en");
  mock.send.mockResolvedValue({ sent: 1 });
  mock.allowed.mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

describe("renderEmergencyPush", () => {
  it("names the dog and puts the contact before the message, in English", () => {
    expect(renderEmergencyPush("en", { petName: "Rex", finder })).toEqual({
      title: "Someone found Rex",
      subtitle: "Emergency",
      body: "Marta\nTel: 123456\nEmail: m@example.test\nAt the park",
    });
  });
  it("speaks Spanish, and falls back to it", () => {
    for (const locale of ["es", undefined]) {
      expect(renderEmergencyPush(locale, { petName: "Rex", finder: {} })).toEqual({
        title: "Alguien encontró a Rex",
        subtitle: "Emergencia",
        body: "Abrí PawPi para verlo.",
      });
    }
  });
  it("has a title without a pet name", () => {
    expect(renderEmergencyPush("en", { petName: " ", finder }).title).toBe("Someone found your pet");
    expect(renderEmergencyPush("es", { finder }).title).toBe("Alguien encontró a tu mascota");
  });
});

describe("sendEmergencyFinderPush", () => {
  it("sends a high-priority, time-sensitive push that bypasses caps and categories", async () => {
    await sendEmergencyFinderPush(job);
    expect(mock.send).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        title: "Someone found Rex",
        priority: "high",
        interruptionLevel: "time-sensitive",
        data: { type: "emergency_contact", subjectRef: "3" },
      }),
      { type: "emergency_contact", category: null, subjectRef: "3", cap: null },
    );
  });

  it.each([[false], [undefined]])("a message that is not urgent (%s) is an ordinary notification", async (urgent) => {
    await sendEmergencyFinderPush({ ...job, urgent });
    expect(mock.send.mock.calls[0][1]).toMatchObject({ priority: "default", interruptionLevel: "active" });
  });

  it("sends the same push to every member whose settings allow it, each in their own language", async () => {
    mock.locale.mockImplementation(async (id) => (id === 8 ? "es" : "en"));
    await sendEmergencyFinderPush({ ...job, members: [8, 9] });
    expect(recipients()).toEqual([7, 8, 9]);
    const titles = Object.fromEntries(mock.send.mock.calls.map((c) => [c[0], c[1].title]));
    expect(titles).toEqual({ 7: "Someone found Rex", 8: "Alguien encontró a Rex", 9: "Someone found Rex" });
    expect(mock.send.mock.calls.every((c) => c[1].interruptionLevel === "time-sensitive")).toBe(true);
  });

  it("asks about the members' settings only: the owner is always notified", async () => {
    mock.allowed.mockImplementation(async (id) => id !== 8);
    await sendEmergencyFinderPush({ ...job, members: [8, 9] });
    expect(recipients()).toEqual([7, 9]);
    expect(mock.allowed.mock.calls).toEqual([
      [8, "owner_lost_alerts"],
      [9, "owner_lost_alerts"],
    ]);
  });

  it("never throws, and one recipient's failure does not stop the others", async () => {
    mock.locale.mockImplementation(async (id) => {
      if (id === 7) throw new Error("db down");
      return "en";
    });
    await expect(sendEmergencyFinderPush({ ...job, members: [8] })).resolves.toBeUndefined();
    expect(recipients()).toEqual([8]);
  });

  it("stops waiting for a push service that hangs", async () => {
    vi.useFakeTimers();
    mock.send.mockReturnValue(new Promise(() => {}));
    let done = false;
    const p = sendEmergencyFinderPush(job).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(PUSH_WAIT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });
});
