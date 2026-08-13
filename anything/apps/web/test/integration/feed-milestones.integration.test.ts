// Unit E3 — milestone moments in the feed — proven through the REAL Hono router on real Postgres.
//
// GET /api/feed/milestones returns, for the pets the viewer's active pet FOLLOWS, any whose birthday
// or gotcha/adoption anniversary falls on `day` (real dates only). Proves: birthday + gotcha are
// detected with the right type/years; a non-milestone followed pet is excluded; today_post_id links
// the pet's daily moment when present; the viewer can only read their OWN pet's follow graph (404).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const VIEWER = { authUserId: 1, profileId: 1, username: "viewer", petId: 1, petName: "Rex" };
const BDAY = { authUserId: 2, profileId: 2, username: "bday", petId: 2, petName: "Bella" };
const PLAIN = { authUserId: 3, profileId: 3, username: "plain", petId: 3, petName: "Coco" };
const GOTCHA = { authUserId: 4, profileId: 4, username: "gotcha", petId: 4, petName: "Milo" };
const DAY = "2026-08-13";

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
const req = (path: string) => api.request(path);

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
  await seedOwnerWithPet(raw, VIEWER);
  await seedOwnerWithPet(raw, BDAY);
  await seedOwnerWithPet(raw, PLAIN);
  await seedOwnerWithPet(raw, GOTCHA);
  await raw`update pets set birthday = '2020-08-13' where id = ${BDAY.petId}`;
  await raw`update pets set birthday = '2020-01-01' where id = ${PLAIN.petId}`;
  await raw`update pets set adoption_date = '2022-08-13' where id = ${GOTCHA.petId}`;
  // Viewer follows all three.
  for (const p of [BDAY, PLAIN, GOTCHA]) {
    await raw`insert into pet_follows (follower_pet_id, followed_pet_id) values (${VIEWER.petId}, ${p.petId})`;
  }
  authState.session = sessionFor(VIEWER.authUserId);
});

describe("E3 — followed milestones feed", () => {
  it("returns only followed pets with a real milestone today, typed with years", async () => {
    const b = await (await req(`/feed/milestones?viewerPetId=${VIEWER.petId}&day=${DAY}`)).json();
    const byId = Object.fromEntries(b.milestones.map((m: any) => [m.pet_id, m]));
    expect(Object.keys(byId).map(Number).sort()).toEqual([BDAY.petId, GOTCHA.petId]); // PLAIN excluded
    expect(byId[BDAY.petId]).toMatchObject({ type: "birthday", years: 6 });
    expect(byId[GOTCHA.petId]).toMatchObject({ type: "gotcha", years: 4 });
  });

  it("links today's daily moment via today_post_id when it exists (else null)", async () => {
    await raw`insert into posts (user_id, pet_id, is_daily_update, post_date) values (${GOTCHA.profileId}, ${GOTCHA.petId}, true, ${DAY})`;
    const b = await (await req(`/feed/milestones?viewerPetId=${VIEWER.petId}&day=${DAY}`)).json();
    const byId = Object.fromEntries(b.milestones.map((m: any) => [m.pet_id, m]));
    expect(byId[GOTCHA.petId].today_post_id).not.toBeNull();
    expect(byId[BDAY.petId].today_post_id).toBeNull();
  });

  it("nothing on a day with no milestones (no placeholder)", async () => {
    const b = await (await req(`/feed/milestones?viewerPetId=${VIEWER.petId}&day=2026-03-03`)).json();
    expect(b.milestones).toEqual([]);
  });

  it("the viewer can only read their OWN pet's follow graph (404 for someone else's pet)", async () => {
    const res = await req(`/feed/milestones?viewerPetId=${BDAY.petId}&day=${DAY}`); // not owned by viewer
    expect(res.status).toBe(404);
  });

  it("400 on a non-integer viewerPetId", async () => {
    expect((await req(`/feed/milestones?viewerPetId=abc&day=${DAY}`)).status).toBe(400);
  });
});
