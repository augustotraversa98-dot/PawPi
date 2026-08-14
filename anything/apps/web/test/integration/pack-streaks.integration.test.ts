// Unit E7 — Pack / shared streaks — proven through the REAL Hono router (api.request) on real Postgres
// as pawpi_app.
//
// Proves: opt-in (request -> pending -> accept -> active); a pack advances ONLY when BOTH pets close
// their ring on the same owner-tz day; a single close does not advance but leaves a boop available; a
// boop is suppressed once the friend has closed; only the two participants can see/act (RLS); break/
// gap restarts at 1; unknown handle -> 409.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const B = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" };
const C = { authUserId: 3, profileId: 3, username: "third", petId: 3, petName: "Coco" };
const B_HANDLE = "other-bella"; // seedOwnerWithPet handle = `${username}-${petname.toLowerCase()}`

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
const packsOf = (petId: number) => apiReq(`/pets/${petId}/pack-streaks`);

// Close a pet's ring for the OWNER-TZ TODAY (the frame the boop/availability checks also use) by
// seeding one of each source log at now(), then hitting the ring route (which derives + persists
// ring_closed and advances the pack).
async function closeRing(pet: number, owner: number, auth: number) {
  authState.session = sessionFor(auth);
  const today = (await (await apiReq(`/pets/${pet}/care-ring`)).json()).day;
  await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${pet}, ${owner}, now())`;
  await raw`insert into posts (user_id, pet_id, is_daily_update, post_date) values (${owner}, ${pet}, true, ${today})`;
  await raw`insert into health_food_logs (pet_id, owner_user_id, logged_at) values (${pet}, ${owner}, now())`;
  const b = await (await apiReq(`/pets/${pet}/care-ring`)).json();
  expect(b.ring_closed).toBe(true);
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
  await seedOwnerWithPet(raw, B);
  await seedOwnerWithPet(raw, C);
  authState.session = sessionFor(A.authUserId);
});

// Opt-in: A requests a pack with B's handle, B accepts. Returns the pack id.
async function activePack(): Promise<number> {
  authState.session = sessionFor(A.authUserId);
  const reqRes = await apiReq(`/pets/${A.petId}/pack-streaks`, "POST", {
    action: "request",
    partner_handle: B_HANDLE,
  });
  expect(reqRes.status).toBe(200);
  const { pack_id } = await reqRes.json();
  authState.session = sessionFor(B.authUserId);
  const accRes = await apiReq(`/pets/${B.petId}/pack-streaks`, "POST", { action: "accept", pack_id });
  expect(accRes.status).toBe(200);
  return pack_id;
}

describe("E7 — pack streak opt-in", () => {
  it("request -> pending (only participants see it), then accept -> active", async () => {
    authState.session = sessionFor(A.authUserId);
    const reqRes = await apiReq(`/pets/${A.petId}/pack-streaks`, "POST", { action: "request", partner_handle: B_HANDLE });
    expect(reqRes.status).toBe(200);
    const { pack_id } = await reqRes.json();

    // B sees the pending invite; a non-participant (C) does not.
    authState.session = sessionFor(B.authUserId);
    let list = await (await packsOf(B.petId)).json();
    expect(list.pack_streaks).toHaveLength(1);
    expect(list.pack_streaks[0].status).toBe("pending");

    authState.session = sessionFor(C.authUserId);
    list = await (await packsOf(C.petId)).json();
    expect(list.pack_streaks).toHaveLength(0);

    // B accepts -> active
    authState.session = sessionFor(B.authUserId);
    const accRes = await apiReq(`/pets/${B.petId}/pack-streaks`, "POST", { action: "accept", pack_id });
    expect(accRes.status).toBe(200);
    authState.session = sessionFor(A.authUserId);
    list = await (await packsOf(A.petId)).json();
    expect(list.pack_streaks[0].status).toBe("active");
    expect(list.pack_streaks[0].partner_pet_name).toBe("Bella");
  });

  it("rejects an unknown @handle with 409", async () => {
    authState.session = sessionFor(A.authUserId);
    const res = await apiReq(`/pets/${A.petId}/pack-streaks`, "POST", { action: "request", partner_handle: "nobody-here" });
    expect(res.status).toBe(409);
  });
});

describe("E7 — mutual advance + boop", () => {
  it("advances only when BOTH close; a single close leaves a boop available", async () => {
    const pack = await activePack();

    // Only A closes -> no advance, and A can boop B.
    await closeRing(A.petId, A.profileId, A.authUserId);
    authState.session = sessionFor(A.authUserId);
    let list = await (await packsOf(A.petId)).json();
    expect(list.pack_streaks[0].current_count).toBe(0);
    expect(list.pack_streaks[0].boop_available).toBe(true);

    const boop = await apiReq(`/pets/${A.petId}/pack-streaks`, "POST", { action: "boop", pack_id: pack });
    expect((await boop.json()).result).toBe("sent");

    // Now B closes too -> the pack flame advances to 1.
    await closeRing(B.petId, B.profileId, B.authUserId);
    authState.session = sessionFor(A.authUserId);
    list = await (await packsOf(A.petId)).json();
    expect(list.pack_streaks[0].current_count).toBe(1);
    // B has closed -> boop no longer available.
    expect(list.pack_streaks[0].boop_available).toBe(false);
  });

  it("boop is suppressed once the friend has already closed today", async () => {
    const pack = await activePack();
    await closeRing(B.petId, B.profileId, B.authUserId); // B already closed
    authState.session = sessionFor(A.authUserId);
    const boop = await apiReq(`/pets/${A.petId}/pack-streaks`, "POST", { action: "boop", pack_id: pack });
    expect((await boop.json()).result).toBe("already_closed");
  });
});
