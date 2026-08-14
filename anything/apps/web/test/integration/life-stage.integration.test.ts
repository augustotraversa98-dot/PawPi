// Unit E15 — life-stage ring goals — proven through the REAL Hono router (api.request) on real Postgres
// as pawpi_app.
//
// Proves: the stage is detected from age + size (puppy/adult/senior); an owner override wins and
// persists (and clears back to detected); the ring keeps its three segments; a caregiver can read but
// only the OWNER can set the override; a non-caregiver is denied.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const CARE = { authUserId: 2, profileId: 2, username: "caregiver" };
const STRANGER = { authUserId: 3, profileId: 3, username: "stranger" };

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
const stageOf = (petId: number) => apiReq(`/pets/${petId}/life-stage`);

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
  authState.session = sessionFor(OWNER.authUserId);
});

describe("E15 — life-stage detection", () => {
  it("a large senior dog is detected 'senior' and keeps three segments", async () => {
    await raw`update pets set age_years = 8, weight = 30, weight_unit = 'kg' where id = ${OWNER.petId}`;
    const b = await (await stageOf(OWNER.petId)).json();
    expect(b.detected).toBe("senior");
    expect(b.effective).toBe("senior");
    expect(b.goals.segments).toEqual(["walk", "moment", "care"]);
  });

  it("a young dog is detected 'puppy'", async () => {
    await raw`update pets set age_years = 0, age_months = 6 where id = ${OWNER.petId}`;
    const b = await (await stageOf(OWNER.petId)).json();
    expect(b.detected).toBe("puppy");
  });

  it("unknown age defaults to 'adult' (conservative)", async () => {
    const b = await (await stageOf(OWNER.petId)).json();
    expect(b.detected).toBe("adult");
  });
});

describe("E15 — owner override", () => {
  it("the owner sets an override that wins and persists, then clears back to detected", async () => {
    await raw`update pets set age_years = 8, weight = 30, weight_unit = 'kg' where id = ${OWNER.petId}`; // detected senior
    await apiReq(`/pets/${OWNER.petId}/life-stage`, "POST", { life_stage: "adult" });
    let b = await (await stageOf(OWNER.petId)).json();
    expect(b.override).toBe("adult");
    expect(b.effective).toBe("adult"); // override wins over detected senior

    await apiReq(`/pets/${OWNER.petId}/life-stage`, "POST", { life_stage: null });
    b = await (await stageOf(OWNER.petId)).json();
    expect(b.override).toBeNull();
    expect(b.effective).toBe("senior"); // back to detected
  });

  it("rejects an invalid override value", async () => {
    expect((await apiReq(`/pets/${OWNER.petId}/life-stage`, "POST", { life_stage: "elder" })).status).toBe(400);
  });

  it("a caregiver can read but NOT set the override (403); a stranger is denied (404)", async () => {
    await seedPetCaregiver(raw, {
      id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId,
      role: "family", status: "active",
    });
    authState.session = sessionFor(CARE.authUserId);
    expect((await stageOf(OWNER.petId)).status).toBe(200);
    expect((await apiReq(`/pets/${OWNER.petId}/life-stage`, "POST", { life_stage: "puppy" })).status).toBe(403);

    authState.session = sessionFor(STRANGER.authUserId);
    expect((await stageOf(OWNER.petId)).status).toBe(404);
  });
});
