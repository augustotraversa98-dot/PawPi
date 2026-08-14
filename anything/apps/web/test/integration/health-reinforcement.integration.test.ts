// Unit E10 — Health-update reinforcement — proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app.
//
// Proves: (1) a one-tap "all good" wellness (general) log closes the Care ring segment; (2) the
// Vet-Summary readiness indicator reflects REAL record counts (0 → honest low state, no fake); (3) the
// monthly care recap uses REAL ring completion.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  authState.session = sessionFor(A.authUserId);
});

describe("E10 — one-tap 'all good' closes the Care segment", () => {
  it("a general wellness log makes care_done true on the ring", async () => {
    const before = await (await apiReq(`/pets/${A.petId}/care-ring`)).json();
    expect(before.care_done).toBe(false);

    const log = await apiReq(`/health/wellness-logs`, "POST", { petId: A.petId, checkType: "general", notes: "All good" });
    expect(log.status).toBe(200);

    const after = await (await apiReq(`/pets/${A.petId}/care-ring`)).json();
    expect(after.care_done).toBe(true);
  });
});

describe("E10 — Vet Summary readiness reflects real records", () => {
  it("0 records → an honest 'start' state (0%), no fake", async () => {
    const b = await (await apiReq(`/pets/${A.petId}/vet-summary-readiness`)).json();
    expect(b.level).toBe("start");
    expect(b.percent).toBe(0);
    expect(b.filled).toBe(0);
    expect(b.records_total).toBe(0);
  });

  it("a real weight log fills the weight category and grows readiness", async () => {
    await raw`insert into health_weight_logs (pet_id, owner_user_id, weight, logged_at)
              values (${A.petId}, ${A.profileId}, 12.5, now())`;
    const b = await (await apiReq(`/pets/${A.petId}/vet-summary-readiness`)).json();
    const weight = b.categories.find((c: any) => c.key === "weight");
    expect(weight.has).toBe(true);
    expect(b.filled).toBe(1);
    expect(b.level).toBe("building");
    expect(b.percent).toBe(25); // 1 of 4 categories
  });
});

describe("E10 — monthly care recap uses real completion", () => {
  it("reflects real ring_closed days this month (no fake number)", async () => {
    const ring = await (await apiReq(`/pets/${A.petId}/care-ring`)).json();
    const today = ring.day;
    // One real closed day this month (the ring GET above already persisted a row for today).
    await raw`insert into pet_care_days (pet_id, owner_user_id, day, ring_closed)
              values (${A.petId}, ${A.profileId}, ${today}::date, true)
              on conflict (pet_id, day) do update set ring_closed = true`;

    const b = await (await apiReq(`/pets/${A.petId}/share-stats?day=${today}`)).json();
    expect(b.care_recap).toBeTruthy();
    expect(b.care_recap.ring_closed_days).toBe(1);
    expect(b.care_recap.days_elapsed).toBeGreaterThan(0);
    expect(b.care_recap.percent).toBe(Math.round((1 / b.care_recap.days_elapsed) * 100));
  });
});
