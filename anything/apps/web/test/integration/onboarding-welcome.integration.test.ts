// Unit E6 — Onboarding D1 polish — proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app.
//
// POST /onboarding/welcome, called right after the first daily moment is posted, must:
//   • start the streak at day 1 (pet_streaks.current_count = 1), and never overwrite an existing one
//   • grant the ONE allowed labelled seeded interaction: a first paw from the official "PawPi Welcome"
//     account (post_paws row from that account) + a labelled 'welcome' notification to the owner
//   • be idempotent (a repeat call adds no second paw and leaves the streak at 1)
//   • reject a post that isn't the caller's own pet (404)

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" };
const WELCOME = { authUserId: 99, profileId: 99, username: "pawpi_welcome" };
const OWNER_POST = 10;
const OTHER_POST = 20;

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "POST", body?: unknown) {
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
  // The official welcome account (resetDb wipes the migration-seeded one, so seed it here).
  await raw`insert into auth_users (id, name, email) values (${WELCOME.authUserId}, 'PawPi Welcome', 'welcome@pawpi.system')`;
  await raw`insert into user_profiles (id, auth_user_id, username, onboarding_completed)
            values (${WELCOME.profileId}, ${WELCOME.authUserId}, ${WELCOME.username}, true)`;
  // A first daily moment for each owner.
  await raw`insert into posts (id, user_id, pet_id, is_daily_update, post_date)
            values (${OWNER_POST}, ${OWNER.profileId}, ${OWNER.petId}, true, '2026-08-14')`;
  await raw`insert into posts (id, user_id, pet_id, is_daily_update, post_date)
            values (${OTHER_POST}, ${OTHER.profileId}, ${OTHER.petId}, true, '2026-08-14')`;
  authState.session = sessionFor(OWNER.authUserId);
});

describe("E6 — POST /onboarding/welcome", () => {
  it("starts the ring: day-1 streak + a labelled welcome paw + welcome notification", async () => {
    const res = await apiReq("/onboarding/welcome", "POST", { post_id: OWNER_POST, pet_id: OWNER.petId });
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.welcomed).toBe(true);
    expect(b.streak).toMatchObject({ current_count: 1 });
    expect(b.welcome_actor).toBe("pawpi_welcome");

    // streak seeded to 1
    const [streak] = await raw`select current_count from pet_streaks where pet_id = ${OWNER.petId}`;
    expect(streak.current_count).toBe(1);

    // a real paw from the welcome account on the owner's post
    const paws = await raw`select user_id from post_paws where post_id = ${OWNER_POST}`;
    expect(paws.map((p: any) => p.user_id)).toEqual([WELCOME.profileId]);

    // a labelled 'welcome' notification to the owner, from the welcome account
    const [notif] = await raw`
      select type, recipient_user_id, actor_user_id from notifications
      where recipient_user_id = ${OWNER.profileId} and type = 'welcome'`;
    expect(notif).toBeTruthy();
    expect(notif.actor_user_id).toBe(WELCOME.profileId);
  });

  it("is idempotent — a repeat call adds no second paw and keeps the streak at 1", async () => {
    await apiReq("/onboarding/welcome", "POST", { post_id: OWNER_POST, pet_id: OWNER.petId });
    await apiReq("/onboarding/welcome", "POST", { post_id: OWNER_POST, pet_id: OWNER.petId });
    const paws = await raw`select id from post_paws where post_id = ${OWNER_POST}`;
    expect(paws).toHaveLength(1);
    const [streak] = await raw`select current_count from pet_streaks where pet_id = ${OWNER.petId}`;
    expect(streak.current_count).toBe(1);
  });

  it("never overwrites an existing real streak", async () => {
    await raw`insert into pet_streaks (pet_id, owner_user_id, current_count, longest_count)
              values (${OWNER.petId}, ${OWNER.profileId}, 12, 12)`;
    await apiReq("/onboarding/welcome", "POST", { post_id: OWNER_POST, pet_id: OWNER.petId });
    const [streak] = await raw`select current_count from pet_streaks where pet_id = ${OWNER.petId}`;
    expect(streak.current_count).toBe(12);
  });

  it("404s for a post that isn't the caller's own pet", async () => {
    const res = await apiReq("/onboarding/welcome", "POST", { post_id: OTHER_POST, pet_id: OTHER.petId });
    expect(res.status).toBe(404);
  });

  it("400s without post_id / pet_id", async () => {
    const res = await apiReq("/onboarding/welcome", "POST", {});
    expect(res.status).toBe(400);
  });
});
