// GET /api/posts/today-daily-update?pet_id= for the people of a SHARED dog (night run #7, item 3). The route used to be owner-only, so every
// family member and caregiver got a 403 on each Feed open / focus / retry. Real Hono router + real Postgres as pawpi_app.
//
// The rule is the same one the other shared-dog routes use (owner, else an ACTIVE unexpired grant: resolvePetLogOwner / app_user_has_pet_access).
// What a grantee gets back is deliberately narrower than what the owner gets: only THEIR OWN moment of today (or null).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Olivia", petId: 1, petName: "Rex" };
const FAMILY = { authUserId: 2, profileId: 2, username: "family", fullName: "Fran" };
const CARER = { authUserId: 3, profileId: 3, username: "carer", fullName: "Cris" };
const OUTSIDER = { authUserId: 4, profileId: 4, username: "outsider", fullName: "Otto", petId: 2, petName: "Duke" };
const LEFT = { authUserId: 5, profileId: 5, username: "left", fullName: "Lena" };
const EXPIRED = { authUserId: 6, profileId: 6, username: "expired", fullName: "Eva" };
const PET = OWNER.petId;

let raw: Sql;
let api: any;
const as = (u: { authUserId: number } | null) => { authState.session = u ? { user: { id: u.authUserId } } : null; };
const ask = (petId: number | string = PET) => api.request(`/posts/today-daily-update?pet_id=${petId}`);
const today = async () => (await raw`select (now() at time zone 'America/Buenos_Aires')::date::text as d`)[0].d as string;
const moment = async (userId: number, caption: string, petId = PET) => {
  const d = await today();
  await raw`insert into posts (user_id, pet_id, caption, image_url, is_daily_update, post_date) values (${userId}, ${petId}, ${caption}, ${caption + ".png"}, true, ${d})`;
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
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OUTSIDER);
  for (const u of [FAMILY, CARER, LEFT, EXPIRED]) await seedUser(raw, u);
  await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await seedPetCaregiver(raw, { id: 2, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: CARER.profileId, role: "caregiver" });
  await seedPetCaregiver(raw, { id: 3, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: LEFT.profileId, role: "family", status: "revoked" });
  await seedPetCaregiver(raw, { id: 4, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: EXPIRED.profileId, role: "family", expiresAt: "2000-01-01T00:00:00Z" });
});

describe("GET /posts/today-daily-update?pet_id= on a shared dog", () => {
  it("the OWNER: unchanged - the latest moment of the dog today, whoever posted it", async () => {
    await moment(OWNER.profileId, "owner-moment");
    await moment(FAMILY.profileId, "family-moment"); // posted later: the latest of the dog
    as(OWNER);
    const res = await ask();
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.hasPostedToday).toBe(true);
    expect(b.post.caption).toBe("family-moment");
    expect(b.todayDate).toBe(await today());
  });

  it("a FAMILY member: 200 (it was 403), and only THEIR OWN moment - not the owner's", async () => {
    await moment(OWNER.profileId, "owner-moment");
    as(FAMILY);
    const none = await ask();
    expect(none.status).toBe(200);
    expect(await none.json()).toMatchObject({ post: null, hasPostedToday: false });

    await moment(FAMILY.profileId, "family-moment");
    const mine = await (await ask()).json();
    expect(mine.hasPostedToday).toBe(true);
    expect(mine.post.caption).toBe("family-moment");
    expect(JSON.stringify(mine)).not.toContain("owner-moment");
  });

  it("a CAREGIVER (read + log only): 200 with nothing - they cannot post a moment, and the owner's is not handed to them", async () => {
    await moment(OWNER.profileId, "owner-moment");
    await moment(FAMILY.profileId, "family-moment");
    as(CARER);
    const res = await ask();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ post: null, hasPostedToday: false });
  });

  it("anyone else is still refused (403): an outsider, a member who LEFT / was revoked, an expired grant, a dog that does not exist", async () => {
    await moment(OWNER.profileId, "owner-moment");
    for (const u of [OUTSIDER, LEFT, EXPIRED]) {
      as(u);
      const res = await ask();
      expect(res.status, u.username).toBe(403);
      expect(JSON.stringify(await res.json())).not.toContain("owner-moment");
    }
    as(FAMILY);
    expect((await ask(99999)).status).toBe(403);
  });

  it("not signed in: 401", async () => {
    as(null);
    expect((await ask()).status).toBe(401);
  });

  it("a person's OWN dog is unchanged, and so is the call without pet_id (the first dog they own)", async () => {
    await moment(OUTSIDER.profileId, "duke-moment", OUTSIDER.petId);
    as(OUTSIDER);
    expect((await (await ask(OUTSIDER.petId)).json()).post.caption).toBe("duke-moment");
    expect((await (await api.request("/posts/today-daily-update")).json()).post.caption).toBe("duke-moment");
  });
});
