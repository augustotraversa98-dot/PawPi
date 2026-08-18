// Unit E1 — the Care Ring — proven through the REAL Hono router (api.request) on real Postgres as
// pawpi_app. The ring DERIVES its three segments from existing logs and persists the derived state
// into pet_care_days (E0); it never duplicates the source logs.
//
// Proves: empty day => all segments false; a walk log fills Walk; a daily post fills Moment; a care
// log fills Care; all three => ring_closed AND a persisted pet_care_days row; another owner's logs
// NEVER fill this pet's ring (scoping); a non-owner gets 404 (ownership gate); rest/pause writes
// (rest_day flag + pet_streaks.paused_until) and a paused day reads back paused=true.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" };
const DAY = "2026-08-13";
const NOON = `${DAY} 12:00:00+00`; // midday UTC => same calendar day in America/Buenos_Aires (UTC-3)

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
const ringOf = (petId: number, day = DAY) => apiReq(`/pets/${petId}/care-ring?day=${day}`);

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
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  authState.session = sessionFor(OWNER.authUserId);
});

const seedWalk = (pet: number, owner: number, ts = NOON) =>
  raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${pet}, ${owner}, ${ts})`;
const seedPost = (pet: number, owner: number, day = DAY) =>
  raw`insert into posts (user_id, pet_id, is_daily_update, post_date) values (${owner}, ${pet}, true, ${day})`;
const seedFood = (pet: number, owner: number, ts = NOON) =>
  raw`insert into health_food_logs (pet_id, owner_user_id, logged_at) values (${pet}, ${owner}, ${ts})`;
// QC-C: a general check (Quick Check). `cols` lets a test seed an all-empty completion
// (no observation) vs one with a status/notes observation.
const seedGeneralCheck = (
  pet: number,
  owner: number,
  cols: { eyes_status?: string; notes?: string } = {},
  ts = NOON,
) =>
  raw`insert into health_general_checks ${raw({
    pet_id: pet,
    owner_user_id: owner,
    logged_at: ts,
    ...cols,
  })}`;

describe("E1 — care ring derivation", () => {
  it("empty day => all segments false, ring not closed", async () => {
    const res = await ringOf(OWNER.petId);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b).toMatchObject({
      day: DAY, walk_done: false, moment_done: false, care_done: false, ring_closed: false,
    });
  });

  it("a walk log fills the Walk segment", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId);
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.walk_done).toBe(true);
    expect(b.ring_closed).toBe(false);
  });

  it("a daily post fills the Moment segment", async () => {
    await seedPost(OWNER.petId, OWNER.profileId);
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.moment_done).toBe(true);
  });

  it("a care (food) log fills the Care segment", async () => {
    await seedFood(OWNER.petId, OWNER.profileId);
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.care_done).toBe(true);
  });

  it("all three close the ring AND persist a pet_care_days row", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId);
    await seedPost(OWNER.petId, OWNER.profileId);
    await seedFood(OWNER.petId, OWNER.profileId);
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b).toMatchObject({ walk_done: true, moment_done: true, care_done: true, ring_closed: true, persisted: true });
    const [row] = await raw`select ring_closed from pet_care_days where pet_id = ${OWNER.petId} and day = ${DAY}`;
    expect(row?.ring_closed).toBe(true);
  });

  it("another owner's logs NEVER fill this pet's ring (scoping)", async () => {
    await seedWalk(OTHER.petId, OTHER.profileId);
    await seedPost(OTHER.petId, OTHER.profileId);
    await seedFood(OTHER.petId, OTHER.profileId);
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b).toMatchObject({ walk_done: false, moment_done: false, care_done: false });
  });

  it("the day boundary is the owner's day (a walk on another day doesn't count today)", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-10 12:00:00+00");
    expect((await (await ringOf(OWNER.petId, "2026-08-13")).json()).walk_done).toBe(false);
    expect((await (await ringOf(OWNER.petId, "2026-08-10")).json()).walk_done).toBe(true);
  });

  it("a non-owner cannot read this pet's ring (404)", async () => {
    authState.session = sessionFor(OTHER.authUserId);
    expect((await ringOf(OWNER.petId)).status).toBe(404);
  });

  it("a non-integer id => 404 before SQL", async () => {
    expect((await apiReq(`/pets/abc/care-ring`)).status).toBe(404);
  });
});

describe("QC-C — a completed Quick Check fills the Care segment", () => {
  it("a general check WITH an observation fills Care", async () => {
    await seedGeneralCheck(OWNER.petId, OWNER.profileId, { eyes_status: "usual" });
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.care_done).toBe(true);
  });

  it("a notes-only general check (no status) also fills Care", async () => {
    await seedGeneralCheck(OWNER.petId, OWNER.profileId, { notes: "looked a bit tired" });
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.care_done).toBe(true);
  });

  it("an all-empty general check (no status, no notes) does NOT fill Care", async () => {
    await seedGeneralCheck(OWNER.petId, OWNER.profileId, {});
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.care_done).toBe(false);
  });

  it("another owner's general check never fills this pet's Care (scoping)", async () => {
    await seedGeneralCheck(OTHER.petId, OTHER.profileId, { eyes_status: "usual" });
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.care_done).toBe(false);
  });
});

describe("E1 — rest / pause never break the ring", () => {
  it("set_rest marks the day; GET reflects rest_day", async () => {
    const r = await apiReq(`/pets/${OWNER.petId}/care-ring`, "POST", { action: "set_rest", day: DAY, rest_day: true });
    expect(r.status).toBe(200);
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.rest_day).toBe(true);
  });

  it("set_pause stores paused_until; a day within the range reads paused=true, and clearing works", async () => {
    await apiReq(`/pets/${OWNER.petId}/care-ring`, "POST", { action: "set_pause", paused_until: "2026-08-20" });
    expect((await (await ringOf(OWNER.petId, DAY)).json()).paused).toBe(true);
    // A day after the pause window is not paused.
    expect((await (await ringOf(OWNER.petId, "2026-08-25")).json()).paused).toBe(false);
    // Clear the pause.
    await apiReq(`/pets/${OWNER.petId}/care-ring`, "POST", { action: "set_pause", paused_until: null });
    expect((await (await ringOf(OWNER.petId, DAY)).json()).paused).toBe(false);
  });

  it("a non-owner cannot rest/pause someone else's pet (404)", async () => {
    authState.session = sessionFor(OTHER.authUserId);
    const r = await apiReq(`/pets/${OWNER.petId}/care-ring`, "POST", { action: "set_rest" });
    expect(r.status).toBe(404);
  });
});
