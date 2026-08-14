// Unit E13 PR3 — the private household leaderboard — proven through the REAL Hono router (api.request)
// on real Postgres as pawpi_app.
//
// Proves: per-caregiver weekly contributions are counted from real logs (moments by author, walks/care
// by logger) for the pet's household (owner + active caregivers); the board ranks positively and names
// the most-active member with NO shame flag; a caregiver can read it, a non-caregiver cannot; the
// owner's per-household opt-out empties the board; a caregiver can't flip the opt-out.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const CARE = { authUserId: 2, profileId: 2, username: "sofia" };
const STRANGER = { authUserId: 3, profileId: 3, username: "stranger" };
// A week (Mon 2026-08-10 .. Sun 2026-08-16); logs land mid-week.
const WEEK = "2026-08-10";
const MIDWEEK = "2026-08-12 12:00:00+00";

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
const boardOf = (petId: number) => apiReq(`/pets/${petId}/household-leaderboard?week=${WEEK}`);

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
  await seedUser(raw, CARE);
  await seedUser(raw, STRANGER);
  await seedPetCaregiver(raw, {
    id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId,
    role: "family", status: "active",
  });
  authState.session = sessionFor(OWNER.authUserId);
});

// Attributed contributions: moments by author (posts.user_id), walks/care by logger (owner_user_id).
const seedMoment = (author: number, day = "2026-08-12") =>
  raw`insert into posts (user_id, pet_id, is_daily_update, post_date) values (${author}, ${OWNER.petId}, true, ${day})`;
const seedWalk = (logger: number) =>
  raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${OWNER.petId}, ${logger}, ${MIDWEEK})`;
const seedFood = (logger: number) =>
  raw`insert into health_food_logs (pet_id, owner_user_id, logged_at) values (${OWNER.petId}, ${logger}, ${MIDWEEK})`;

describe("E13 PR3 — household leaderboard", () => {
  it("counts per-member contributions and names the most-active caregiver", async () => {
    // Caregiver: 1 moment + 2 walks + 1 food = 4; Owner: 1 walk = 1.
    await seedMoment(CARE.profileId);
    await seedWalk(CARE.profileId);
    await seedWalk(CARE.profileId);
    await seedFood(CARE.profileId);
    await seedWalk(OWNER.profileId);

    const b = await (await boardOf(OWNER.petId)).json();
    const care = b.members.find((m: any) => m.member_user_id === CARE.profileId);
    const owner = b.members.find((m: any) => m.member_user_id === OWNER.profileId);
    expect(care.total).toBe(4);
    expect(care.moments).toBe(1);
    expect(care.walks).toBe(2);
    expect(care.care_actions).toBe(1);
    expect(owner.total).toBe(1);
    expect(b.most_active_user_id).toBe(CARE.profileId);
    expect(b.members[0].member_user_id).toBe(CARE.profileId); // ranked first
  });

  it("no shame flags on the board (celebrate the family)", async () => {
    await seedWalk(OWNER.profileId); // caregiver contributes nothing this week
    const b = await (await boardOf(OWNER.petId)).json();
    const care = b.members.find((m: any) => m.member_user_id === CARE.profileId);
    expect(care.total).toBe(0);
    expect(care).not.toHaveProperty("least_active");
    expect(care).not.toHaveProperty("shame");
  });

  it("a caregiver can read the household board", async () => {
    authState.session = sessionFor(CARE.authUserId);
    const res = await boardOf(OWNER.petId);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.members.length).toBe(2);
  });

  it("a non-caregiver stranger cannot read it (404)", async () => {
    authState.session = sessionFor(STRANGER.authUserId);
    expect((await boardOf(OWNER.petId)).status).toBe(404);
  });

  it("the owner's opt-out empties the board; a caregiver cannot flip it", async () => {
    // Caregiver can't opt out.
    authState.session = sessionFor(CARE.authUserId);
    expect((await apiReq(`/pets/${OWNER.petId}/household-leaderboard`, "POST", { action: "opt_out" })).status).toBe(403);

    // Owner opts out → board empty.
    authState.session = sessionFor(OWNER.authUserId);
    await apiReq(`/pets/${OWNER.petId}/household-leaderboard`, "POST", { action: "opt_out" });
    const b = await (await boardOf(OWNER.petId)).json();
    expect(b.opted_out).toBe(true);
    expect(b.members).toEqual([]);
  });
});
