import { describe, it, expect, vi, beforeEach } from "vitest";

// safeNotify: the bell row is written first; push hooks run only when a row was really created. The owner hook is a
// flag-gated no-op inside pushForOwnerNotification, so with the flag off nothing new happens.

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/push", () => ({ pushForNotification: vi.fn().mockResolvedValue({}) }));
vi.mock("@/app/api/utils/ownerNotifications", () => ({ pushForOwnerNotification: vi.fn().mockResolvedValue({}) }));

import sql from "@/app/api/utils/sql";
import { pushForNotification } from "@/app/api/utils/push";
import { pushForOwnerNotification } from "@/app/api/utils/ownerNotifications";
import { safeNotify } from "./notify";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("safeNotify", () => {
  it("self-notify and null recipient are skipped entirely", async () => {
    await safeNotify({ recipient: 5, actor: 5, type: "booking_confirmed" });
    await safeNotify({ recipient: null, actor: 5, type: "booking_confirmed" });
    expect(sql).not.toHaveBeenCalled();
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });

  it("no bell row created (null id: DB gated it) → NO push of any kind", async () => {
    sql.mockResolvedValueOnce([{ id: null }]);
    await safeNotify({ recipient: 5, actor: 1, type: "booking_confirmed", subjectRef: "9" });
    expect(pushForNotification).not.toHaveBeenCalled();
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });

  it("bell row created → business hook then owner hook, with the right arguments", async () => {
    sql.mockResolvedValueOnce([{ id: 77 }]);
    await safeNotify({ recipient: 5, actor: 1, type: "booking_confirmed", subjectRef: "9", body: "{}" });
    expect(pushForNotification).toHaveBeenCalledWith({ recipient: 5, actor: 1, type: "booking_confirmed", subjectRef: "9", body: "{}" });
    expect(pushForOwnerNotification).toHaveBeenCalledWith({ recipient: 5, type: "booking_confirmed", subjectRef: "9" });
  });

  it("a system notification (no actor) still reaches the owner hook", async () => {
    sql.mockResolvedValueOnce([{ id: 3 }]);
    await safeNotify({ recipient: 5, type: "booking_declined", subjectRef: "9" });
    expect(pushForOwnerNotification).toHaveBeenCalledTimes(1);
  });

  it("never throws: a failing push hook or DB error is swallowed", async () => {
    sql.mockResolvedValueOnce([{ id: 3 }]);
    pushForOwnerNotification.mockRejectedValueOnce(new Error("boom"));
    await expect(safeNotify({ recipient: 5, actor: 1, type: "booking_declined" })).resolves.toBeUndefined();
    sql.mockRejectedValueOnce(new Error("db"));
    await expect(safeNotify({ recipient: 5, actor: 1, type: "booking_declined" })).resolves.toBeUndefined();
  });
});
