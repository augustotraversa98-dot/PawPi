// Unit E11 — "Rex's Week" weekly digest — proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app.
//
// Proves: the digest reads REAL owner-tz-week stats (walks / moments / care / ring days / best moment /
// friends / milestone); a quiet/empty week degrades to an honest state with NO fabricated numbers;
// another owner's data never leaks; a non-owner gets 404. Prefs default push-on/email-off, persist,
// and are owner-scoped. The weekly SENDER finds Sunday-evening due pets via the DEFINER enumerator,
// sends a 'weekly_digest' push, is idempotent (re-run = no double-send), and respects the push toggle.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedFriendship } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

// FF1: capture outbound emails so we can assert the digest renders in the recipient's locale.
const emailCalls = vi.hoisted(() => [] as any[]);
vi.mock("@/app/api/utils/email", () => ({
  sendEmail: async (m: any) => { emailCalls.push(m); },
}));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" };
const DAY = "2026-08-16"; // a Sunday; its owner-tz week is Mon 2026-08-10 .. Sun 2026-08-16
const SUNDAY_EVENING = "2026-08-16 21:30:00+00"; // 18:30 in America/Buenos_Aires (UTC-3)

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET", body?: unknown, headers?: Record<string, string>) {
  return api.request(path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const digestOf = (petId: number, day = DAY) => apiReq(`/pets/${petId}/weekly-digest?day=${day}`);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  process.env.CRON_SECRET = "test-secret";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  authState.session = sessionFor(OWNER.authUserId);
});

