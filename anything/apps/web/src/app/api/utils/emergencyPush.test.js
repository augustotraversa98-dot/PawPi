import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The finder push: bilingual copy, time-sensitive for the first messages of an hour, and it never throws or hangs.

const mock = vi.hoisted(() => ({ send: vi.fn(), locale: vi.fn() }));
vi.mock("@/app/api/utils/push", () => ({ sendPush: mock.send, resolveRecipientLocale: mock.locale }));

import { PUSH_WAIT_MS, renderEmergencyPush, sendEmergencyFinderPush } from "./emergencyPush";

const finder = { name: "Marta", phone: "123456", email: "m@example.test", message: "At the park" };
const job = { recipient: 7, petId: 3, petName: "Rex", finder, recentCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.locale.mockResolvedValue("en");
  mock.send.mockResolvedValue({ sent: 1 });
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

  it.each([
    [4, "time-sensitive"],
    [5, "active"],
    [undefined, "active"],
  ])("with %s earlier messages this hour the level is %s", async (recentCount, level) => {
    await sendEmergencyFinderPush({ ...job, recentCount });
    expect(mock.send.mock.calls[0][1].interruptionLevel).toBe(level);
  });

  it("never throws", async () => {
    mock.locale.mockRejectedValue(new Error("db down"));
    await expect(sendEmergencyFinderPush(job)).resolves.toBeUndefined();
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
