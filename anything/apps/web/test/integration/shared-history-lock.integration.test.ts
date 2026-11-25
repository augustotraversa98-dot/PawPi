// A household member is never locked out of the shared dog's photo history (GET /api/posts/history), also before anyone
// has posted today; everyone else still is. Found by the caregiver feed-lock tests (night run #4, item 7).

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
const REVOKED = { authUserId: 5, profileId: 5, username: "revoked" };

let raw: Sql;
let api: any;
const history = async (u: { authUserId: number }) => {
  authState.session = { user: { id: u.authUserId } };
  return (await api.request(`/posts/history?petId=${OWNER.petId}`)).json();
};

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
  for (const u of [FAMILY, CARE, REVOKED]) await seedUser(raw, u);
  const grant = (id: number, u: { profileId: number }, role: "family" | "caregiver", status: "active" | "revoked" = "active") =>
    seedPetCaregiver(raw, { id, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: u.profileId, role, status });
  await grant(1, FAMILY, "family");
  await grant(2, CARE, "caregiver");
  await grant(3, REVOKED, "family", "revoked");
  // Only an OLD moment: nobody has posted today.
  await raw`insert into posts (user_id, pet_id, image_url, is_daily_update, post_date)
            values (${OWNER.profileId}, ${OWNER.petId}, 'https://cdn.example/old.jpg', true, '2025-01-02')`;
});

describe("shared dog history before anyone posted today", () => {
  it("is open to the owner, family and caregiver", async () => {
    for (const u of [OWNER, FAMILY, CARE]) {
      const body = await history(u);
      expect(body.locked, u.username).toBeUndefined();
      expect(body.posts, u.username).toHaveLength(1);
    }
  });

  it("stays locked for a stranger and a removed member", async () => {
    for (const u of [STRANGER, REVOKED]) {
      expect(await history(u), u.username).toEqual({ posts: [], locked: true });
    }
  });
});
