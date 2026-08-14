// Unit E8 — Neighborhood / breed leaderboards — proven through the REAL Hono router (api.request) on
// real Postgres as pawpi_app.
//
// Proves: XP comes from CARE EFFORT — a paw GIVEN adds XP, a paw RECEIVED does not; the board ranks by
// XP; the density gate falls back to the friends board when a breed/neighborhood cohort is too small
// (never empty/fake); promotion/relegation movement is real (vs the prior week snapshot); the board
// never exposes a home location; opt-in coarse geo drives the neighborhood cohort.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const B = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" };
const C = { authUserId: 3, profileId: 3, username: "third", petId: 3, petName: "Coco" };

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
const boardOf = (petId: number, flavor = "friends", min = 1) =>
  apiReq(`/pets/${petId}/leaderboard?flavor=${flavor}&min=${min}`);

// Accept a friendship between two seeded owner/pet pairs.
async function befriend(x: typeof A, y: typeof B) {
  await raw`insert into pet_friendships
    (requester_user_id, receiver_user_id, requester_pet_id, receiver_pet_id, status)
    values (${x.profileId}, ${y.profileId}, ${x.petId}, ${y.petId}, 'accepted')`;
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
  await seedOwnerWithPet(raw, B);
  await seedOwnerWithPet(raw, C);
  authState.session = sessionFor(A.authUserId);
});

describe("E8 — care-effort XP", () => {
  it("counts a paw GIVEN but not a paw RECEIVED, and ranks by XP", async () => {
    await befriend(A, B);
    await befriend(A, C);

    // A does real care effort this week: 2 walks + gives 1 paw (on B's post).
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${A.petId}, ${A.profileId}, now())`;
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${A.petId}, ${A.profileId}, now())`;
    await raw`insert into posts (id, user_id, pet_id, is_daily_update, post_date) values (500, ${B.profileId}, ${B.petId}, true, (now())::date)`;
    // A GIVES a paw on B's post → counts for A (given), NOT for B (received).
    await raw`insert into post_paws (post_id, user_id) values (500, ${A.profileId})`;

    authState.session = sessionFor(A.authUserId);
    const res = await boardOf(A.petId, "friends", 1);
    expect(res.status).toBe(200);
    const b = await res.json();

    const rex = b.board.find((r: any) => r.pet_id === A.petId);
    const bella = b.board.find((r: any) => r.pet_id === B.petId);
    expect(rex.xp).toBe(22); // 2 walks*10 + 1 paw given*2
    expect(bella.xp).toBe(0); // the paw B RECEIVED is not effort
    expect(rex.rank).toBe(1);
    expect(b.me).toMatchObject({ rank: 1, tier: "gold" });
    // No home location is ever exposed.
    expect(rex).not.toHaveProperty("lb_area");
    expect(rex).not.toHaveProperty("lat");
  });
});

describe("E8 — density gate", () => {
  it("falls back to the friends board when the breed cohort is too small", async () => {
    await befriend(A, B);
    await raw`update pets set breed = 'Labrador' where id = ${A.petId}`; // only A is a Lab → cohort of 1

    authState.session = sessionFor(A.authUserId);
    const res = await boardOf(A.petId, "breed", 5); // min 5 > cohort 1
    const b = await res.json();
    expect(b.gated).toBe(true);
    expect(b.flavor).toBe("friends"); // fell back
    expect(b.board.length).toBeGreaterThan(0);
  });

  it("renders the breed board once the cohort meets the minimum", async () => {
    await raw`update pets set breed = 'Labrador' where id in (${A.petId}, ${B.petId})`;
    authState.session = sessionFor(A.authUserId);
    const res = await boardOf(A.petId, "breed", 2); // cohort of 2 meets min 2
    const b = await res.json();
    expect(b.gated).toBe(false);
    expect(b.flavor).toBe("breed");
    expect(b.board.map((r: any) => r.pet_id).sort()).toEqual([A.petId, B.petId]);
  });
});

describe("E8 — promotion / relegation", () => {
  it("reports a promotion vs last week's tier", async () => {
    await befriend(A, B);
    await befriend(A, C);
    // Last week A finished in bronze.
    await raw`insert into pet_leaderboard_weeks (pet_id, owner_user_id, flavor, week_start, xp, rank, tier)
              values (${A.petId}, ${A.profileId}, 'friends', (date_trunc('week', now()) - interval '7 days')::date, 5, 3, 'bronze')`;
    // This week A tops the friends cohort (rank 1 → gold).
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${A.petId}, ${A.profileId}, now())`;

    authState.session = sessionFor(A.authUserId);
    const b = await (await boardOf(A.petId, "friends", 1)).json();
    expect(b.me.tier).toBe("gold");
    expect(b.movement).toBe("promoted");
  });
});

describe("E8 — neighborhood opt-in", () => {
  it("opts in with a coarse area and renders the neighborhood cohort", async () => {
    authState.session = sessionFor(A.authUserId);
    await apiReq(`/pets/${A.petId}/leaderboard`, "POST", { action: "set_area", opt_in: true, area: "Palermo" });
    authState.session = sessionFor(B.authUserId);
    await apiReq(`/pets/${B.petId}/leaderboard`, "POST", { action: "set_area", opt_in: true, area: "Palermo" });

    authState.session = sessionFor(A.authUserId);
    const b = await (await boardOf(A.petId, "neighborhood", 2)).json();
    expect(b.gated).toBe(false);
    expect(b.flavor).toBe("neighborhood");
    expect(b.board.map((r: any) => r.pet_id).sort()).toEqual([A.petId, B.petId]);
  });
});
