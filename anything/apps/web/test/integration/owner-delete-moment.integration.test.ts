// Migration 0145: the dog's OWNER may delete any daily moment of that dog; members delete only their own; nobody but the
// author edits. Real router, real Postgres as pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";
import { MIGRATIONS_DIR } from "./migrate";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const FAMILY = { authUserId: 2, profileId: 2, username: "family" };
const CARE = { authUserId: 3, profileId: 3, username: "care" };
const STRANGER = { authUserId: 4, profileId: 4, username: "stranger", petId: 2, petName: "Duke" };

let raw: Sql;
let api: any;
const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const del = async (u: { authUserId: number }, id: number) => {
  as(u);
  return (await api.request(`/posts/${id}`, { method: "DELETE" })).status;
};
const ids = async () => (await raw`select id from posts order by id`).map((p) => p.id);
const post = (id: number, u: { profileId: number }, daily = true, day = "2026-11-20") => raw`
  insert into posts (id, user_id, pet_id, image_url, caption, is_daily_update, post_date)
  values (${id}, ${u.profileId}, ${OWNER.petId}, 'https://cdn.example/p.jpg', 'c', ${daily}, ${day})`;

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
  for (const u of [OWNER, STRANGER]) await seedOwnerWithPet(raw, u);
  for (const u of [FAMILY, CARE]) await seedUser(raw, u);
  await seedPetCaregiver(raw, { id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await seedPetCaregiver(raw, { id: 2, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId, role: "caregiver" });
  await post(100, OWNER);
  await post(101, FAMILY);
  await post(102, FAMILY, false, "2026-11-19"); // not a daily moment
});

describe("deleting a moment", () => {
  it("the dog's owner deletes a member's daily moment (with its paws)", async () => {
    await raw`insert into post_paws (post_id, user_id) values (101, ${CARE.profileId})`;
    expect(await del(OWNER, 101)).toBe(200);
    expect(await ids()).toEqual([100, 102]);
  });

  it("members, caregivers and strangers cannot delete someone else's", async () => {
    for (const u of [FAMILY, CARE, STRANGER]) expect(await del(u, 100), u.username).toBe(404);
    for (const u of [CARE, STRANGER]) expect(await del(u, 101), u.username).toBe(404);
    expect(await ids()).toEqual([100, 101, 102]);
  });

  it("the author still deletes their own; the owner's right does not cover non-daily posts", async () => {
    expect(await del(OWNER, 102)).toBe(404);
    expect(await del(FAMILY, 101)).toBe(200);
    expect(await del(FAMILY, 102)).toBe(200);
  });

  it("the owner cannot EDIT a member's moment", async () => {
    as(OWNER);
    const res = await api.request("/posts/101", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ caption: "x" }) });
    expect(res.status).toBe(404);
    expect((await raw`select caption from posts where id = 101`)[0].caption).toBe("c");
  });
});

describe("migration", () => {
  const file = () => readFileSync(join(MIGRATIONS_DIR, "0145_owner_delete_moment.sql"), "utf8");

  it("is idempotent and verify_0145.sql reads PASS on every row", async () => {
    await raw.unsafe(file());
    const rows = await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0145.sql"), "utf8"));
    expect(rows.length).toBe(5);
    expect(rows.filter((r: any) => r.status !== "PASS")).toEqual([]);
  });

  it("without it, only the author can delete (the old behaviour)", async () => {
    await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "rollback_0145.sql"), "utf8"));
    try {
      expect(await del(OWNER, 101)).toBe(404);
      expect(await del(FAMILY, 101)).toBe(200);
    } finally {
      await raw.unsafe(file());
    }
  });
});
