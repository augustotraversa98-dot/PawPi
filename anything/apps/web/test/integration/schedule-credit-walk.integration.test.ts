// Ticket B4 — schedule a walk against a pack (pay-with-credit booking), proven through the REAL
// Hono router (api.request) on real Postgres as pawpi_app. A credit walk IS a normal walker
// booking marked pay_with_credit: NO money order, requires a positive balance, staff-only confirm.
// The credit is consumed at PICKUP (B3), not at booking.
//
// Proves: a pay_with_credit booking is created WITHOUT a money order (order_id null,
// pay_with_credit true); a zero-balance owner is blocked (409); the owner canNOT self-confirm
// (staff-only, mirroring booking policy); non-integer ids → 404 before SQL; the lists surface the
// pay_with_credit flag.

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
const O2 = { authUserId: 2, profileId: 2, username: "owner2", petId: 2, petName: "Fido" }; // no credits
const W = { authUserId: 3, profileId: 3, username: "walker" };

const WALKER = 10;

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
  // Grant directly (bypasses RLS as the superuser harness owner). The helper reads source_ref.
  await raw`
    insert into walk_credit_packs (owner_user_id, provider_id, walks_total, walks_used, order_id)
    values (${ownerId}, ${WALKER}, ${walks}, 0, ${order.id})
  `;
}

beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedOwnerWithPet(raw, O2);
  await seedUser(raw, W);
  await seedProvider(raw, { providerId: WALKER, ownerUserProfileId: W.profileId, slug: "paw-walks", status: "published" });
  await seedStaff(raw, { providerId: WALKER, userProfileId: W.profileId, role: "owner", status: "active" });
  await seedCapability(raw, { providerId: WALKER, capability: "walker" });
});

const bookBody = (extra: Record<string, unknown> = {}) => ({
  petId: O.petId,
  appointment_date: "2026-09-01",
  appointment_time: "10:00",
  capability: "walker",
  ...extra,
});

describe("B4 — schedule a credit walk", () => {
  it("404 (before SQL) for a non-integer provider id", async () => {
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq(`/providers/abc/book`, "POST", bookBody({ pay_with_credit: true }));
    expect(res.status).toBe(404);
  });

  it("creates a pay_with_credit booking WITHOUT a money order", async () => {
    await grantCredits(O.profileId, 5);
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq(`/providers/${WALKER}/book`, "POST", bookBody({ pay_with_credit: true }));
    expect(res.status).toBe(201);
    const { appointment } = await res.json();
    expect(appointment.pay_with_credit).toBe(true);
    expect(appointment.order_id).toBeNull();

    // No money order was created for this booking (credits are spent at pickup, not now).
    const [{ c }] = await raw<{ c: number }[]>`select count(*)::int as c from orders where kind = 'booking'`;
    expect(c).toBe(0);
    // The credit is NOT consumed at booking (still 0 used).
    const [{ used }] = await raw<{ used: number }[]>`select walks_used as used from walk_credit_packs where owner_user_id = ${O.profileId}`;
    expect(used).toBe(0);
  });

  it("blocks a zero-balance owner with a 409 (no booking created)", async () => {
    authState.session = sessionFor(O2.authUserId); // O2 has no credits
    const res = await apiReq(`/providers/${WALKER}/book`, "POST", {
      petId: O2.petId,
      appointment_date: "2026-09-01",
      appointment_time: "10:00",
      capability: "walker",
      pay_with_credit: true,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("no_credits");
    const [{ c }] = await raw<{ c: number }[]>`select count(*)::int as c from vet_appointments`;
    expect(c).toBe(0);
  });

  it("the owner canNOT self-confirm; a staff member can", async () => {
    await grantCredits(O.profileId, 5);
    authState.session = sessionFor(O.authUserId);
    const created = await apiReq(`/providers/${WALKER}/book`, "POST", bookBody({ pay_with_credit: true }));
    const { appointment } = await created.json();

    // Owner tries to confirm their own booking → 403 (staff-only).
    authState.session = sessionFor(O.authUserId);
    const ownerConfirm = await apiReq(
      `/providers/${WALKER}/bookings/${appointment.id}`,
      "PATCH",
      { action: "confirm" },
    );
    expect(ownerConfirm.status).toBe(403);

    // Staff W confirms → 200.
    authState.session = sessionFor(W.authUserId);
    const staffConfirm = await apiReq(
      `/providers/${WALKER}/bookings/${appointment.id}`,
      "PATCH",
      { action: "confirm" },
    );
    expect(staffConfirm.status).toBe(200);
    const [{ status }] = await raw<{ status: string }[]>`select booking_status as status from vet_appointments where id = ${appointment.id}`;
    expect(status).toBe("confirmed");
  });

  it("surfaces pay_with_credit on the walker agenda AND the owner's list", async () => {
    await grantCredits(O.profileId, 5);
    authState.session = sessionFor(O.authUserId);
    await apiReq(`/providers/${WALKER}/book`, "POST", bookBody({ pay_with_credit: true }));

    // Walker agenda.
    authState.session = sessionFor(W.authUserId);
    const agenda = await apiReq(`/providers/${WALKER}/bookings`);
    const agendaBody = await agenda.json();
    expect(agendaBody.bookings[0].pay_with_credit).toBe(true);

    // Owner list.
    authState.session = sessionFor(O.authUserId);
    const mine = await apiReq(`/me/bookings`);
    const mineBody = await mine.json();
    const all = [...mineBody.upcoming, ...mineBody.past];
    expect(all.some((b: any) => b.pay_with_credit === true)).toBe(true);
  });

  it("a normal (non-credit) booking is unaffected: pay_with_credit false, no balance needed", async () => {
    authState.session = sessionFor(O2.authUserId); // no credits, but not a credit booking
    const res = await apiReq(`/providers/${WALKER}/book`, "POST", {
      petId: O2.petId,
      appointment_date: "2026-09-01",
      appointment_time: "10:00",
      capability: "walker",
    });
    expect(res.status).toBe(201);
    const { appointment } = await res.json();
    expect(appointment.pay_with_credit).toBe(false);
  });
});
