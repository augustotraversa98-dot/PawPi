// Ticket B3 — QR pickup redeem, proven through the REAL Hono router (api.request) on real Postgres
// as pawpi_app, PLUS raw reads of the atomic effect. The owner mints a token (GET
// /pets/:id/walk-pickup-token), the walker scans it (POST /providers/:id/walk-pickup/redeem) → one
// atomic action deducts a credit + creates the in_progress walk_session with the pickup GPS.
//
// Proves: redeem deducts EXACTLY ONE credit + creates the session atomically; no-credit → 409 +
// NO writes; non-staff → 403; a token for provider A is rejected at provider B; non-integer ids →
// 404 before SQL; the owner token endpoint is owner-scoped.

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
import { signPickupToken } from "../../src/app/api/utils/walkPickupToken";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

// O = owner (has a pet + credits). W = active walker staff of WALKER + WALKER_B. X = a walker of a
// DIFFERENT provider (non-staff of WALKER).
const O = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const W = { authUserId: 2, profileId: 2, username: "walker" };
const X = { authUserId: 3, profileId: 3, username: "otherwalker" };

const WALKER = 10; // published walker provider (O has credits here)
const WALKER_B = 11; // a second walker provider (cross-provider token control)
const OTHER = 30; // a provider X owns (X is a non-staff of WALKER)

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

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ""),
    username: "pawpi_app",
    password: "pawpi_app",
    max: 1,
    onnotice: () => {},
  });
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

// Grant O `walks` credits with `providerId` via a walk_package order + the grant helper.
async function grantCredits(providerId: number, walks: number) {
  const [pkg] = await raw<{ id: number }[]>`
    insert into walk_packages (provider_id, walks_count, price_cents) values (${providerId}, ${walks}, 10000)
    returning id
  `;
  const [order] = await raw<{ id: number }[]>`
    insert into orders (owner_user_id, provider_id, kind, source_ref, amount_cents, currency, status)
    values (${O.profileId}, ${providerId}, 'walk_package', ${`walk_package:${pkg.id}`}, 10000, 'ARS', 'pending')
    returning id
  `;
  await raw`select app_grant_walk_credits(${order.id})`;
}

beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, W);
  await seedUser(raw, X);

  await seedProvider(raw, { providerId: WALKER, ownerUserProfileId: W.profileId, slug: "paw-walks", status: "published" });
  await seedStaff(raw, { providerId: WALKER, userProfileId: W.profileId, role: "owner", status: "active" });
  await seedCapability(raw, { providerId: WALKER, capability: "walker" });

  await seedProvider(raw, { providerId: WALKER_B, ownerUserProfileId: W.profileId, slug: "paw-walks-b", status: "published" });
  await seedStaff(raw, { providerId: WALKER_B, userProfileId: W.profileId, role: "owner", status: "active" });
  await seedCapability(raw, { providerId: WALKER_B, capability: "walker" });

  await seedProvider(raw, { providerId: OTHER, ownerUserProfileId: X.profileId, slug: "x-walks", status: "published" });
  await seedStaff(raw, { providerId: OTHER, userProfileId: X.profileId, role: "owner", status: "active" });
  await seedCapability(raw, { providerId: OTHER, capability: "walker" });
});

