// Unit E13 PR1 — the SHARED Care Ring (custody: "our dog, our streak") — proven through the REAL Hono
// router (api.request) on real Postgres as pawpi_app.
//
// Proves: an accepted caregiver (0049 grant) can read + close the SHARED ring; ANY contributor's log
// (owner OR caregiver, by pet_id) fills the shared segment; the streak is shared; a non-caregiver is
// denied (404); a REVOKED caregiver loses access; the pet OWNER's behaviour is unchanged.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const CARE = { authUserId: 2, profileId: 2, username: "caregiver" };
const THIRD = { authUserId: 3, profileId: 3, username: "stranger" };
const DAY = "2026-08-13";
const NOON = `${DAY} 12:00:00+00`;

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
  await seedUser(raw, CARE);
  await seedUser(raw, THIRD);
  // An ACCEPTED caregiver grant (0049 'family' = E13 "Caregiver": full day-to-day).
  await seedPetCaregiver(raw, {
    id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId,
    role: "family", status: "active",
  });
  authState.session = sessionFor(OWNER.authUserId);
});

// A walk/post/food for pet, attributed to `contributor`'s owner_user_id — the SHARED derivation counts
// it by pet_id regardless of which contributor logged it.
const seedWalk = (pet: number, contributor: number, ts = NOON) =>
  raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${pet}, ${contributor}, ${ts})`;
const seedPost = (pet: number, author: number, day = DAY) =>
  raw`insert into posts (user_id, pet_id, is_daily_update, post_date) values (${author}, ${pet}, true, ${day})`;
const seedFood = (pet: number, contributor: number, ts = NOON) =>
  raw`insert into health_food_logs (pet_id, owner_user_id, logged_at) values (${pet}, ${contributor}, ${ts})`;

describe("E13 PR1 — shared ring", () => {
  it("a caregiver can read the shared pet's ring (role=caregiver)", async () => {
    authState.session = sessionFor(CARE.authUserId);
    const res = await ringOf(OWNER.petId);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.role).toBe("caregiver");
  });

  it("the owner still reads their own ring (role=owner, unchanged)", async () => {
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b.role).toBe("owner");
  });

  it("a caregiver's logged walk fills the shared Walk segment for the owner", async () => {
    await seedWalk(OWNER.petId, CARE.profileId); // logged by the caregiver
    const b = await (await ringOf(OWNER.petId)).json(); // owner reads
    expect(b.walk_done).toBe(true);
  });

  it("mixed contributions from owner + caregiver close the shared ring, and a caregiver can persist it", async () => {
    await seedWalk(OWNER.petId, CARE.profileId);   // caregiver
    await seedPost(OWNER.petId, OWNER.profileId);   // owner
    await seedFood(OWNER.petId, CARE.profileId);    // caregiver
    authState.session = sessionFor(CARE.authUserId);
    const b = await (await ringOf(OWNER.petId)).json();
    expect(b).toMatchObject({ walk_done: true, moment_done: true, care_done: true, ring_closed: true, persisted: true });
    const [row] = await raw`select ring_closed from pet_care_days where pet_id = ${OWNER.petId} and day = ${DAY}`;
    expect(row?.ring_closed).toBe(true);
  });

  it("the streak is SHARED — a caregiver closing it, the owner sees the same streak", async () => {
    await seedWalk(OWNER.petId, CARE.profileId);
    await seedPost(OWNER.petId, CARE.profileId);
    await seedFood(OWNER.petId, CARE.profileId);
    authState.session = sessionFor(CARE.authUserId);
    const bc = await (await ringOf(OWNER.petId)).json();
    expect(bc.streak?.current_count).toBe(1);
    authState.session = sessionFor(OWNER.authUserId);
    const bo = await (await ringOf(OWNER.petId)).json();
    expect(bo.streak?.current_count).toBe(1);
  });

  it("a non-caregiver stranger is denied (404)", async () => {
    authState.session = sessionFor(THIRD.authUserId);
    expect((await ringOf(OWNER.petId)).status).toBe(404);
  });

  it("a REVOKED caregiver loses access (404)", async () => {
    await raw`update pet_caregivers set status = 'revoked' where pet_id = ${OWNER.petId} and grantee_user_id = ${CARE.profileId}`;
    authState.session = sessionFor(CARE.authUserId);
    expect((await ringOf(OWNER.petId)).status).toBe(404);
  });
});
