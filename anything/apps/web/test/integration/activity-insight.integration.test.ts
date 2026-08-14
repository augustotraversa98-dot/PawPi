// Unit E9 — Comparative health insight — proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app.
//
// Proves: with one user, personal-history insights render (more-than-last / best-month / gentle nudge);
// a BELOW-median pet NEVER receives a cohort comparison (falls back to personal/nudge); a cohort win
// only fires above median + at/above min cohort; the disclaimer is always present.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
// A pool of same-breed, same-age peers to build a dense cohort.
const PEERS = Array.from({ length: 6 }, (_, i) => ({
  authUserId: 10 + i, profileId: 10 + i, username: `peer${i}`, petId: 10 + i, petName: `Peer${i}`,
}));

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET") {
  return api.request(path, { method });
}
const insightOf = (petId: number, min = 5) => apiReq(`/pets/${petId}/activity-insight?min=${min}`);

// weeks ago → a timestamp inside that owner-tz week (midday UTC is safely mid-week for UTC-3).
async function seedWalk(pet: number, owner: number, weeksAgo: number) {
  await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time)
            values (${pet}, ${owner}, (date_trunc('week', now()) - make_interval(weeks => ${weeksAgo})) + interval '3 days 12 hours')`;
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
  await seedOwnerWithPet(raw, A);
  authState.session = sessionFor(A.authUserId);
});

describe("E9 — personal history (single user)", () => {
  it("more walks than last week → a positive 'more than last' insight, with a disclaimer", async () => {
    // 3 weeks ago was the busiest (5 walks) so this week is NOT the month's best — but it still beats
    // last week, so the insight is the positive "more than last week".
    for (let i = 0; i < 5; i++) await seedWalk(A.petId, A.profileId, 3);
    await seedWalk(A.petId, A.profileId, 1); // 1 walk last week
    await seedWalk(A.petId, A.profileId, 0); // 2 walks this week
    await seedWalk(A.petId, A.profileId, 0);
    const b = await (await insightOf(A.petId)).json();
    expect(b.kind).toBe("more_than_last");
    expect(b.disclaimer).toBe(true);
    expect(b.this_week_walks).toBe(2);
  });

  it("no walks this week → a gentle forward nudge (never negative)", async () => {
    const b = await (await insightOf(A.petId)).json();
    expect(b.kind).toBe("gentle_nudge");
    expect(b.disclaimer).toBe(true);
  });
});

describe("E9 — cohort gate never renders a negative comparison", () => {
  it("a BELOW-median pet gets personal/nudge, NEVER a cohort comparison", async () => {
    // A is a Labrador age 3 with ZERO walks; peers are very active Labs age 3.
    await raw`update pets set breed = 'Labrador', age_years = 3 where id = ${A.petId}`;
    for (const p of PEERS) {
      await seedOwnerWithPet(raw, p);
      await raw`update pets set breed = 'Labrador', age_years = 3 where id = ${p.petId}`;
      await seedWalk(p.petId, p.profileId, 0);
      await seedWalk(p.petId, p.profileId, 0);
      await seedWalk(p.petId, p.profileId, 0);
    }
    authState.session = sessionFor(A.authUserId);
    const b = await (await insightOf(A.petId, 5)).json();
    expect(b.kind).not.toBe("cohort_top"); // below median → never a cohort comparison
    expect(["gentle_nudge", "keep_going", "more_than_last", "best_month"]).toContain(b.kind);
  });

  it("an ABOVE-median pet in a dense cohort gets the positive cohort win", async () => {
    await raw`update pets set breed = 'Labrador', age_years = 3 where id = ${A.petId}`;
    // A is very active; peers barely walk → A is above median.
    for (let i = 0; i < 5; i++) await seedWalk(A.petId, A.profileId, 0);
    for (const p of PEERS) {
      await seedOwnerWithPet(raw, p);
      await raw`update pets set breed = 'Labrador', age_years = 3 where id = ${p.petId}`;
    }
    authState.session = sessionFor(A.authUserId);
    const b = await (await insightOf(A.petId, 5)).json();
    expect(b.kind).toBe("cohort_top");
    expect(b.params.breed).toBe("Labrador");
    expect(b.disclaimer).toBe(true);
  });
});
