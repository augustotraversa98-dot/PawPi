// Unit E13 PR2 — multi-caregiver daily moment "day card" — proven through the REAL Hono router
// (api.request) on real Postgres as pawpi_app.
//
// Proves: a 'family' caregiver (E13 "Caregiver") can add their OWN daily moment for the shared pet, capped
// 1/author/day (a second is rejected) while the OWNER can still add theirs (2 moments, 2 authors that
// day); a 'caregiver' grant (E13 "Viewer") CANNOT post; the day-card groups the day's moments as
// attributed slides with day-card-level paw totals + a bump anchor; a non-caregiver is denied.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const CARE = { authUserId: 2, profileId: 2, username: "caregiver" };
const VIEWER = { authUserId: 3, profileId: 3, username: "viewer" };
const STRANGER = { authUserId: 4, profileId: 4, username: "stranger" };
const TODAY = new Date().toISOString().slice(0, 10); // the route caps against the real "today"

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
const postMoment = (petId: number, caption: string) =>
  apiReq(`/posts`, "POST", { pet_id: petId, image_url: `${caption}.png`, caption, is_daily_update: true });

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
  await seedUser(raw, VIEWER);
  await seedUser(raw, STRANGER);
  await seedPetCaregiver(raw, {
    id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId,
    role: "family", status: "active",
  });
  await seedPetCaregiver(raw, {
    id: 2, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: VIEWER.profileId,
    role: "caregiver", status: "active",
  });
});

describe("E13 PR2 — multi-caregiver daily moment", () => {
  it("a 'family' caregiver can post the daily moment for the shared pet", async () => {
    authState.session = sessionFor(CARE.authUserId);
    const res = await postMoment(OWNER.petId, "caregiver-moment");
    expect(res.status).toBe(201);
  });

  it("the cap is per-author: the same caregiver's second moment today is rejected, but the owner can add theirs", async () => {
    authState.session = sessionFor(CARE.authUserId);
    expect((await postMoment(OWNER.petId, "care-1")).status).toBe(201);
    expect((await postMoment(OWNER.petId, "care-2")).status).toBe(400); // per-author cap

    authState.session = sessionFor(OWNER.authUserId);
    expect((await postMoment(OWNER.petId, "owner-1")).status).toBe(201); // different author OK

    const rows = await raw`select count(*)::int as n from posts where pet_id = ${OWNER.petId} and is_daily_update = true and post_date = ${TODAY}`;
    expect(rows[0].n).toBe(2);
  });

  it("a 'caregiver' grant (Viewer) cannot post to the public profile (403)", async () => {
    authState.session = sessionFor(VIEWER.authUserId);
    expect((await postMoment(OWNER.petId, "viewer-try")).status).toBe(403);
  });

  it("the day card groups the day's moments as attributed slides + bump anchor", async () => {
    authState.session = sessionFor(OWNER.authUserId);
    await postMoment(OWNER.petId, "owner-slide");
    authState.session = sessionFor(CARE.authUserId);
    await postMoment(OWNER.petId, "care-slide");

    authState.session = sessionFor(OWNER.authUserId);
    const b = await (await apiReq(`/pets/${OWNER.petId}/day-card?day=${TODAY}`)).json();
    expect(b.slides.length).toBe(2);
    expect(b.author_count).toBe(2);
    const authors = b.slides.map((s: any) => s.author.username).sort();
    expect(authors).toEqual(["caregiver", "owner"]);
    expect(b.latest_contribution_at).toBeTruthy();
  });

  it("day-card-level paw total sums across slides", async () => {
    authState.session = sessionFor(OWNER.authUserId);
    await postMoment(OWNER.petId, "owner-slide");
    const [{ id: postId }] = await raw<{ id: number }[]>`select id from posts where pet_id=${OWNER.petId} and user_id=${OWNER.profileId} and is_daily_update=true limit 1`;
    await raw`insert into post_paws (post_id, user_id) values (${postId}, ${CARE.profileId})`;
    await raw`insert into post_paws (post_id, user_id) values (${postId}, ${VIEWER.profileId})`;
    const b = await (await apiReq(`/pets/${OWNER.petId}/day-card?day=${TODAY}`)).json();
    expect(b.paw_count).toBe(2);
  });

  it("a non-caregiver stranger cannot read the day card (404)", async () => {
    authState.session = sessionFor(STRANGER.authUserId);
    expect((await apiReq(`/pets/${OWNER.petId}/day-card?day=${TODAY}`)).status).toBe(404);
  });
});