// ── owner token endpoint ──────────────────────────────────────────────────────
describe("B3 — owner walk-pickup-token", () => {
  it("404 (before SQL) for a non-integer pet id", async () => {
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq(`/pets/abc/walk-pickup-token?provider_id=${WALKER}`);
    expect(res.status).toBe(404);
  });

  it("400 when provider_id is missing", async () => {
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq(`/pets/${O.petId}/walk-pickup-token`);
    expect(res.status).toBe(400);
  });

  it("403 when the caller does not own the pet", async () => {
    authState.session = sessionFor(W.authUserId); // W owns no pet
    const res = await apiReq(`/pets/${O.petId}/walk-pickup-token?provider_id=${WALKER}`);
    expect(res.status).toBe(403);
  });

  it("the owner gets a signed token + expiry", async () => {
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq(`/pets/${O.petId}/walk-pickup-token?provider_id=${WALKER}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token).toContain(".");
    expect(typeof body.expires_at).toBe("string");
  });
});

// ── walker redeem endpoint ──────────────────────────────────────────────────────
describe("B3 — walker redeem", () => {
  async function ownerToken(providerId = WALKER, petId = O.petId) {
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq(`/pets/${petId}/walk-pickup-token?provider_id=${providerId}`);
    const { token } = await res.json();
    authState.session = null;
    return token as string;
  }

  it("404 (before SQL) for a non-integer provider id", async () => {
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/abc/walk-pickup/redeem`, "POST", { token: "x", lat: 1, lng: 2 });
    expect(res.status).toBe(404);
  });

  it("401 for an invalid/garbage token", async () => {
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/${WALKER}/walk-pickup/redeem`, "POST", { token: "not.a.token", lat: 1, lng: 2 });
    expect(res.status).toBe(401);
  });

  it("403 for a non-staff caller (walker of a different provider)", async () => {
    const token = await ownerToken();
    authState.session = sessionFor(X.authUserId); // X is not staff of WALKER
    const res = await apiReq(`/providers/${WALKER}/walk-pickup/redeem`, "POST", { token, lat: 1, lng: 2 });
    expect(res.status).toBe(403);
  });

  it("403 when a token for provider A is presented at provider B", async () => {
    await grantCredits(WALKER_B, 1);
    const tokenForA = signPickupToken({ owner_user_id: O.profileId, pet_id: O.petId, provider_id: WALKER });
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/${WALKER_B}/walk-pickup/redeem`, "POST", { token: tokenForA, lat: 1, lng: 2 });
    expect(res.status).toBe(403);
  });

  it("redeems: deducts exactly one credit + creates the in_progress session with pickup GPS", async () => {
    await grantCredits(WALKER, 2);
    const token = await ownerToken();
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/${WALKER}/walk-pickup/redeem`, "POST", { token, lat: -34.6, lng: -58.4 });
    expect(res.status).toBe(201);
    const { session_id } = await res.json();
    expect(session_id).toBeGreaterThan(0);

    // Exactly one credit spent.
    const [{ used, total }] = await raw<{ used: number; total: number }[]>`
      select walks_used as used, walks_total as total from walk_credit_packs where provider_id = ${WALKER}
    `;
    expect(used).toBe(1);
    expect(total).toBe(2);

    // The session is in_progress, assigned to W, with the pickup point + credit_pack_id.
    const [s] = await raw<any[]>`
      select status, staff_user_id, pet_id, pickup_lat, pickup_lng, credit_pack_id
      from walk_sessions where id = ${session_id}
    `;
    expect(s.status).toBe("in_progress");
    expect(s.staff_user_id).toBe(W.profileId);
    expect(s.pet_id).toBe(O.petId);
    expect(Number(s.pickup_lat)).toBeCloseTo(-34.6, 5);
    expect(Number(s.pickup_lng)).toBeCloseTo(-58.4, 5);
    expect(s.credit_pack_id).not.toBeNull();
  });

  it("409 (no credits) → NO session created, NO decrement", async () => {
    await grantCredits(WALKER, 1);
    // Spend the only credit.
    const t1 = await ownerToken();
    authState.session = sessionFor(W.authUserId);
    await apiReq(`/providers/${WALKER}/walk-pickup/redeem`, "POST", { token: t1, lat: 1, lng: 2 });

    // A fresh scan with no credits left → 409.
    const t2 = await ownerToken();
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/${WALKER}/walk-pickup/redeem`, "POST", { token: t2, lat: 1, lng: 2 });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("no_credits");

    // Exactly one session ever (from the first redeem), and the pack is fully spent (1/1) — not 2.
    const [{ c }] = await raw<{ c: number }[]>`select count(*)::int as c from walk_sessions`;
    expect(c).toBe(1);
    const [{ used }] = await raw<{ used: number }[]>`select walks_used as used from walk_credit_packs where provider_id = ${WALKER}`;
    expect(used).toBe(1);
  });
});
