// Ticket C1 — direct "request a walk", proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app, plus direct RLS proofs as pawpi_app.
//
// Proves: an owner creates a targeted request (201); RLS scopes it (owner sees own, another owner
// sees none, the TARGET walker's staff read it, a NON-target walker's staff do not); the walker
// accepts atomically → a confirmed walker booking + owner↔walker thread + owner notification are
// created; a SECOND accept (or an expired/cancelled request) → 409 "already taken"; a credit-holding
// owner's accepted booking is pay_with_credit; non-integer ids → 404 before SQL.

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
const W = { authUserId: 3, profileId: 3, username: "walker" }; // staffs WALKER
const W2 = { authUserId: 4, profileId: 4, username: "walker2" }; // staffs WALKER2 (non-target)

const WALKER = 10;
const WALKER2 = 11;

let raw: Sql;
let app: Sql; // as pawpi_app, for direct RLS proofs
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Run a query under a request identity (set_config app.current_user_id) as pawpi_app — the ONLY way
// to prove FORCE-RLS policies (the harness owner is superuser and bypasses them).
async function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId == null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  });
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
  await seedUser(raw, W);
  await seedUser(raw, W2);
  await seedProvider(raw, { providerId: WALKER, ownerUserProfileId: W.profileId, slug: "paw-walks", status: "published" });
  await seedStaff(raw, { providerId: WALKER, userProfileId: W.profileId, role: "owner", status: "active" });
  await seedCapability(raw, { providerId: WALKER, capability: "walker" });
  await seedProvider(raw, { providerId: WALKER2, ownerUserProfileId: W2.profileId, slug: "other-walks", status: "published" });
  await seedStaff(raw, { providerId: WALKER2, userProfileId: W2.profileId, role: "owner", status: "active" });
  await seedCapability(raw, { providerId: WALKER2, capability: "walker" });
});

async function createRequest(extra: Record<string, unknown> = {}) {
  authState.session = sessionFor(O.authUserId);
  const res = await apiReq(`/walk-requests`, "POST", {
    pet_id: O.petId,
    target_provider_id: WALKER,
    when_type: "now",
    ...extra,
  });
  return res;
}

async function grantCredits(ownerId: number, walks: number) {
  const [pkg] = await raw<{ id: number }[]>`
    insert into walk_packages (provider_id, walks_count, price_cents) values (${WALKER}, ${walks}, 10000)
    returning id
  `;
  const [order] = await raw<{ id: number }[]>`
    insert into orders (owner_user_id, provider_id, kind, source_ref, amount_cents, currency, status)
    values (${ownerId}, ${WALKER}, 'walk_package', ${`walk_package:${pkg.id}`}, 10000, 'ARS', 'pending')
    returning id
  `;
  await raw`
    insert into walk_credit_packs (owner_user_id, provider_id, walks_total, walks_used, order_id)
    values (${ownerId}, ${WALKER}, ${walks}, 0, ${order.id})
  `;
}

