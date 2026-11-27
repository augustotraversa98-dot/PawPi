// A family member follows and unfollows other pets AS the dog they share (migration 0161). Proven through the REAL Hono router, on real
// Postgres as pawpi_app, with the dog's OWNER, a FAMILY member who owns no dog, a CAREGIVER, an OUTSIDER, and a REVOKED, an EXPIRED and a
// PENDING member. Only owner and family may; a block of the dog's owner OR of the member stops it; without 0161 the server refuses honestly.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedFollow, seedOwnerWithPet, seedPetCaregiver, seedUser } from "./db";
import { MIGRATIONS_DIR } from "./migrate";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const FAMILY = { authUserId: 2, profileId: 2, username: "family" };
const CARE = { authUserId: 3, profileId: 3, username: "care" };
const TARGET = { authUserId: 4, profileId: 4, username: "target", petId: 2, petName: "Duke" };
const REVOKED = { authUserId: 5, profileId: 5, username: "revoked" };
const EXPIRED = { authUserId: 6, profileId: 6, username: "expired" };
const PENDING = { authUserId: 7, profileId: 7, username: "pending" };
const OUTSIDER = { authUserId: 8, profileId: 8, username: "outsider", petId: 3, petName: "Milo" };
const ALLOWED = [OWNER, FAMILY];
const DENIED = [CARE, REVOKED, EXPIRED, PENDING, OUTSIDER];

let raw: Sql;
let app: Sql;
let api: any;

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const toggle = (method: "POST" | "DELETE", followerPetId = OWNER.petId, followedPetId = TARGET.petId) =>
  api.request(`/pets/${followedPetId}/follow`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ followerPetId }),
  });
