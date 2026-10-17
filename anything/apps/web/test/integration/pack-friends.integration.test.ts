// Night run #2 PR C — "Streak with a friend" picker + server-side friend authorization, through the
// REAL Hono router on real Postgres as pawpi_app (FORCE RLS).
//
// Friends = accepted pet_friendship OR mutual follow. Proves: the picker lists only friends (never
// strangers / one-way follows / own dogs / blocked owners / dogs without a handle), search by pet
// name, @handle and owner name, no e-mail anywhere; POST request is authorized server-side (typed
// handle or picked id), rejects self / non-friend / blocked, duplicates (409), and a notification
// lands for the RIGHT recipient only.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const B = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" }; // mutual follow
const C = { authUserId: 3, profileId: 3, username: "third", petId: 3, petName: "Coco" }; // stranger
const D = { authUserId: 4, profileId: 4, username: "fourth", petId: 4, petName: "Daisy" }; // one-way follow only
const E = { authUserId: 5, profileId: 5, username: "fifth", petId: 5, petName: "Echo" }; // accepted friendship
const F = { authUserId: 6, profileId: 6, username: "sixth", petId: 6, petName: "Fido" }; // mutual but blocked

let raw: Sql;
let api: any;
const as = (u: { authUserId: number }) => {
  authState.session = { user: { id: u.authUserId } };
};
function apiReq(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
const friendsOf = async (petId: number, q = "") =>
  (await (await apiReq(`/pets/${petId}/pack-friends${q ? `?q=${encodeURIComponent(q)}` : ""}`)).json()).friends;

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
afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  for (const u of [A, B, C, D, E, F]) await seedOwnerWithPet(raw, u);
  await raw`update user_profiles set full_name = 'Beatriz Gomez' where id = ${B.profileId}`;
  await raw`update user_profiles set full_name = 'Fernando Paz' where id = ${F.profileId}`;
  // mutual follows: A<->B, A<->F; one-way: A->D; accepted friendship: A-E
  await raw`insert into pet_follows (follower_pet_id, followed_pet_id) values
    (${A.petId}, ${B.petId}), (${B.petId}, ${A.petId}),
    (${A.petId}, ${F.petId}), (${F.petId}, ${A.petId}),
    (${A.petId}, ${D.petId})`;
  await raw`insert into pet_friendships (requester_user_id, receiver_user_id, requester_pet_id, receiver_pet_id, status)
    values (${E.profileId}, ${A.profileId}, ${E.petId}, ${A.petId}, 'accepted')`;
  as(A);
});

