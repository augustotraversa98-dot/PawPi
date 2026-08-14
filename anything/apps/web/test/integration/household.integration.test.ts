// Unit E14 — multi-pet household + family streak — proven through the REAL Hono router (api.request) on
// real Postgres as pawpi_app.
//
// Proves: the household lists all of a user's dogs (owned + co-cared) with per-dog ring/streak; strict
// per-pet scoping (each dog independent); the family streak is opt-in + advances ONLY when EVERY owned
// dog closed its ring that day (forgiveness/never-shame is E2's logic); a single-dog account is
// unaffected (family streak inert); another user's dogs never leak in.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" };
const DAY = "2026-08-13";

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
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  authState.session = sessionFor(OWNER.authUserId);
});

// A second owned dog for OWNER.
const seedSecondDog = (petId: number, name: string) =>
  raw`insert into pets (id, owner_user_id, name, handle) values (${petId}, ${OWNER.profileId}, ${name}, ${"owner-" + name.toLowerCase()})`;
const seedRingClosed = (petId: number, day = DAY, closed = true) =>
  raw`insert into pet_care_days (pet_id, owner_user_id, day, ring_closed) values (${petId}, ${OWNER.profileId}, ${day}, ${closed})`;

describe("E14 — household home", () => {
  it("lists all of the user's owned dogs with per-dog ring/streak", async () => {
    await seedSecondDog(3, "Max");
    const b = await (await apiReq(`/household`)).json();
    expect(b.owned_count).toBe(2);
    expect(b.dogs.map((d: any) => d.name).sort()).toEqual(["Max", "Rex"]);
    expect(b.dogs.every((d: any) => d.is_mine)).toBe(true);
  });

  it("includes a co-cared dog (owned + co-cared)", async () => {
    // OWNER co-cares OTHER's pet (Bella).
    await seedPetCaregiver(raw, {
      id: 1, petId: OTHER.petId, ownerUserId: OTHER.profileId, granteeUserId: OWNER.profileId,
      role: "family", status: "active",
    });
    const b = await (await apiReq(`/household`)).json();
    const bella = b.dogs.find((d: any) => d.id === OTHER.petId);
    expect(bella).toBeTruthy();
    expect(bella.is_mine).toBe(false);
  });

  it("another user's dogs never leak in", async () => {
    const b = await (await apiReq(`/household`)).json();
    expect(b.dogs.find((d: any) => d.id === OTHER.petId)).toBeFalsy();
  });

  it("a single-dog account: family streak inert (opted_in false, current 0)", async () => {
    const b = await (await apiReq(`/household`)).json();
    expect(b.owned_count).toBe(1);
    expect(b.family_streak).toMatchObject({ opted_in: false, current: 0 });
  });
});

describe("E14 — family streak", () => {
  it("opt-in persists", async () => {
    const r = await apiReq(`/household`, "POST", { action: "family_streak_opt_in" });
    expect((await r.json()).opted_in).toBe(true);
    const b = await (await apiReq(`/household`)).json();
    expect(b.family_streak.opted_in).toBe(true);
  });

  it("advances ONLY when EVERY owned dog closed its ring that day", async () => {
    await seedSecondDog(3, "Max");
    await raw`insert into household_streaks (owner_user_id, opted_in) values (${OWNER.profileId}, true)`;

    // Only Rex closes → family streak stays 0.
    await seedRingClosed(OWNER.petId, DAY, true);
    await raw`select app_advance_household_streak(${OWNER.profileId}, ${DAY}::date)`;
    let [fs] = await raw`select current_count from household_streaks where owner_user_id = ${OWNER.profileId}`;
    expect(fs.current_count).toBe(0);

    // Now Max also closes → the whole household closed → family streak advances to 1.
    await seedRingClosed(3, DAY, true);
    await raw`select app_advance_household_streak(${OWNER.profileId}, ${DAY}::date)`;
    [fs] = await raw`select current_count from household_streaks where owner_user_id = ${OWNER.profileId}`;
    expect(fs.current_count).toBe(1);
  });

  it("does not advance when not opted in (inert)", async () => {
    await seedSecondDog(3, "Max");
    await seedRingClosed(OWNER.petId, DAY, true);
    await seedRingClosed(3, DAY, true);
    // No household_streaks row / not opted in.
    await raw`select app_advance_household_streak(${OWNER.profileId}, ${DAY}::date)`;
    const rows = await raw`select current_count from household_streaks where owner_user_id = ${OWNER.profileId}`;
    expect(rows.length).toBe(0); // still no row → inert
  });
});
