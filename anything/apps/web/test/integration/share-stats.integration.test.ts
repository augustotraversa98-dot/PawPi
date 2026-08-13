// Unit E4 — share-card stats — proven through the REAL Hono router on real Postgres as pawpi_app.
// REAL stats only: walks this week + total moments come from the pet's own logs; the streak reads
// pet_streaks. Owner-scoped (404 for a non-owned pet). Empty state is honest 0 / null, never faked.

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

let raw: Sql;
let api: any;
const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
const stats = (petId: number, day = DAY) => api.request(`/pets/${petId}/share-stats?day=${day}`);

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

describe("E4 — share stats", () => {
  it("empty pet => honest zeros / null streak (no fabricated numbers)", async () => {
    const b = await (await stats(OWNER.petId)).json();
    expect(b).toMatchObject({ walks_this_week: 0, moments_total: 0, streak: null });
    expect(b.pet).toMatchObject({ id: OWNER.petId, name: "Rex" });
    expect(b.pet.handle).toBeTruthy();
  });

  it("counts real walks in the last 7 days and total daily moments", async () => {
    // 2 walks inside the window, 1 outside (older than 7 days) → counts 2.
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${OWNER.petId}, ${OWNER.profileId}, '2026-08-13 12:00:00+00')`;
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${OWNER.petId}, ${OWNER.profileId}, '2026-08-09 12:00:00+00')`;
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${OWNER.petId}, ${OWNER.profileId}, '2026-08-01 12:00:00+00')`;
    await raw`insert into posts (user_id, pet_id, is_daily_update, post_date) values (${OWNER.profileId}, ${OWNER.petId}, true, '2026-08-13')`;
    await raw`insert into posts (user_id, pet_id, is_daily_update, post_date) values (${OWNER.profileId}, ${OWNER.petId}, true, '2026-08-12')`;
    const b = await (await stats(OWNER.petId)).json();
    expect(b.walks_this_week).toBe(2);
    expect(b.moments_total).toBe(2);
  });

  it("surfaces the real streak when one exists", async () => {
    await raw`insert into pet_streaks (pet_id, owner_user_id, current_count, longest_count) values (${OWNER.petId}, ${OWNER.profileId}, 12, 30)`;
    const b = await (await stats(OWNER.petId)).json();
    expect(b.streak).toEqual({ current: 12, longest: 30 });
  });

  it("another owner's logs never leak in; a non-owned pet 404s", async () => {
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${OTHER.petId}, ${OTHER.profileId}, '2026-08-13 12:00:00+00')`;
    const b = await (await stats(OWNER.petId)).json();
    expect(b.walks_this_week).toBe(0); // OTHER's walk excluded
    expect((await stats(OTHER.petId)).status).toBe(404); // not owned by the caller
  });
});
