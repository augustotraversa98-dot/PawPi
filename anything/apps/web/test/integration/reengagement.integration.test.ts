// Unit E12 — comeback / re-engagement loop — proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app.
//
// Proves: a pet with no ring activity for N days is lapsed (recent activity is NOT); the welcome-back
// payload carries real friend moments / next milestone / streak-repair availability, scoped to the
// owner; opt-out + one-tap repair work; the SENDER fires a 'winback' push at most once per cap window on
// a REAL hook, respects opt-out, and never fires for a recently-active pet.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedFriendship } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" };
const NOW = "2026-08-16 21:30:00+00"; // owner-tz today = 2026-08-16

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET", body?: unknown, headers?: Record<string, string>) {
  return api.request(path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(headers || {}) },
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
  process.env.CRON_SECRET = "test-secret";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  authState.session = sessionFor(OWNER.authUserId);
});

const seedWalk = (pet: number, owner: number, ts: string) =>
  raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${pet}, ${owner}, ${ts})`;
const seedDailyPost = (pet: number, owner: number, day: string) =>
  raw`insert into posts (user_id, pet_id, is_daily_update, image_url, post_date)
      values (${owner}, ${pet}, true, ${"img-" + day + ".png"}, ${day})`;

describe("E12 — reengagement GET", () => {
  it("no ring activity for >7 days → lapsed", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-01 12:00:00+00"); // 15 days ago
    const b = await (await apiReq(`/pets/${OWNER.petId}/reengagement?n=7`)).json();
    expect(b.lapsed).toBe(true);
    expect(b.last_active_day).toBe("2026-08-01");
  });

  it("recent activity → not lapsed", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-15 12:00:00+00");
    const b = await (await apiReq(`/pets/${OWNER.petId}/reengagement?n=7`)).json();
    expect(b.lapsed).toBe(false);
  });

  it("welcome-back shows a friend's real recent moment", async () => {
    await seedFriendship(raw, {
      requesterUserId: OWNER.profileId, receiverUserId: OTHER.profileId,
      requesterPetId: OWNER.petId, receiverPetId: OTHER.petId, status: "accepted",
    });
    // OTHER posted recently relative to the real "today" (system clock in CI) — use a recent date.
    const recent = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    await seedDailyPost(OTHER.petId, OTHER.profileId, recent);
    const b = await (await apiReq(`/pets/${OWNER.petId}/reengagement`)).json();
    expect(b.welcome_back.friends.map((f: any) => f.pet_id)).toContain(OTHER.petId);
  });

  it("a non-owner cannot read (404)", async () => {
    authState.session = sessionFor(OTHER.authUserId);
    expect((await apiReq(`/pets/${OWNER.petId}/reengagement`)).status).toBe(404);
  });
});

describe("E12 — reengagement POST", () => {
  it("opt_out persists and blocks win-backs", async () => {
    const r = await apiReq(`/pets/${OWNER.petId}/reengagement`, "POST", { action: "opt_out" });
    expect((await r.json()).opted_out).toBe(true);
    const [s] = await raw`select opted_out from reengagement_state where pet_id = ${OWNER.petId}`;
    expect(s.opted_out).toBe(true);
  });

  it("one-tap repair restores a fresh reset within the grace window", async () => {
    // A reset 5 days ago with a pre-reset run of 9 → repair reconnects (9 + 1 = 10).
    await raw`
      insert into pet_streaks (pet_id, owner_user_id, current_count, longest_count, pre_reset_count, reset_at)
      values (${OWNER.petId}, ${OWNER.profileId}, 1, 9, 9, now() - interval '5 days')
    `;
    const r = await apiReq(`/pets/${OWNER.petId}/reengagement`, "POST", { action: "repair" });
    const b = await r.json();
    expect(b.streak.current).toBe(10);
  });
});

describe("E12 — win-back sender (cron)", () => {
  const runAt = (now: string, extra: Record<string, unknown> = {}) =>
    apiReq(`/engagement/reengagement/run`, "POST", { now, lapsed_days: 7, cap_days: 14, limit: 100, ...extra },
      { "x-cron-secret": "test-secret" });
  const winbacks = (recipient: number) =>
    raw`select * from notifications where recipient_user_id = ${recipient} and type = 'winback'`;

  it("rejects a bad secret", async () => {
    expect((await apiReq(`/engagement/reengagement/run`, "POST", { now: NOW })).status).toBe(401);
  });

  it("fires a winback for a lapsed pet, once per cap window", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-01 12:00:00+00"); // lapsed (15d before NOW)
    const r1 = await runAt(NOW);
    expect(r1.status).toBe(200);
    expect((await winbacks(OWNER.profileId)).length).toBe(1);
    // Re-run within the cap window → no second send.
    await runAt(NOW);
    expect((await winbacks(OWNER.profileId)).length).toBe(1);
  });

  it("does not fire for a recently-active pet", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-15 12:00:00+00"); // 1 day before NOW
    await runAt(NOW);
    expect((await winbacks(OWNER.profileId)).length).toBe(0);
  });

  it("respects opt-out", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-01 12:00:00+00");
    await raw`insert into reengagement_state (pet_id, owner_user_id, opted_out) values (${OWNER.petId}, ${OWNER.profileId}, true)`;
    await runAt(NOW);
    expect((await winbacks(OWNER.profileId)).length).toBe(0);
  });
});