const seedWalk = (pet: number, owner: number, ts: string) =>
  raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${pet}, ${owner}, ${ts})`;
const seedFood = (pet: number, owner: number, ts: string) =>
  raw`insert into health_food_logs (pet_id, owner_user_id, logged_at) values (${pet}, ${owner}, ${ts})`;
// Bare pawer identities (auth_users + user_profiles) so post_paws' FK to user_profiles is satisfied.
async function seedPawer(id: number) {
  await raw`insert into auth_users (id, name, email) values (${id}, ${"pawer" + id}, ${"pawer" + id + "@example.com"})`;
  await raw`insert into user_profiles (id, auth_user_id, username, onboarding_completed)
            values (${id}, ${id}, ${"pawer" + id}, true)`;
}
async function seedDailyPost(pet: number, owner: number, day: string, paws = 0) {
  const [p] = await raw<{ id: number }[]>`
    insert into posts (user_id, pet_id, is_daily_update, post_date) values (${owner}, ${pet}, true, ${day})
    returning id`;
  for (let i = 0; i < paws; i++) {
    const pawerId = p.id * 1000 + i; // globally distinct per (post, paw)
    await seedPawer(pawerId);
    await raw`insert into post_paws (post_id, user_id) values (${p.id}, ${pawerId})`;
  }
  return p.id;
}

describe("E11 — weekly digest GET", () => {
  it("an empty week reads state 'empty' with zeroed real counts (no fake numbers)", async () => {
    const b = await (await digestOf(OWNER.petId)).json();
    expect(b).toMatchObject({
      state: "empty", walks: 0, moments: 0, care_actions: 0, ring_days_closed: 0, ring_days_total: 7,
    });
    expect(b.week_start).toBe("2026-08-10");
    expect(b.best_moment).toBeNull();
    expect(b.friends).toEqual([]);
  });

  it("a real week returns the real counts + the most-pawed moment", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-11 12:00:00+00");
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-13 12:00:00+00");
    await seedFood(OWNER.petId, OWNER.profileId, "2026-08-12 12:00:00+00");
    await seedDailyPost(OWNER.petId, OWNER.profileId, "2026-08-11", 1);
    const best = await seedDailyPost(OWNER.petId, OWNER.profileId, "2026-08-13", 4);

    const b = await (await digestOf(OWNER.petId)).json();
    expect(b.state).toBe("rich");
    expect(b.walks).toBe(2);
    expect(b.care_actions).toBe(1);
    expect(b.moments).toBe(2);
    expect(b.best_moment.post_id).toBe(best);
    expect(b.best_moment.paws).toBe(4);
  });

  it("a thin week (one walk, nothing else) degrades to 'quiet'", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-11 12:00:00+00");
    const b = await (await digestOf(OWNER.petId)).json();
    expect(b.state).toBe("quiet");
    expect(b.walks).toBe(1);
  });

  it("logs outside the week are excluded", async () => {
    await seedWalk(OWNER.petId, OWNER.profileId, "2026-08-03 12:00:00+00"); // prior week
    const b = await (await digestOf(OWNER.petId)).json();
    expect(b.walks).toBe(0);
  });

  it("another owner's logs never count", async () => {
    await seedWalk(OTHER.petId, OTHER.profileId, "2026-08-12 12:00:00+00");
    await seedDailyPost(OTHER.petId, OTHER.profileId, "2026-08-12", 3);
    const b = await (await digestOf(OWNER.petId)).json();
    expect(b.walks).toBe(0);
    expect(b.moments).toBe(0);
  });

  it("a friend who posted a daily moment this week appears in the friends strip", async () => {
    await seedFriendship(raw, {
      requesterUserId: OWNER.profileId, receiverUserId: OTHER.profileId,
      requesterPetId: OWNER.petId, receiverPetId: OTHER.petId, status: "accepted",
    });
    await seedDailyPost(OTHER.petId, OTHER.profileId, "2026-08-12", 0);
    const b = await (await digestOf(OWNER.petId)).json();
    expect(b.friends.map((f: any) => f.pet_id)).toContain(OTHER.petId);
    expect(b.friends.find((f: any) => f.pet_id === OTHER.petId).name).toBe("Bella");
  });

  it("an upcoming birthday within 7 days surfaces as a milestone", async () => {
    await raw`update pets set birthday = '2020-08-18' where id = ${OWNER.petId}`;
    const b = await (await digestOf(OWNER.petId, "2026-08-16")).json();
    expect(b.milestone).toEqual({ kind: "birthday", in_days: 2 });
  });

  it("a non-owner cannot read this pet's digest (404)", async () => {
    authState.session = sessionFor(OTHER.authUserId);
    expect((await digestOf(OWNER.petId)).status).toBe(404);
  });

  it("a non-integer id => 404 before SQL", async () => {
    expect((await apiReq(`/pets/abc/weekly-digest`)).status).toBe(404);
  });
});

describe("E11 — weekly digest prefs", () => {
  it("default is push on, email off", async () => {
    const b = await (await apiReq(`/engagement/weekly-digest-prefs`)).json();
    expect(b).toEqual({ push_enabled: true, email_enabled: false });
  });

  it("PUT persists a partial update", async () => {
    await apiReq(`/engagement/weekly-digest-prefs`, "PUT", { email_enabled: true });
    const b = await (await apiReq(`/engagement/weekly-digest-prefs`)).json();
    expect(b).toEqual({ push_enabled: true, email_enabled: true });
  });

  it("prefs are owner-scoped (another owner sees defaults)", async () => {
    await apiReq(`/engagement/weekly-digest-prefs`, "PUT", { push_enabled: false });
    authState.session = sessionFor(OTHER.authUserId);
    const b = await (await apiReq(`/engagement/weekly-digest-prefs`)).json();
    expect(b).toEqual({ push_enabled: true, email_enabled: false });
  });
});

describe("E11 — weekly digest sender (cron)", () => {
  const runAt = (now: string) =>
    apiReq(`/engagement/weekly-digest/run`, "POST", { now, limit: 100 }, { "x-cron-secret": "test-secret" });

  const digestNotifs = (recipient: number) =>
    raw`select * from notifications where recipient_user_id = ${recipient} and type = 'weekly_digest'`;

  it("rejects a missing/bad secret", async () => {
    expect((await apiReq(`/engagement/weekly-digest/run`, "POST", { now: SUNDAY_EVENING })).status).toBe(401);
  });

  it("sends a weekly_digest push to a Sunday-evening owner, and is idempotent", async () => {
    const r1 = await runAt(SUNDAY_EVENING);
    expect(r1.status).toBe(200);
    const notifs1 = await digestNotifs(OWNER.profileId);
    expect(notifs1.length).toBe(1);

    // Re-running the same week must not double-send.
    await runAt(SUNDAY_EVENING);
    const notifs2 = await digestNotifs(OWNER.profileId);
    expect(notifs2.length).toBe(1);
  });

  it("does not send on a non-Sunday", async () => {
    await runAt("2026-08-13 21:30:00+00"); // a Thursday evening
    expect((await digestNotifs(OWNER.profileId)).length).toBe(0);
  });

  it("respects push_enabled=false (no push, week still claimed)", async () => {
    await raw`insert into weekly_digest_prefs (owner_user_id, push_enabled, email_enabled)
              values (${OWNER.profileId}, false, false)`;
    await runAt(SUNDAY_EVENING);
    expect((await digestNotifs(OWNER.profileId)).length).toBe(0);
    const [state] = await raw`select * from weekly_digest_state where pet_id = ${OWNER.petId}`;
    expect(state).toBeTruthy(); // week was claimed so it won't be reconsidered
  });

  // FF1 — the email renders in the recipient's stored locale (es-AR fallback when null).
  it("renders the digest email in the recipient's preferred_locale", async () => {
    await raw`insert into weekly_digest_prefs (owner_user_id, push_enabled, email_enabled)
              values (${OWNER.profileId}, true, true)`;

    // English user → English subject.
    emailCalls.length = 0;
    await raw`update user_profiles set preferred_locale = 'en' where id = ${OWNER.profileId}`;
    await runAt(SUNDAY_EVENING);
    expect(emailCalls.length).toBe(1);
    expect(emailCalls[0].to).toBe("owner@example.com");
    expect(emailCalls[0].subject).toMatch(/week/i);
    expect(emailCalls[0].subject).not.toMatch(/semana/i);

    // A different pet/owner with NULL locale → Spanish (es-AR) fallback, same run mechanics.
    emailCalls.length = 0;
    await raw`insert into weekly_digest_prefs (owner_user_id, push_enabled, email_enabled)
              values (${OTHER.profileId}, true, true)`;
    await raw`update user_profiles set preferred_locale = null where id = ${OTHER.profileId}`;
    authState.session = sessionFor(OTHER.authUserId);
    // Next Sunday so OTHER's week hasn't been claimed yet.
    await runAt("2026-08-23 21:30:00+00");
    const otherEmail = emailCalls.find((m) => m.to === "other@example.com");
    expect(otherEmail).toBeTruthy();
    expect(otherEmail.subject).toMatch(/semana/i);
  });
});
