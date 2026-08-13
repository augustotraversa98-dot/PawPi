// Ticket C2 — broadcast "find a walker now", proven through the REAL Hono router (api.request) on
// real Postgres as pawpi_app, plus direct RLS proofs as pawpi_app.
//
// Proves: an owner posts a broadcast request (target_provider_id null + pickup) → it fans out ONLY to
// walkers that are live-available now (B1) AND within radius (a far walker, a not-accepting walker,
// and a non-walker are NOT notified); the broadcast read policy (0093) admits a WALKER's staff and
// rejects a non-walker's staff and a non-staff owner; the nearby (?scope=broadcast) list returns the
// request to an in-radius accepting walker and [] to a far walker; the first accept wins (409 after);
// non-integer ids → 404 before SQL.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const O = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const O2 = { authUserId: 2, profileId: 2, username: "owner2", petId: 2, petName: "Fido" };
const W = { authUserId: 3, profileId: 3, username: "walker" }; // WALKER — near + accepting
const W2 = { authUserId: 4, profileId: 4, username: "walker2" }; // WALKER2 — far + accepting
const W3 = { authUserId: 5, profileId: 5, username: "walker3" }; // WALKER3 — near + NOT accepting
const V = { authUserId: 6, profileId: 6, username: "vet" }; // VET — not a walker

const WALKER = 10;
const WALKER2 = 11;
const WALKER3 = 12;
const VET = 13;

// Pickup point (Buenos Aires); WALKER/WALKER3 sit ~a few hundred m away, WALKER2 ~50km away.
const PICKUP = { lat: -34.6037, lng: -58.3816 };
const NEAR = { lat: -34.605, lng: -58.383 };
const FAR = { lat: -34.9, lng: -58.9 };

let raw: Sql;
let app: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId == null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  });
}

async function seedLiveAvailability(
  providerId: number,
  accepting: boolean,
  lat: number,
  lng: number,
) {
  await raw`
    insert into provider_live_availability (provider_id, accepting, lat, lng, expires_at, updated_at)
    values (${providerId}, ${accepting}, ${lat}, ${lng}, now() + interval '8 hours', now())
  `;
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  app = postgres(url.toString(), { ssl: false });
  ({ api } = (await import("../../__create/route-builder")) as any);
});

afterAll(async () => {
  await raw.end();
  await app.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedOwnerWithPet(raw, O2);
  for (const u of [W, W2, W3, V]) await seedUser(raw, u);
  // Three walker providers + one vet provider.
  const walkers: [number, typeof W][] = [
    [WALKER, W],
    [WALKER2, W2],
    [WALKER3, W3],
  ];
  for (const [pid, u] of walkers) {
    await seedProvider(raw, { providerId: pid, ownerUserProfileId: u.profileId, slug: `walks-${pid}`, status: "published" });
    await seedStaff(raw, { providerId: pid, userProfileId: u.profileId, role: "owner", status: "active" });
    await seedCapability(raw, { providerId: pid, capability: "walker" });
  }
  await seedProvider(raw, { providerId: VET, ownerUserProfileId: V.profileId, slug: "the-vet", status: "published" });
  await seedStaff(raw, { providerId: VET, userProfileId: V.profileId, role: "owner", status: "active" });
  await seedCapability(raw, { providerId: VET, capability: "vet" });

  // Live availability: WALKER near+accepting, WALKER2 far+accepting, WALKER3 near+NOT accepting.
  await seedLiveAvailability(WALKER, true, NEAR.lat, NEAR.lng);
  await seedLiveAvailability(WALKER2, true, FAR.lat, FAR.lng);
  await seedLiveAvailability(WALKER3, false, NEAR.lat, NEAR.lng);
});

async function postBroadcast(radiusKm = 5) {
  authState.session = sessionFor(O.authUserId);
  return apiReq(`/walk-requests`, "POST", {
    pet_id: O.petId,
    target_provider_id: null,
    pickup_lat: PICKUP.lat,
    pickup_lng: PICKUP.lng,
    radius_km: radiusKm,
    when_type: "now",
    note: "Please walk Rex",
  });
}

