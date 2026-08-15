import { describe, it, expect, vi, beforeEach } from "vitest";

// BN2 PR2 — the provider-team recipient resolver. sql + safeNotify are mocked.

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/notify", () => ({ safeNotify: vi.fn() }));

import sql from "@/app/api/utils/sql";
import { safeNotify } from "@/app/api/utils/notify";
import { notifyProviderTeam } from "./providerNotify";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("notifyProviderTeam", () => {
  it("resolves owner + active staff and safeNotifies each", async () => {
    // app_provider_active_staff_ids returns owner (7) + two staff (8, 9).
    sql.mockResolvedValueOnce([{ id: 7 }, { id: 8 }, { id: 9 }]);
    await notifyProviderTeam({
      providerId: 3,
      actor: 42,
      type: "biz_booking",
      subjectRef: 100,
      body: "{}",
    });
    expect(safeNotify).toHaveBeenCalledTimes(3);
    expect(safeNotify.mock.calls.map((c) => c[0].recipient).sort()).toEqual([7, 8, 9]);
    // actor threaded through; subjectRef stringified.
    expect(safeNotify.mock.calls[0][0]).toMatchObject({
      actor: 42,
      type: "biz_booking",
      subjectRef: "100",
    });
  });

  it("ownerOnly → resolves just providers.owner_user_profile_id", async () => {
    sql.mockResolvedValueOnce([{ id: 5 }]); // owner_user_profile_id
    await notifyProviderTeam({
      providerId: 3,
      actor: 1,
      type: "biz_follow",
      subjectRef: 3,
      ownerOnly: true,
    });
    expect(safeNotify).toHaveBeenCalledTimes(1);
    expect(safeNotify.mock.calls[0][0].recipient).toBe(5);
    // Used the owner column query, not the staff DEFINER.
    expect(sql.mock.calls[0][0].join(" ")).toContain("owner_user_profile_id");
  });

  it("degrades to no-notify when the DEFINER reader is absent (42883)", async () => {
    sql.mockRejectedValueOnce({ code: "42883" });
    await notifyProviderTeam({ providerId: 3, actor: 1, type: "biz_order", subjectRef: 9 });
    expect(safeNotify).not.toHaveBeenCalled();
  });

  it("never throws + never notifies on a non-integer providerId", async () => {
    await notifyProviderTeam({ providerId: "abc", actor: 1, type: "biz_order", subjectRef: 9 });
    expect(sql).not.toHaveBeenCalled();
    expect(safeNotify).not.toHaveBeenCalled();
  });

  it("filters out null recipient ids", async () => {
    sql.mockResolvedValueOnce([{ id: 7 }, { id: null }]);
    await notifyProviderTeam({ providerId: 3, actor: 1, type: "biz_booking", subjectRef: 1 });
    expect(safeNotify).toHaveBeenCalledTimes(1);
    expect(safeNotify.mock.calls[0][0].recipient).toBe(7);
  });
});
