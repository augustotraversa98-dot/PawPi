// FF2 — caregiver in-app logging (walk / health beyond the daily moment) — proven through the REAL
// Hono router (api.request) on real Postgres as pawpi_app.
//
// Proves the broadened WRITE gate + attribution model:
//   • the OWNER can log (unchanged);
//   • an accepted 'family' caregiver (E13 "Caregiver") CAN log a walk / food / general check, and the
//     row is anchored to the pet's OWNER (owner_user_id = owner) so it stays visible to the household;
//   • a 'caregiver' grant (E13 "Viewer") CANNOT write health logs (0049 grants family-only) → 403;
//   • a non-grantee stranger → 403.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const FAM = { authUserId: 2, profileId: 2, username: "fam" };      // family grantee (full logging)
const VIEWER = { authUserId: 3, profileId: 3, username: "viewer" }; // caregiver grantee (read-only)
const STRANGER = { authUserId: 4, profileId: 4, username: "stranger" };

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
const logWalk = (petId: number) =>
  apiReq(`/health/walk-logs`, "POST", { petId, durationMinutes: 20, routeOrLocation: "park" });
const logFood = (petId: number) =>
  apiReq(`/health/food-logs`, "POST", { petId, mealType: "dinner", foodName: "kibble" });
const logCheck = (petId: number) =>
  apiReq(`/health/general-checks`, "POST", { petId, mood: "happy", energy: "high" });

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
  await seedUser(raw, FAM);
  await seedUser(raw, VIEWER);
  await seedUser(raw, STRANGER);
  await seedPetCaregiver(raw, {
    id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: FAM.profileId,
    role: "family", status: "active",
  });
  await seedPetCaregiver(raw, {
    id: 2, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: VIEWER.profileId,
    role: "caregiver", status: "active",
  });
});

describe("FF2 — caregiver health/walk logging", () => {
  it("the owner can log a walk (unchanged), attributed to themselves", async () => {
    authState.session = sessionFor(OWNER.authUserId);
    expect((await logWalk(OWNER.petId)).status).toBe(201);
    const rows = await raw`select owner_user_id from health_walk_logs where pet_id = ${OWNER.petId}`;
    expect(rows.map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
  });

  it("a family caregiver can log a walk, anchored to the pet's OWNER", async () => {
    authState.session = sessionFor(FAM.authUserId);
    expect((await logWalk(OWNER.petId)).status).toBe(201);
    const rows = await raw`select owner_user_id from health_walk_logs where pet_id = ${OWNER.petId}`;
    // Anchored to the owner (NOT the caregiver) so it stays visible to the household + counts in the ring.
    expect(rows.map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
  });

  it("a family caregiver can log food + a general check too", async () => {
    authState.session = sessionFor(FAM.authUserId);
    expect((await logFood(OWNER.petId)).status).toBe(201);
    expect((await logCheck(OWNER.petId)).status).toBe(201);
    const [f] = await raw`select owner_user_id from health_food_logs where pet_id = ${OWNER.petId}`;
    const [c] = await raw`select owner_user_id from health_general_checks where pet_id = ${OWNER.petId}`;
    expect(f.owner_user_id).toBe(OWNER.profileId);
    expect(c.owner_user_id).toBe(OWNER.profileId);
  });

  it("a 'caregiver' grant (Viewer) CANNOT write health logs (family-only) → 403", async () => {
    authState.session = sessionFor(VIEWER.authUserId);
    expect((await logWalk(OWNER.petId)).status).toBe(403);
    expect((await logFood(OWNER.petId)).status).toBe(403);
    expect(await raw`select 1 from health_walk_logs where pet_id = ${OWNER.petId}`).toHaveLength(0);
  });

  it("a non-grantee stranger → 403", async () => {
    authState.session = sessionFor(STRANGER.authUserId);
    expect((await logWalk(OWNER.petId)).status).toBe(403);
  });
});