describe("C2 — broadcast find a walker now", () => {
  it("404 (before SQL) for a non-integer provider id on the nearby list", async () => {
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/abc/walk-requests?scope=broadcast`);
    expect(res.status).toBe(404);
  });

  it("requires a pickup location for a broadcast request", async () => {
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq(`/walk-requests`, "POST", {
      pet_id: O.petId,
      target_provider_id: null,
      when_type: "now",
    });
    expect(res.status).toBe(400);
  });

  it("fans out ONLY to live-available, in-radius walkers", async () => {
    const res = await postBroadcast();
    expect(res.status).toBe(201);
    const { request } = await res.json();
    expect(request.target_provider_id).toBeNull();

    // WALKER (near + accepting + walker) is notified.
    const [{ c: near }] = await raw<{ c: number }[]>`
      select count(*)::int as c from notifications
      where recipient_user_id = ${W.profileId} and type = 'walk_request_broadcast'
    `;
    expect(near).toBe(1);
    // WALKER2 (far), WALKER3 (not accepting), VET (not a walker) are NOT notified.
    for (const u of [W2, W3, V]) {
      const [{ c }] = await raw<{ c: number }[]>`
        select count(*)::int as c from notifications where recipient_user_id = ${u.profileId}
      `;
      expect(c).toBe(0);
    }
  });

  it("RLS: a WALKER's staff can read the broadcast row; a non-walker's staff and a stranger cannot", async () => {
    const res = await postBroadcast();
    const { request } = await res.json();

    expect(await asApp(W.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(1); // walker staff
    expect(await asApp(W2.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(1); // also a walker (radius is API-scoped, not RLS)
    expect(await asApp(V.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(0); // vet, not a walker
    expect(await asApp(O2.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(0); // stranger owner
    expect(await asApp(null, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(0); // anon
    expect(await asApp(O.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(1); // the requester (owner_select)
  });

  it("the nearby list returns the broadcast to an in-radius accepting walker, and [] to a far one", async () => {
    await postBroadcast();

    authState.session = sessionFor(W.authUserId);
    const near = await apiReq(`/providers/${WALKER}/walk-requests?scope=broadcast`);
    const nearBody = await near.json();
    expect(nearBody.requests).toHaveLength(1);
    expect(nearBody.requests[0].distance_km).toBeLessThanOrEqual(5);

    authState.session = sessionFor(W2.authUserId);
    const far = await apiReq(`/providers/${WALKER2}/walk-requests?scope=broadcast`);
    expect((await far.json()).requests).toHaveLength(0); // out of radius

    authState.session = sessionFor(W3.authUserId);
    const notAccepting = await apiReq(`/providers/${WALKER3}/walk-requests?scope=broadcast`);
    expect((await notAccepting.json()).requests).toHaveLength(0); // not accepting now
  });

  it("first walker to accept a broadcast wins; a second accept is 409", async () => {
    const res = await postBroadcast();
    const { request } = await res.json();

    authState.session = sessionFor(W.authUserId);
    const first = await apiReq(`/providers/${WALKER}/walk-requests/${request.id}/accept`, "POST", {});
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.booking_id).toBeTruthy();

    // A different accepting walker is too late.
    authState.session = sessionFor(W2.authUserId);
    const second = await apiReq(`/providers/${WALKER2}/walk-requests/${request.id}/accept`, "POST", {});
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe("already_taken");

    // Exactly one walker booking, assigned to the winner.
    const [bk] = await raw<any[]>`select owner_user_id, staff_user_id, capability from vet_appointments where capability = 'walker'`;
    expect(bk.owner_user_id).toBe(O.profileId);
    expect(bk.staff_user_id).toBe(W.profileId);
  });

  it("a tiny radius excludes an otherwise-near walker from the fan-out", async () => {
    // 0.01 km ≈ 10 m — closer than WALKER's ~250 m, so nobody is notified.
    const res = await postBroadcast(0.01);
    expect(res.status).toBe(201);
    const [{ c }] = await raw<{ c: number }[]>`
      select count(*)::int as c from notifications where type = 'walk_request_broadcast'
    `;
    expect(c).toBe(0);
  });
});