const follows = async () =>
  (await raw`select follower_pet_id, followed_pet_id from pet_follows order by id`).map((r) => [r.follower_pet_id, r.followed_pet_id]);
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}
const block = (blocker: { profileId: number }, blocked: { profileId: number }) =>
  raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${blocker.profileId}, ${blocked.profileId})`;
const migration = () => readFileSync(join(MIGRATIONS_DIR, "0161_family_follows.sql"), "utf8");
const verify = async () => (await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0161.sql"), "utf8"))) as any[];

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  app = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""), username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {} });
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  for (const u of [OWNER, TARGET, OUTSIDER]) await seedOwnerWithPet(raw, u);
  for (const u of [FAMILY, CARE, REVOKED, EXPIRED, PENDING]) await seedUser(raw, u);
  const grant = (id: number, u: { profileId: number }, role: "family" | "caregiver", extra: object = {}) =>
    seedPetCaregiver(raw, { id, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: u.profileId, role, ...extra });
  await grant(1, FAMILY, "family");
  await grant(2, CARE, "caregiver");
  await grant(3, REVOKED, "family", { status: "revoked" });
  await grant(4, EXPIRED, "family", { expiresAt: "2000-01-01T00:00:00Z" });
  await grant(5, PENDING, "family", { status: "pending" });
});

describe("following as a dog — through the router", () => {
  it("OWNER and FAMILY follow and unfollow", async () => {
    for (const u of ALLOWED) {
      as(u);
      const followed = await toggle("POST");
      expect(followed.status, u.username).toBe(200);
      expect(await followed.json()).toEqual({ following: true, followersCount: 1 });
      expect(await follows()).toEqual([[OWNER.petId, TARGET.petId]]);
      const unfollowed = await toggle("DELETE");
      expect(unfollowed.status, u.username).toBe(200);
      expect(await unfollowed.json()).toEqual({ following: false, followersCount: 0 });
      expect(await follows()).toEqual([]);
    }
  });

  it("a family follow notifies the followed pet's owner, with the member as the actor", async () => {
    as(FAMILY);
    await toggle("POST");
    const rows = await raw`select recipient_user_id, actor_user_id from notifications where type = 'follow'`;
    expect(rows).toEqual([{ recipient_user_id: TARGET.profileId, actor_user_id: FAMILY.profileId }]);
  });

  it("caregiver, revoked, expired, pending and outsider can neither follow nor unfollow for that dog", async () => {
    for (const u of DENIED) {
      as(u);
      const res = await toggle("POST");
      expect(res.status, u.username).toBe(403);
      expect((await res.json()).code).toBe("follow_not_allowed");
    }
    expect(await follows()).toEqual([]);
    await seedFollow(raw, { followerPetId: OWNER.petId, followedPetId: TARGET.petId });
    for (const u of DENIED) {
      as(u);
      expect((await toggle("DELETE")).status, u.username).toBe(403);
    }
    expect(await follows()).toEqual([[OWNER.petId, TARGET.petId]]);
  });

  it("family of one dog cannot act for a dog they are not family of", async () => {
    as(FAMILY);
    expect((await toggle("POST", OUTSIDER.petId, TARGET.petId)).status).toBe(403);
    expect(await follows()).toEqual([]);
  });

  it("a block of the DOG'S OWNER stops a family follow, in either direction", async () => {
    for (const [a, b] of [[OWNER, TARGET], [TARGET, OWNER]]) {
      await block(a, b);
      as(FAMILY);
      expect((await toggle("POST")).status).toBe(403);
      expect(await follows()).toEqual([]);
      await raw`delete from user_blocks`;
    }
  });

  it("a block of the MEMBER stops it too", async () => {
    await block(TARGET, FAMILY);
    as(FAMILY);
    expect((await toggle("POST")).status).toBe(403);
    expect(await follows()).toEqual([]);
  });
});

describe("following as a dog — database rules", () => {
  const insert = (u: { profileId: number }) =>
    asApp(u.profileId, (tx) => tx`insert into pet_follows (follower_pet_id, followed_pet_id) values (${OWNER.petId}, ${TARGET.petId}) returning id`);

  it("family inserts and deletes directly; the others are refused", async () => {
    for (const u of DENIED) await expect(insert(u), u.username).rejects.toThrow(/row-level security/);
    await expect(asApp(null, (tx) => tx`insert into pet_follows (follower_pet_id, followed_pet_id) values (${OWNER.petId}, ${TARGET.petId})`)).rejects.toThrow(/row-level security/);
    expect(await insert(FAMILY)).toHaveLength(1);
    for (const u of DENIED) {
      expect(await asApp(u.profileId, (tx) => tx`delete from pet_follows returning id`), u.username).toHaveLength(0);
    }
    expect(await asApp(FAMILY.profileId, (tx) => tx`delete from pet_follows returning id`)).toHaveLength(1);
  });

  it("family gets no right to rewrite a follow", async () => {
    await seedFollow(raw, { followerPetId: OWNER.petId, followedPetId: TARGET.petId });
    const rows = await asApp(FAMILY.profileId, (tx) => tx`update pet_follows set followed_pet_id = ${OUTSIDER.petId} returning id`);
    expect(rows).toHaveLength(0);
  });

  it("verify_0161 passes, and the migration is safe to run again", async () => {
    await raw.unsafe(migration());
    const rows = await verify();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.status !== "PASS")).toEqual([]);
  });
});

describe("before 0161 is applied", () => {
  beforeEach(async () => {
    await raw.unsafe("drop policy if exists pet_follows_family_insert on pet_follows; drop policy if exists pet_follows_family_delete on pet_follows");
  });
  afterEach(async () => { await raw.unsafe(migration()); });

  it("family is refused with a code (never a 500, never a false 'unfollowed'); the owner is unaffected", async () => {
    as(FAMILY);
    const res = await toggle("POST");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("follow_not_allowed");
    await seedFollow(raw, { followerPetId: OWNER.petId, followedPetId: TARGET.petId });
    expect((await toggle("DELETE")).status).toBe(403);
    expect(await follows()).toEqual([[OWNER.petId, TARGET.petId]]);
    as(OWNER);
    expect((await toggle("DELETE")).status).toBe(200);
    expect(await follows()).toEqual([]);
  });
});
