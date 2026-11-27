// Prices above the old integer limit ($21.474.836,47): migration 0163 widens every cents column to bigint, and utils/sql.js reads
// bigint as a number (without that, a price would arrive as text and "price + deposit" would glue digits together). Proven through the
// REAL Hono router on real Postgres as pawpi_app, up to the new limit and just above it.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedCapability, seedOrder, seedOwnerWithPet, seedPayment, seedProvider, seedStaff } from "./db";
import { MIGRATIONS_DIR } from "./migrate";
import { MAX_PRICE_CENTS } from "../../src/lib/decimal";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const SELLER = { authUserId: 1, profileId: 1, username: "seller", petId: 1, petName: "Rex" };
const P = 10;
const HUGE = 2_500_000_000; // $25.000.000,00 — refused before 0163
const TOO_BIG = MAX_PRICE_CENTS + 1;

let raw: Sql;
let appSql: any;
let api: any;

const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
const ok = async (res: Response) => {
  const body = await res.json();
  expect([200, 201], JSON.stringify(body)).toContain(res.status);
  return body;
};
const refused = async (res: Response) => expect([400, 422], `status ${res.status}`).toContain(res.status);
const migration = () => readFileSync(join(MIGRATIONS_DIR, "0163_money_bigint.sql"), "utf8");

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ default: appSql } = (await import("../../src/app/api/utils/sql")) as any);
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, SELLER);
  await seedProvider(raw, { providerId: P, ownerUserProfileId: SELLER.profileId, slug: "prov-p", status: "published" });
  await seedStaff(raw, { providerId: P, userProfileId: SELLER.profileId, role: "owner" });
  for (const capability of ["shop", "walker", "adoption", "insurance", "pharmacy"]) await seedCapability(raw, { providerId: P, capability });
  authState.session = { user: { id: SELLER.authUserId } };
});

describe("the app's database client", () => {
  it("reads bigint and count as numbers, and keeps a value too large to be exact as text", async () => {
    const [row] = await appSql`select ${HUGE}::bigint as price, count(*) as n, 9007199254740993::bigint as inexact from (select 1) t`;
    expect(row).toEqual({ price: HUGE, n: 1, inexact: "9007199254740993" });
  });
});

describe("prices above the old limit, through the router", () => {
  it("a service: create, edit and read back as numbers", async () => {
    const created = await ok(await req(`/providers/${P}/services`, "POST", { name: "Surgery", duration_min: 60, price_cents: HUGE, deposit_cents: HUGE, nightly_rate_cents: HUGE }));
    const service = created.service ?? created;
    expect([service.price_cents, service.deposit_cents, service.nightly_rate_cents]).toEqual([HUGE, HUGE, HUGE]);
    const edited = await ok(await req(`/providers/${P}/services/${service.id}`, "PATCH", { price_cents: MAX_PRICE_CENTS }));
    expect((edited.service ?? edited).price_cents).toBe(MAX_PRICE_CENTS);
    const listed = await ok(await req(`/providers/${P}/services`));
    expect((listed.services ?? listed)[0].price_cents).toBe(MAX_PRICE_CENTS);
  });

  it("a shop product with its former price", async () => {
    const created = await ok(await req(`/providers/${P}/shop-products`, "POST", { name: "Kennel", price_cents: HUGE }));
    const product = created.product ?? created;
    expect(product.price_cents).toBe(HUGE);
    const edited = await ok(await req(`/providers/${P}/shop-products/${product.id}`, "PATCH", { compare_at_cents: HUGE + 100 }));
    expect((edited.product ?? edited).compare_at_cents).toBe(HUGE + 100);
    // "greater than the price" is compared as numbers, not as text
    await refused(await req(`/providers/${P}/shop-products/${product.id}`, "PATCH", { compare_at_cents: 900_000_000 }));
  });

  it("a walk package and an adoption fee", async () => {
    const pkg = await ok(await req(`/providers/${P}/walk-packages`, "POST", { walks_count: 5, price_cents: HUGE }));
    expect((pkg.package ?? pkg).price_cents).toBe(HUGE);
    const listing = await ok(await req(`/providers/${P}/adoptable-listings`, "POST", { name: "Luna", species: "dog", adoption_fee_cents: HUGE }));
    expect((listing.listing ?? listing).adoption_fee_cents).toBe(HUGE);
  });

  it("orders, payments, the webhook lookup and the sales totals", async () => {
    for (const id of [100, 101]) {
      await seedOrder(raw, { orderId: id, ownerUserId: SELLER.profileId, providerId: P, amountCents: HUGE, status: "paid" });
      await seedPayment(raw, { paymentId: id * 10, orderId: id, amountCents: HUGE, status: "approved", externalId: `ext-${id}` });
    }
    const [found] = await appSql`select * from app_payment_for_webhook('ext-100')`;
    expect(found.amount_cents).toBe(HUGE);
    const sales = await ok(await req(`/providers/${P}/sales`));
    expect(sales.revenue.gross_cents).toBe(2 * HUGE);
  });

  it("above the new limit is refused with a 400, never a database error", async () => {
    const service = { name: "S", duration_min: 30 };
    for (const field of ["price_cents", "deposit_cents", "nightly_rate_cents"]) {
      await refused(await req(`/providers/${P}/services`, "POST", { ...service, [field]: TOO_BIG }));
    }
    await refused(await req(`/providers/${P}/shop-products`, "POST", { name: "K", price_cents: TOO_BIG }));
    const created = await ok(await req(`/providers/${P}/shop-products`, "POST", { name: "K", price_cents: 100 }));
    const id = (created.product ?? created).id;
    await refused(await req(`/providers/${P}/shop-products/${id}`, "PATCH", { price_cents: TOO_BIG }));
    await refused(await req(`/providers/${P}/shop-products/${id}`, "PATCH", { compare_at_cents: 1e30 }));
    await refused(await req(`/providers/${P}/walk-packages`, "POST", { walks_count: 5, price_cents: TOO_BIG }));
    await refused(await req(`/providers/${P}/walk-packages/1`, "PATCH", { price_cents: TOO_BIG }));
    await refused(await req(`/providers/${P}/adoptable-listings`, "POST", { name: "L", species: "dog", adoption_fee_cents: TOO_BIG }));
    await refused(await req(`/providers/${P}/adoptable-listings/1`, "PATCH", { adoption_fee_cents: TOO_BIG }));
    await refused(await req(`/providers/${P}/insurance-policies/1`, "PATCH", { premium_cents: TOO_BIG }));
    await refused(await req(`/providers/${P}/rx-fulfillment-orders/1`, "PATCH", { price_cents: TOO_BIG }));
  });
});

describe("migration 0163", () => {
  it("verify_0163 passes, and the migration is safe to run again", async () => {
    await raw.unsafe(migration());
    const rows = (await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0163.sql"), "utf8"))) as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.status !== "PASS")).toEqual([]);
  });
});
