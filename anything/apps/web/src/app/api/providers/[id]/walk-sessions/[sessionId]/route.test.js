import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/providers/[id]/walk-sessions/[sessionId] — the walker tracks GPS and finishes
// (Ticket 2.7). Gates: requireProviderCapability(provider,'walker') →
// assertCareAccess('health_logs_write') → RLS-scoped UPDATE. On finish, the report flows
// into the EXISTING health-log path (health_walk_logs + the 'walk' timeline event). Gate
// helpers are mocked; `auth` + `sql` are mocked at the module boundary; resolveUserId runs
// for real so sql call 1 is the profile lookup, then the session load, then the UPDATE,
// then (finish only) the health_walk_logs insert + the timeline insert.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";
import { assertCareAccess } from "@/app/api/utils/careAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => {
  const fn = vi.fn();
  // sql.json(value) binds the RAW value to a jsonb param (route / potty_events).
  fn.json = vi.fn((value) => ({ __jsonb: value }));
  return { default: fn };
});
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error {
    constructor(message) {
      super(message);
      this.name = "ProviderAuthError";
      this.status = 403;
    }
  }
  return { requireProviderCapability: vi.fn(), ProviderAuthError };
});
vi.mock("@/app/api/utils/careAccess", () => {
  class CareAccessError extends Error {
    constructor(message) {
      super(message);
      this.name = "CareAccessError";
      this.status = 403;
    }
  }
  return { assertCareAccess: vi.fn(), CareAccessError };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const SESSION_ROW = {
  id: 1,
  pet_id: 55,
  owner_user_id: 3,
  status: "in_progress",
  route: [{ lat: 1, lng: 2, t: 100 }],
  started_at: "2026-06-16T09:00:00Z",
};
const PARAMS = { params: { id: "100", sessionId: "1" } };

const patchReq = (body) =>
  new Request("http://localhost/api/providers/100/walk-sessions/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  assertCareAccess.mockResolvedValue({ id: 555 });
});

describe("PATCH walk-sessions — gates", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await PATCH(patchReq({ action: "track", points: [] }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("a NON-walker provider → 403, nothing loaded", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
    requireProviderCapability.mockRejectedValue(
      new ProviderAuthError("Provider does not have the 'walker' capability"),
    );
    const res = await PATCH(
      patchReq({ action: "track", points: [{ lat: 1, lng: 2 }] }),
      PARAMS,
    );
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("UPDATE walk_sessions");
  });

  it("an unknown action → 400", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await PATCH(patchReq({ action: "bogus" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("assertCareAccess throws → 403, no UPDATE", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([SESSION_ROW]); // session load
    const { CareAccessError } = await import("@/app/api/utils/careAccess");
    assertCareAccess.mockRejectedValue(new CareAccessError("denied"));
    const res = await PATCH(
      patchReq({ action: "track", points: [{ lat: 1, lng: 2 }] }),
      PARAMS,
    );
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("UPDATE walk_sessions");
  });
});

describe("PATCH walk-sessions — track (append GPS)", () => {
  it("appends well-formed points to the route", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([SESSION_ROW]) // session load
      .mockResolvedValueOnce([{ id: 1, route: [], distance_m: 120, status: "in_progress" }]); // UPDATE

    const res = await PATCH(
      patchReq({
        action: "track",
        points: [{ lat: 3, lng: 4, t: 200 }],
        distance_m: 120,
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(allQueryText()).toContain("UPDATE walk_sessions");
    // The merged route is bound through sql.json (the sanctioned jsonb write boundary).
    expect(sql.json).toHaveBeenCalledWith([
      { lat: 1, lng: 2, t: 100 },
      { lat: 3, lng: 4, t: 200 },
    ]);
  });

  it("track with no valid points → 400 (no garbage data)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([SESSION_ROW]);
    const res = await PATCH(
      patchReq({ action: "track", points: [{ foo: "bar" }] }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("UPDATE walk_sessions");
  });

  it("a non-assigned walker (RLS UPDATE matches zero rows) → 403", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([SESSION_ROW])
      .mockResolvedValueOnce([]); // UPDATE returns no row (RLS scoped to the assignee)
    const res = await PATCH(
      patchReq({ action: "track", points: [{ lat: 5, lng: 6 }] }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH walk-sessions — finish (report → health timeline)", () => {
  it("finishes AND writes the report into health_walk_logs + the walk timeline event", async () => {
    auth.mockResolvedValue(SESSION);
    const FINISHED = {
      id: 1,
      pet_id: 55,
      owner_user_id: 3,
      status: "finished",
      started_at: "2026-06-16T09:00:00Z",
      duration_s: 1800,
      distance_m: 3218.68, // ~2 miles
      potty_pee: true,
      potty_poo: false,
      notes: "good walk",
    };
    const HEALTH_ROW = { id: 9, start_time: "2026-06-16T09:00:00Z" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([SESSION_ROW]) // session load
      .mockResolvedValueOnce([FINISHED]) // finish UPDATE
      .mockResolvedValueOnce([HEALTH_ROW]) // health_walk_logs insert
      .mockResolvedValueOnce([{ id: 1 }]); // timeline insert

    const res = await PATCH(
      patchReq({
        action: "finish",
        distance_m: 3218.68,
        duration_s: 1800,
        potty_pee: true,
        potty_poo: false,
        notes: "good walk",
        photo_urls: ["p.jpg"],
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.session).toEqual(FINISHED);
    expect(json.healthLog).toEqual(HEALTH_ROW);

    const text = allQueryText();
    expect(text).toContain("UPDATE walk_sessions");
    expect(text).toContain("INSERT INTO health_walk_logs");
    expect(text).toContain("INSERT INTO health_timeline_events");
    // potty maps to the existing pottyEvents jsonb shape.
    expect(sql.json).toHaveBeenCalledWith({ pee: 1, poo: 0 });
  });

  it("a non-assigned walker cannot finish (RLS matches zero rows) → 403, no health write", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([SESSION_ROW])
      .mockResolvedValueOnce([]); // finish UPDATE returns no row
    const res = await PATCH(patchReq({ action: "finish" }), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO health_walk_logs");
  });
});