describe("C1 — direct request a walk", () => {
  it("404 (before SQL) for a non-integer id on accept", async () => {
    authState.session = sessionFor(W.authUserId);
    const res = await apiReq(`/providers/abc/walk-requests/1/accept`, "POST", {});
    expect(res.status).toBe(404);
  });

  it("an owner creates a targeted request and sees it in their own list", async () => {
    const res = await createRequest();
    expect(res.status).toBe(201);
    const { request } = await res.json();
    expect(request.status).toBe("open");
    expect(request.target_provider_id).toBe(WALKER);

    authState.session = sessionFor(O.authUserId);
    const mine = await apiReq(`/walk-requests?mine=1`);
    const { requests } = await mine.json();
    expect(requests).toHaveLength(1);
    expect(requests[0].is_live).toBe(true);
  });

  it("rejects a request for a pet the caller does not own (403)", async () => {
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq(`/walk-requests`, "POST", {
      pet_id: O2.petId, // not O's pet
      target_provider_id: WALKER,
      when_type: "now",
    });
    expect(res.status).toBe(403);
  });

  it("RLS: another owner cannot see the request; only the TARGET walker's staff can read it", async () => {
    const res = await createRequest();
    const { request } = await res.json();

    // Owner sees own row.
    expect(await asApp(O.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(1);
    // A different owner sees nothing.
    expect(await asApp(O2.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(0);
    // The TARGET walker's staff read it.
    expect(await asApp(W.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(1);
    // A NON-target walker's staff do not.
    expect(await asApp(W2.profileId, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(0);
    // Null identity sees nothing.
    expect(await asApp(null, (tx) => tx`select id from walk_requests where id = ${request.id}`)).toHaveLength(0);
  });

  it("the walker sees the incoming request; a non-target walker does not", async () => {
    await createRequest();
    authState.session = sessionFor(W.authUserId);
    const incoming = await apiReq(`/providers/${WALKER}/walk-requests?status=open`);
    expect((await incoming.json()).requests).toHaveLength(1);

    authState.session = sessionFor(W2.authUserId);
    const other = await apiReq(`/providers/${WALKER2}/walk-requests?status=open`);
    expect((await other.json()).requests).toHaveLength(0);
  });

  it("accept creates a confirmed walker booking + a thread + notifies the owner", async () => {
    const created = await createRequest();
    const { request } = await created.json();

    authState.session = sessionFor(W.authUserId);
    const acc = await apiReq(`/providers/${WALKER}/walk-requests/${request.id}/accept`, "POST", {});
    expect(acc.status).toBe(200);
    const body = await acc.json();
    expect(body.booking_id).toBeTruthy();
    expect(body.thread_id).toBeTruthy();

    // Request flipped to accepted.
    const [{ status }] = await raw<{ status: string }[]>`select status from walk_requests where id = ${request.id}`;
    expect(status).toBe("accepted");
    // A confirmed walker booking was created for the OWNER, assigned to the walker.
    const [bk] = await raw<any[]>`select * from vet_appointments where id = ${body.booking_id}`;
    expect(bk.capability).toBe("walker");
    expect(bk.booking_status).toBe("confirmed");
    expect(bk.owner_user_id).toBe(O.profileId);
    expect(bk.staff_user_id).toBe(W.profileId);
    // A thread exists for the pair.
    const [{ c: tc }] = await raw<{ c: number }[]>`select count(*)::int as c from message_threads where owner_user_id = ${O.profileId} and provider_id = ${WALKER}`;
    expect(tc).toBe(1);
    // The owner was notified.
    const [{ c: nc }] = await raw<{ c: number }[]>`select count(*)::int as c from notifications where recipient_user_id = ${O.profileId} and type = 'walk_request_accepted'`;
    expect(nc).toBe(1);
  });

  it("is race-safe: a second accept returns 409 (already taken)", async () => {
    const created = await createRequest();
    const { request } = await created.json();

    authState.session = sessionFor(W.authUserId);
    const first = await apiReq(`/providers/${WALKER}/walk-requests/${request.id}/accept`, "POST", {});
    expect(first.status).toBe(200);
    const second = await apiReq(`/providers/${WALKER}/walk-requests/${request.id}/accept`, "POST", {});
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe("already_taken");
    // Exactly one booking was created.
    const [{ c }] = await raw<{ c: number }[]>`select count(*)::int as c from vet_appointments where capability = 'walker'`;
    expect(c).toBe(1);
  });

  it("an expired request cannot be accepted and is hidden from the walker's open list", async () => {
    const created = await createRequest();
    const { request } = await created.json();
    // Force-expire it (superuser).
    await raw`update walk_requests set expires_at = now() - interval '1 minute' where id = ${request.id}`;

    authState.session = sessionFor(W.authUserId);
    const list = await apiReq(`/providers/${WALKER}/walk-requests?status=open`);
    expect((await list.json()).requests).toHaveLength(0);

    const acc = await apiReq(`/providers/${WALKER}/walk-requests/${request.id}/accept`, "POST", {});
    expect(acc.status).toBe(409);
  });

  it("the owner can cancel their open request; then it can't be accepted", async () => {
    const created = await createRequest();
    const { request } = await created.json();

    authState.session = sessionFor(O.authUserId);
    const cancel = await apiReq(`/walk-requests/${request.id}`, "PATCH", {});
    expect(cancel.status).toBe(200);
    expect((await cancel.json()).request.status).toBe("cancelled");

    authState.session = sessionFor(W.authUserId);
    const acc = await apiReq(`/providers/${WALKER}/walk-requests/${request.id}/accept`, "POST", {});
    expect(acc.status).toBe(409);
  });

  it("a credit-holding owner's accepted booking is pay_with_credit", async () => {
    await grantCredits(O.profileId, 3);
    const created = await createRequest();
    const { request } = await created.json();

    authState.session = sessionFor(W.authUserId);
    const acc = await apiReq(`/providers/${WALKER}/walk-requests/${request.id}/accept`, "POST", {});
    const { booking_id } = await acc.json();
    const [bk] = await raw<any[]>`select pay_with_credit from vet_appointments where id = ${booking_id}`;
    expect(bk.pay_with_credit).toBe(true);
    // The credit is NOT consumed at accept (spent at pickup, B3).
    const [{ used }] = await raw<{ used: number }[]>`select walks_used as used from walk_credit_packs where owner_user_id = ${O.profileId}`;
    expect(used).toBe(0);
  });
});
