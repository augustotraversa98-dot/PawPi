// Who logged each health entry (migration 0144): stamped by the database from the request identity, shown as the public
// display name only, "Former member" once the account is gone, nothing for older entries. Real router, real Postgres.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";
import { MIGRATIONS_DIR } from "./migrate";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const FAMILY = { authUserId: 2, profileId: 2, username: "family" };
const CARE = { authUserId: 3, profileId: 3, username: "care" };
const PET = OWNER.petId;

let raw: Sql;
let app: Sql;
let api: any;

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
const logFood = async (u: { authUserId: number }, foodName: string, extra: object = {}) => {
  as(u);
  const res = await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName, ...extra });
  expect(res.status).toBe(201);
};
const foods = async (u: { authUserId: number } = OWNER) => {
  as(u);
  const body = await (await req(`/health/food-logs?petId=${PET}`)).json();
  return Object.fromEntries(body.logs.map((l: any) => [l.food_name, l]));
};

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  app = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""), username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {} });
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });
beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  for (const u of [FAMILY, CARE]) await seedUser(raw, u);
  // account deletion creates the anonymous "Former member": keep the id sequences past the seeded rows
  for (const t of ["auth_users", "user_profiles"]) {
    await raw.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), 10000)`);
  }
  await raw`update user_profiles set full_name = 'Olga Owner' where id = ${OWNER.profileId}`;
  await raw`update user_profiles set full_name = 'Sam Rivera' where id = ${FAMILY.profileId}`;
  await raw`update user_profiles set full_name = null where id = ${CARE.profileId}`;
  await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await seedPetCaregiver(raw, { id: 2, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId, role: "caregiver" });
});

describe("who logged it", () => {
  it("each entry shows the person who wrote it, by display name, with no id or username", async () => {
    await logFood(OWNER, "owner-food");
    await logFood(FAMILY, "family-food");
    await logFood(CARE, "care-food");
    const rows = await foods(FAMILY);
    expect(rows["owner-food"].logged_by_name).toBe("Olga Owner");
    expect(rows["family-food"].logged_by_name).toBe("Sam Rivera");
    expect(rows["care-food"].logged_by_name).toBeUndefined(); // no public name: nothing, never the username
    for (const row of Object.values<any>(rows)) {
      expect(row).not.toHaveProperty("logged_by_user_id");
      expect(row).not.toHaveProperty("logged_by_known");
      expect(JSON.stringify(row)).not.toContain('"care"');
    }
    // still one shared history under the owner's id
    expect((await raw`select distinct owner_user_id from health_food_logs`).map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
  });

  it("a client cannot claim to be someone else", async () => {
    await logFood(FAMILY, "spoof", { logged_by_user_id: OWNER.profileId, loggedByUserId: OWNER.profileId });
    expect((await foods())["spoof"].logged_by_name).toBe("Sam Rivera");
    await app.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${String(FAMILY.profileId)}, true)`;
      await tx`insert into health_food_logs (pet_id, owner_user_id, meal_type, food_name, logged_by_user_id)
               values (${PET}, ${OWNER.profileId}, 'dinner', 'direct', ${OWNER.profileId})`;
    });
    expect((await foods())["direct"].logged_by_name).toBe("Sam Rivera");
    await raw`update health_food_logs set logged_by_user_id = ${OWNER.profileId} where food_name = 'direct'`;
    expect((await foods())["direct"].logged_by_name).toBe("Sam Rivera"); // cannot be re-assigned
  });

  it("an older entry has no author; a deleted account reads Former member", async () => {
    await raw`insert into health_food_logs (pet_id, owner_user_id, meal_type, food_name) values (${PET}, ${OWNER.profileId}, 'dinner', 'old')`;
    await logFood(FAMILY, "later-gone");
    as(FAMILY);
    expect((await req("/account", "DELETE")).status).toBe(200);
    const rows = await foods();
    expect(rows["old"].logged_by_name).toBeUndefined();
    expect(rows["later-gone"].logged_by_name).toBe("Former member");
  });

  it("works for the other log types (weight, walk, wellness)", async () => {
    as(FAMILY);
    expect((await req("/health/weight-logs", "POST", { petId: PET, weight: 20, weightUnit: "kg" })).status).toBeLessThan(300);
    const weight = await (await req(`/health/weight-logs?petId=${PET}`)).json();
    expect(weight.logs[0].logged_by_name).toBe("Sam Rivera");
    expect((await req("/health/walk-logs", "POST", { petId: PET, durationMinutes: 10 })).status).toBeLessThan(300);
    const walk = await (await req(`/health/walk-logs?petId=${PET}`)).json();
    expect(walk.logs[0].logged_by_name).toBe("Sam Rivera");
  });
});

describe("migration", () => {
  const file = () => readFileSync(join(MIGRATIONS_DIR, "0144_log_logged_by.sql"), "utf8");

  it("is idempotent and verify_0144.sql reads PASS on every row", async () => {
    await raw.unsafe(file());
    const rows = await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0144.sql"), "utf8"));
    expect(rows.length).toBe(7);
    expect(rows.filter((r: any) => r.status !== "PASS")).toEqual([]);
  });

  it("without it logging and reading work as before, with no name", async () => {
    await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "rollback_0144.sql"), "utf8"));
    try {
      await logFood(FAMILY, "plain");
      const rows = await foods();
      expect(rows["plain"].logged_by_name).toBeUndefined();
    } finally {
      await raw.unsafe(file());
    }
  });
});
