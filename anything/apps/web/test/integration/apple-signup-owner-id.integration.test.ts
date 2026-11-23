// Regression guard for "Familia y cuidadores sends a new Sign-in-with-Apple user to onboarding".
//
// Hypothesis checked and REFUTED here: that an Apple sign-up saves the dog under the wrong owner id
// (auth_users.id instead of user_profiles.id), so /api/pets comes back empty under RLS and the app treats the
// owner as having no dog. (The real cause was client navigation — see mobile utils/popStackOnTabLeave.js.)
//
// Proven through the REAL Hono router (api.request) on real Postgres as pawpi_app:
//   • an Apple-style account (auth_users + an 'apple' auth_accounts row, NO profile yet — profiles are lazy)
//     gets the normal EMPTY answer from the launch/pet-sharing reads (never a 404/500);
//   • creating the first dog (what onboarding does) stores pets.owner_user_id = user_profiles.id — NOT the
//     auth id — with the two ids deliberately DIFFERENT so a mix-up cannot hide;
//   • afterwards GET /pets returns that dog and the Family & caregivers reads answer 200 for the account.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

// Apple-style account. Its auth id is far from any profile id the sequence will hand out.
const APPLE_AUTH_ID = 5000;
const EARLIER_OWNER = { authUserId: 1, profileId: 1, username: "earlier", petId: 1, petName: "Rex" };

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
  // An unrelated earlier owner, so ids already differ between the two id spaces.
  await seedOwnerWithPet(raw, EARLIER_OWNER);
  // seedOwnerWithPet inserts explicit ids without advancing the serial; move it so the Apple account's lazily
  // created profile gets a fresh id (101) that is different from its auth id (5000).
  await raw`select setval(pg_get_serial_sequence('user_profiles', 'id'), 100)`;
  await raw`select setval(pg_get_serial_sequence('pets', 'id'), 100)`;
  // The Apple sign-in (apple-native provider → adapter.createUser + linkAccount): auth rows only, no profile.
  await raw`insert into auth_users (id, name, email) values (${APPLE_AUTH_ID}, 'Apple User', 'relay@privaterelay.appleid.com')`;
  await raw`insert into auth_accounts ("userId", type, provider, "providerAccountId")
            values (${APPLE_AUTH_ID}, 'oidc', 'apple', 'apple-sub-test')`;
  authState.session = sessionFor(APPLE_AUTH_ID);
});

describe("Sign in with Apple account — owner id after onboarding", () => {
  it("before onboarding the launch and Family & caregivers reads answer EMPTY (not an error)", async () => {
    const pets = await apiReq("/pets");
    expect(pets.status).toBe(200);
    expect((await pets.json()).pets).toEqual([]);

    const mine = await apiReq("/pet-caregivers?mine=true");
    expect(mine.status).toBe(200);
    expect((await mine.json()).grants).toEqual([]);
  });

  it("creating the first dog stores owner_user_id = user_profiles.id, NOT auth_users.id", async () => {
    const created = await apiReq("/pets", "POST", { name: "Mango", species: "dog", breed: "Mixed" });
    expect(created.ok).toBe(true);
    const { pet } = await created.json();

    const [profile] = await raw`select id from user_profiles where auth_user_id = ${APPLE_AUTH_ID}`;
    expect(profile).toBeTruthy();
    expect(profile.id).not.toBe(APPLE_AUTH_ID); // the two id spaces really differ in this test
    expect(pet.owner_user_id).toBe(profile.id);

    // Nothing was ever written under the AUTH id.
    const underAuthId = await raw`select id from pets where owner_user_id = ${APPLE_AUTH_ID}`;
    expect(underAuthId).toHaveLength(0);
    const underProfile = await raw`select id from pets where owner_user_id = ${profile.id}`;
    expect(underProfile.map((p: any) => p.id)).toEqual([pet.id]);
  });

  it("after onboarding GET /pets returns the dog (so the app never treats the owner as having none)", async () => {
    await apiReq("/pets", "POST", { name: "Mango", species: "dog", breed: "Mixed" });

    const pets = await apiReq("/pets");
    expect(pets.status).toBe(200);
    const body = await pets.json();
    expect(body.pets.map((p: any) => p.name)).toEqual(["Mango"]);
  });

  it("Family & caregivers reads answer 200 for the new owner and their dog", async () => {
    const created = await apiReq("/pets", "POST", { name: "Mango", species: "dog", breed: "Mixed" });
    const { pet } = await created.json();

    const grants = await apiReq(`/pet-caregivers?petId=${pet.id}`);
    expect(grants.status).toBe(200);
    expect((await grants.json()).grants).toEqual([]);

    const mine = await apiReq("/pet-caregivers?mine=true");
    expect(mine.status).toBe(200);
    expect((await mine.json()).grants).toEqual([]);
  });

  it("the earlier owner's dog is never visible to the Apple account (scoping is by profile id)", async () => {
    await apiReq("/pets", "POST", { name: "Mango", species: "dog", breed: "Mixed" });
    const pets = await (await apiReq("/pets")).json();
    expect(pets.pets.map((p: any) => p.name)).toEqual(["Mango"]); // not Rex
  });
});