describe("pack-friends picker", () => {
  it("lists only FRIENDS (mutual follow or accepted friendship) with public fields", async () => {
    const list = await friendsOf(A.petId);
    expect(list.map((f: any) => f.name).sort()).toEqual(["Bella", "Echo", "Fido"]);
    for (const f of list) {
      expect(Object.keys(f).sort()).toEqual(["avatar_url", "handle", "id", "name", "owner_name", "pack_status"]);
      expect(JSON.stringify(f)).not.toMatch(/@example\.com/);
    }
    // stranger (Coco), one-way follow (Daisy) and the caller's own dog are absent
    expect(list.find((f: any) => f.id === C.petId)).toBeUndefined();
    expect(list.find((f: any) => f.id === D.petId)).toBeUndefined();
    expect(list.find((f: any) => f.id === A.petId)).toBeUndefined();
  });

  it("matches by pet name, @handle and OWNER name (case-insensitive); % and _ are literal", async () => {
    expect((await friendsOf(A.petId, "bel")).map((f: any) => f.name)).toEqual(["Bella"]);
    expect((await friendsOf(A.petId, "SIXTH-fido")).map((f: any) => f.name)).toEqual(["Fido"]);
    expect((await friendsOf(A.petId, "beatriz")).map((f: any) => f.name)).toEqual(["Bella"]);
    expect(await friendsOf(A.petId, "%")).toEqual([]);
    expect(await friendsOf(A.petId, "zzz")).toEqual([]);
  });

  it("a block in either direction removes the dog from the list", async () => {
    await raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${F.profileId}, ${A.profileId})`;
    expect((await friendsOf(A.petId)).map((f: any) => f.name).sort()).toEqual(["Bella", "Echo"]);
  });

  it("only the pet's owner can open its picker", async () => {
    as(C);
    expect((await apiReq(`/pets/${A.petId}/pack-friends`)).status).toBe(404);
    authState.session = null;
    expect((await apiReq(`/pets/${A.petId}/pack-friends`)).status).toBe(401);
  });

  it("marks dogs that already have a pack with this pet", async () => {
    const r = await apiReq(`/pets/${A.petId}/pack-streaks`, "POST", { action: "request", partner_pet_id: B.petId });
    expect(r.status).toBe(200);
    const list = await friendsOf(A.petId);
    expect(list.find((f: any) => f.id === B.petId).pack_status).toBe("pending");
    expect(list.find((f: any) => f.id === E.petId).pack_status).toBe("none");
  });
});

describe("pack-streaks request — server-side authorization", () => {
  const request = (body: any, from = A) => {
    as(from);
    return apiReq(`/pets/${from.petId}/pack-streaks`, "POST", { action: "request", ...body });
  };

  it("a picked friend id works and notifies ONLY the friend's owner", async () => {
    const res = await request({ partner_pet_id: B.petId });
    expect(res.status).toBe(200);
    const notes = await raw`select recipient_user_id, actor_user_id, type from notifications where type = 'pack_invite'`;
    expect(notes).toHaveLength(1);
    expect(Number(notes[0].recipient_user_id)).toBe(B.profileId);
    expect(Number(notes[0].actor_user_id)).toBe(A.profileId);
  });

  it("an accepted-friendship friend works too", async () => {
    expect((await request({ partner_pet_id: E.petId })).status).toBe(200);
  });

  it("a typed @handle of a friend still works (older builds), case-insensitively", async () => {
    expect((await request({ partner_handle: "@OTHER-Bella" })).status).toBe(200);
  });

  it("rejects a stranger, a one-way follow and a blocked owner with 403 not_a_friend (and creates nothing)", async () => {
    await raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${A.profileId}, ${F.profileId})`;
    for (const body of [
      { partner_pet_id: C.petId },
      { partner_pet_id: D.petId },
      { partner_pet_id: F.petId },
      { partner_handle: "third-coco" },
    ]) {
      const res = await request(body);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("not_a_friend");
    }
    expect(await raw`select 1 from pet_pack_streaks`).toHaveLength(0);
    expect(await raw`select 1 from notifications where type = 'pack_invite'`).toHaveLength(0);
  });

  it("rejects self (400) and a missing partner (400)", async () => {
    expect((await request({ partner_pet_id: A.petId })).status).toBe(400);
    expect((await request({})).status).toBe(400);
  });

  it("a duplicate (even from the other side) is a friendly 409 already_exists — no second row, no second notification", async () => {
    expect((await request({ partner_pet_id: B.petId })).status).toBe(200);
    const again = await request({ partner_pet_id: B.petId });
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("already_exists");
    const reverse = await request({ partner_pet_id: A.petId }, B);
    expect(reverse.status).toBe(409);
    expect(await raw`select 1 from pet_pack_streaks`).toHaveLength(1);
    expect(await raw`select 1 from notifications where type = 'pack_invite'`).toHaveLength(1);
  });

  it("the caller must own the requesting pet (cannot start a pack for someone else's dog)", async () => {
    as(C);
    const res = await apiReq(`/pets/${A.petId}/pack-streaks`, "POST", { action: "request", partner_pet_id: B.petId });
    expect(res.status).toBe(404);
  });

  it("pack invites are rate limited (flow audit F2-11): the 11th attempt in an hour is a 429", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request({ partner_pet_id: B.petId })).status;
    expect(last).toBe(429);
  });
});
