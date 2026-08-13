// Ticket B5 — walker walk history read, proven through the REAL Hono router (api.request). The
// walker's own finished sessions are returned by GET /providers/:id/walk-sessions?status=finished,
// now additively carrying the pickup point (pickup_lat/lng + credit_pack_id from B3) + pet_name,
// participant-scoped (a walker sees ONLY their own sessions).

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
const W = { authUserId: 2, profileId: 2, username: "walker" };
const W2 = { authUserId: 3, profileId: 3, username: "walker2" }; // another walker of the same provider

const WALKER = 10;

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET") {
  return api.request(path, { method });
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

afterAll(async () => {
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, W);
  await seedUser(raw, W2);
  await seedProvider(raw, { providerId: WALKER, ownerUserProfileId: W.profileId, slug: "paw-walks", status: "published" });
  await seedStaff(raw, { providerId: WALKER, userProfileId: W.profileId, role: "owner", status: "active" });
  await seedStaff(raw, { providerId: WALKER, userProfileId: W2.profileId, role: "staff", status: "active" });
  await seedCapability(raw, { providerId: WALKER, capability: "walker" });
});

// Insert a FINISHED walk_session assigned to `staffId` with a route + pickup point.
async function seedFinished(staffId: number, opts: { pickup?: boolean } = {}) {
  const pickupLat = opts.pickup === false ? null : -34.6;
  const pickupLng = opts.pickup === false ? null : -58.4;
  const [row] = await raw<{ id: number }[]>`
    insert into walk_sessions
      (pet_id, owner_user_id, provider_id, staff_user_id, status, started_at, ended_at,
       distance_m, duration_s, route, pickup_lat, pickup_lng)
    values (
      ${O.petId}, ${O.profileId}, ${WALKER}, ${staffId}, 'finished', now(), now(),
      1200, 1800, ${raw.json([{ lat: -34.6, lng: -58.4, t: 1000 }, { lat: -34.61, lng: -58.41, t: 2000 }])},
      ${pickupLat}, ${pickupLng}
    )
    returning id
  `;
  return row.id;
}

describe("B5 — walker walk history", () => {
  it("returns the walker's finished sessions with pickup point + pet name", async () => {
    const id = await seedFinished(W.profileId);
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/${WALKER}/walk-sessions?status=finished`);
    expect(res.status).toBe(200);
    const { sessions } = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(id);
    expect(sessions[0].pet_name).toBe("Rex");
    expect(Number(sessions[0].pickup_lat)).toBeCloseTo(-34.6, 5);
    expect(Number(sessions[0].pickup_lng)).toBeCloseTo(-58.4, 5);
    expect(Array.isArray(sessions[0].route)).toBe(true);
    expect(Number(sessions[0].distance_m)).toBe(1200);
  });

  it("a session with no pickup captured returns null pickup (pre-B3 / denied-location)", async () => {
    await seedFinished(W.profileId, { pickup: false });
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/${WALKER}/walk-sessions?status=finished`);
    const { sessions } = await res.json();
    expect(sessions[0].pickup_lat).toBeNull();
    expect(sessions[0].pickup_lng).toBeNull();
  });

  it("a walker sees ONLY their own sessions (participant-scoped)", async () => {
    await seedFinished(W.profileId);
    await seedFinished(W2.profileId); // another walker's session
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/${WALKER}/walk-sessions?status=finished`);
    const { sessions } = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].staff_user_id).toBe(W.profileId);
  });
});
