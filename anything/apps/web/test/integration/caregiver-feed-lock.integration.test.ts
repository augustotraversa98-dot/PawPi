// The caregiver feed lock, end to end (night run #4, item 7). Real Hono router, real Postgres as pawpi_app.
//
// The rule ("household posted today", utils/dailyMomentsGate.js):
//   • other people's moments stay locked (media withheld) until someone in the viewer's HOUSEHOLD has a daily moment
//     today: a dog the viewer owns or holds an active grant on, whoever posted it, or a moment the viewer wrote;
//   • the household's own dog is never locked for its owner, family or caregiver;
//   • somebody else's dog posting today unlocks nothing.
// A caregiver cannot post a moment at all, so for them only the household can open the feed.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const FAMILY = { authUserId: 2, profileId: 2, username: "family" };
const CARE = { authUserId: 3, profileId: 3, username: "care" };
const STRANGER = { authUserId: 4, profileId: 4, username: "stranger", petId: 2, petName: "Duke" };
const THIRD = { authUserId: 5, profileId: 5, username: "third", petId: 3, petName: "Nala" };
const HOUSEHOLD = [OWNER, FAMILY, CARE];
const PET = OWNER.petId;

let raw: Sql;
let api: any;
let today: string;

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
const get = async (path: string) => (await req(path)).json();
const postedToday = async (u: { authUserId: number }) => {
  as(u);
  return (await get("/posts/owner-posted-today")).hasPostedToday;
};
/** A daily moment written straight into the table, `daysAgo` before the owner-local today. */
const seedMoment = (u: { profileId: number }, petId: number, url: string, daysAgo = 0) => raw`
  insert into posts (user_id, pet_id, image_url, caption, is_daily_update, post_date)
  values (${u.profileId}, ${petId}, ${url}, ${url}, true, ${today}::date - ${daysAgo}::int)`;
const feed = async (u: { authUserId: number }) => {
  as(u);
  return (await get(`/posts?viewerPetId=${PET}`)).posts as any[];
};
const byUrlOwner = (posts: any[], petId: number) => posts.find((p) => p.pet_id === petId);

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
  for (const u of [OWNER, STRANGER, THIRD]) await seedOwnerWithPet(raw, u);
  for (const u of [FAMILY, CARE]) await seedUser(raw, u);
  await raw`update user_profiles set timezone = 'UTC'`;
  today = (await raw`select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') d`)[0].d;
  await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await seedPetCaregiver(raw, { id: 2, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId, role: "caregiver" });
  await raw.unsafe(`select setval(pg_get_serial_sequence('posts', 'id'), 10000)`);
  await seedMoment(STRANGER, STRANGER.petId, "https://cdn.example/stranger.jpg");
});

describe("before the household posts", () => {
  it("the caregiver is locked: another dog's moment comes back without its media", async () => {
    expect(await postedToday(CARE)).toBe(false);
    const theirs = byUrlOwner(await feed(CARE), STRANGER.petId);
    expect(theirs).toMatchObject({ locked: true, image_url: null, caption: null });
    as(CARE);
    expect(await get(`/pets/${STRANGER.petId}/profile`)).toMatchObject({ momentsLocked: true, posts: [] });
    expect(await get(`/posts/history?petId=${STRANGER.petId}`)).toEqual({ posts: [], locked: true });
  });

  it("the caregiver cannot open it by posting: the server refuses a caregiver's moment", async () => {
    as(CARE);
    const res = await req("/posts", "POST", { pet_id: PET, image_url: "https://cdn.example/c.jpg", is_daily_update: true, post_date: today });
    expect(res.status).toBe(403);
    expect(await postedToday(CARE)).toBe(false);
  });

  it("a DIFFERENT dog's post does not unlock anyone in the household", async () => {
    await seedMoment(THIRD, THIRD.petId, "https://cdn.example/third.jpg");
    for (const u of HOUSEHOLD) expect(await postedToday(u), u.username).toBe(false);
  });

  it("yesterday's household moment does not count", async () => {
    await seedMoment(OWNER, PET, "https://cdn.example/yesterday.jpg", 1);
    for (const u of HOUSEHOLD) expect(await postedToday(u), u.username).toBe(false);
  });

  it("owner, family and caregiver are never locked out of THEIR dog (feed and profile)", async () => {
    await seedMoment(OWNER, PET, "https://cdn.example/yesterday.jpg", 1);
    for (const u of HOUSEHOLD) {
      const mine = byUrlOwner(await feed(u), PET);
      expect(mine.locked, u.username).toBeUndefined();
      expect(mine.image_url, u.username).toBe("https://cdn.example/yesterday.jpg");
      as(u);
      const profile = await get(`/pets/${PET}/profile`);
      expect(profile.momentsLocked, u.username).toBeFalsy();
      expect(profile.posts, u.username).toHaveLength(1);
    }
  });
});

describe("after the household posts", () => {
  const unlockedFor = async (u: (typeof HOUSEHOLD)[number]) => {
    expect(await postedToday(u), u.username).toBe(true);
    const theirs = byUrlOwner(await feed(u), STRANGER.petId);
    expect(theirs.locked, u.username).toBeUndefined();
    expect(theirs.image_url, u.username).toBe("https://cdn.example/stranger.jpg");
    as(u);
    expect((await get(`/pets/${STRANGER.petId}/profile`)).momentsLocked, u.username).toBe(false);
    expect((await get(`/posts/history?petId=${STRANGER.petId}`)).posts, u.username).toHaveLength(1);
  };

  it("the owner's moment opens the feed for the caregiver, the family and the owner", async () => {
    as(OWNER);
    expect((await req("/posts", "POST", { pet_id: PET, image_url: "https://cdn.example/o.jpg", is_daily_update: true, post_date: today })).status).toBe(201);
    for (const u of HOUSEHOLD) await unlockedFor(u);
  });

  it("a family member's moment does the same", async () => {
    as(FAMILY);
    expect((await req("/posts", "POST", { pet_id: PET, image_url: "https://cdn.example/f.jpg", is_daily_update: true, post_date: today })).status).toBe(201);
    for (const u of HOUSEHOLD) await unlockedFor(u);
  });

  it("the household's moment unlocks nobody outside it", async () => {
    await seedMoment(OWNER, PET, "https://cdn.example/o.jpg");
    await raw`delete from posts where pet_id = ${STRANGER.petId}`;
    await seedMoment(STRANGER, STRANGER.petId, "https://cdn.example/old.jpg", 1);
    expect(await postedToday(STRANGER)).toBe(false);
    expect(await postedToday(THIRD)).toBe(false);
  });

  it("removing the caregiver puts them outside again", async () => {
    await seedMoment(OWNER, PET, "https://cdn.example/o.jpg");
    expect(await postedToday(CARE)).toBe(true);
    await raw`update pet_caregivers set status = 'revoked' where id = 2`;
    expect(await postedToday(CARE)).toBe(false);
  });
});
