// The birthday sent with feed posts: month and day only, never the pet's birth year, through the REAL
// router on real Postgres as pawpi_app. Reading the feed creates no notification.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const VIEWER = { authUserId: 1, profileId: 1, username: "viewer", petId: 1, petName: "Rex" };
const LEAP = { authUserId: 2, profileId: 2, username: "leap", petId: 2, petName: "Bella" };
const NONE = { authUserId: 3, profileId: 3, username: "none", petId: 3, petName: "Coco" };

let raw: Sql;
let api: any;

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => {
  await raw.end();
});
beforeEach(async () => {
  for (const u of [VIEWER, LEAP, NONE]) await seedOwnerWithPet(raw, u);
  await raw`update pets set birthday = '2019-12-31' where id = ${VIEWER.petId}`;
  await raw`update pets set birthday = '2020-02-29' where id = ${LEAP.petId}`;
  await raw`insert into pet_follows (follower_pet_id, followed_pet_id) values (${VIEWER.petId}, ${LEAP.petId})`;
  await raw`insert into posts (user_id, pet_id, image_url) values
    (${VIEWER.profileId}, ${VIEWER.petId}, 'a.jpg'),
    (${LEAP.profileId}, ${LEAP.petId}, 'b.jpg'),
    (${NONE.profileId}, ${NONE.petId}, 'c.jpg')`;
  authState.session = { user: { id: VIEWER.authUserId } };
});
afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

const feed = async (qs: string) => {
  const res = await api.request(`/posts${qs}`);
  expect(res.status).toBe(200);
  const text = await res.text();
  const byPet = Object.fromEntries(JSON.parse(text).posts.map((p: any) => [p.pet_id, p]));
  return { text, byPet };
};

describe("feed posts and birthdays", () => {
  it.each([
    ["scoped to the viewer's dog (following + suggested)", `?viewerPetId=${VIEWER.petId}`],
    ["without an active dog", ""],
  ])("sends month-day only, %s", async (_label, qs) => {
    const { text, byPet } = await feed(qs);
    expect(byPet[VIEWER.petId]).toMatchObject({ pet_birthday_md: "12-31", pet_birthday: "9996-12-31" });
    expect(byPet[LEAP.petId]).toMatchObject({ pet_birthday_md: "02-29", pet_birthday: "9996-02-29" });
    expect(byPet[NONE.petId]).toMatchObject({ pet_birthday_md: null, pet_birthday: null });
    expect(text).not.toContain("2019-12-31");
    expect(text).not.toContain("2020-02-29");
  });

  it("a newly created post carries the same two fields", async () => {
    const res = await api.request("/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pet_id: VIEWER.petId, image_url: "d.jpg" }),
    });
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(JSON.parse(text).post).toMatchObject({ pet_birthday_md: "12-31", pet_birthday: "9996-12-31" });
    expect(text).not.toContain("2019-12-31");
  });

  it("reading a feed with a birthday dog creates no notification", async () => {
    await raw`update pets set birthday = (now() at time zone 'UTC')::date where id = ${LEAP.petId}`;
    await feed(`?viewerPetId=${VIEWER.petId}`);
    expect(await raw`select 1 from notifications`).toHaveLength(0);
  });
});
