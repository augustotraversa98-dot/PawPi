// Walk distances are kilometres everywhere (owner decision 2026-11-27). Builds up to 37 send "miles" for a hand-typed walk, although
// their Spanish form asks for kilometres and only the English one asks for miles; the server reads the number accordingly and stores km.
// Migration 0164 does the same to rows saved before. Real router, real Postgres as pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";
import { MIGRATIONS_DIR } from "./migrate";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const ES = { authUserId: 1, profileId: 1, username: "es", petId: 1, petName: "Rex" };
const EN = { authUserId: 2, profileId: 2, username: "en", petId: 2, petName: "Duke" };

let raw: Sql;
let api: any;

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const log = (body: object, headers: Record<string, string> = {}) =>
  api.request("/health/walk-logs", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const stored = async (petId: number) =>
  (await raw`select distance::float8 as distance, distance_unit from health_walk_logs where pet_id = ${petId} order by id`).map((r) => [r.distance, r.distance_unit]);
const migration = () => readFileSync(join(MIGRATIONS_DIR, "0164_distances_in_km.sql"), "utf8");

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
  await seedOwnerWithPet(raw, ES);
  await seedOwnerWithPet(raw, EN);
  await raw`update user_profiles set preferred_locale = 'es' where id = ${ES.profileId}`;
  await raw`update user_profiles set preferred_locale = 'en' where id = ${EN.profileId}`;
});

describe("saving a walk", () => {
  it("keeps kilometres, and assumes them when no unit is sent", async () => {
    as(EN);
    expect((await log({ petId: EN.petId, distance: 2.5, distanceUnit: "km" })).status).toBeLessThan(300);
    expect((await log({ petId: EN.petId, distance: "3,5" })).status).toBeLessThan(300);
    expect(await stored(EN.petId)).toEqual([[2.5, "km"], [3.5, "km"]]);
  });

  it("an older Spanish build typed kilometres under the 'miles' label: the number is kept", async () => {
    as(ES);
    await log({ petId: ES.petId, distance: 2, distanceUnit: "miles" });
    expect(await stored(ES.petId)).toEqual([[2, "km"]]);
  });

  it("an older English build typed miles: they are converted", async () => {
    as(EN);
    await log({ petId: EN.petId, distance: 2, distanceUnit: "miles" });
    expect(await stored(EN.petId)).toEqual([[3.22, "km"]]);
  });

  it("with no saved language, the phone's language decides (Spanish when unknown)", async () => {
    await raw`update user_profiles set preferred_locale = null`;
    as(EN);
    await log({ petId: EN.petId, distance: 2, distanceUnit: "miles" }, { "accept-language": "en-US,en;q=0.9" });
    as(ES);
    await log({ petId: ES.petId, distance: 2, distanceUnit: "miles" });
    expect(await stored(EN.petId)).toEqual([[3.22, "km"]]);
    expect(await stored(ES.petId)).toEqual([[2, "km"]]);
  });

  it("the health timeline writes kilometres", async () => {
    as(ES);
    await log({ petId: ES.petId, distance: 2.5, distanceUnit: "km", durationMinutes: 30 });
    const res = await api.request(`/health/timeline?petId=${ES.petId}`);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("30 min, 2.5 km");
    expect(text).not.toMatch(/\d mi[^n]/);
  });
});

describe("migration 0164", () => {
  const seed = (u: typeof ES, distance: number | null, unit: string, source = "manual") =>
    raw`insert into health_walk_logs (pet_id, owner_user_id, distance, distance_unit, source) values (${u.petId}, ${u.profileId}, ${distance}, ${unit}, ${source})`;

  it("relabels what was typed in Spanish, converts what really was miles, and leaves km alone", async () => {
    await seed(ES, 2, "miles");
    await seed(ES, 1.24, "miles", "walker"); // the server turned a tracked route into miles
    await seed(ES, 4, "km");
    await seed(ES, null, "miles");
    await seed(EN, 2, "miles");
    await raw.unsafe(migration());
    await raw.unsafe(migration()); // safe to run again
    expect(await stored(ES.petId)).toEqual([[2, "km"], [2, "km"], [4, "km"], [null, "km"]]);
    expect(await stored(EN.petId)).toEqual([[3.22, "km"]]);
  });

  it("new rows default to km, and verify_0164 passes", async () => {
    await raw.unsafe(migration());
    await raw`insert into health_walk_logs (pet_id, owner_user_id, distance) values (${ES.petId}, ${ES.profileId}, 1)`;
    expect(await stored(ES.petId)).toEqual([[1, "km"]]);
    const rows = (await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0164.sql"), "utf8"))) as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.status !== "PASS")).toEqual([]);
  });
});
