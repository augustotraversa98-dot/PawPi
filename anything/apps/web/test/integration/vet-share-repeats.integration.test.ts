// A share, an answer or a link request sent twice happens once (docs/vet-sharing-design.md "Sent twice"), through the
// real Hono router + real Postgres as pawpi_app.
//   A. sharing by section        B. approving a request        C. creating a record link

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { Sql } from "postgres";
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedCapability, seedOwnerWithPet, seedProviderWithStaff, seedUser } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "vet" };
const PET = OWNER.petId;
const P1 = 1;

type Person = { authUserId: number; profileId: number };

let raw: Sql;
let api: any;

const as = (u: Person) => { authState.session = { user: { id: u.authUserId } }; };
const req = (path: string, method: string, body: unknown, headers: Record<string, string> = {}) =>
  api.request(path, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const together = async (count: number, send: () => Promise<Response>) => {
  const results = await Promise.all(Array.from({ length: count }, send));
  return Promise.all(results.map(async (r) => ({ status: r.status, body: (await r.json()) as any })));
};
const grants = () => raw`select * from care_access_grants order by id`;
const links = () => raw`select * from care_record_links order by id`;
const told = () => raw`select * from notifications where type = 'care_access_granted'`;

const share = (over: Record<string, unknown> = {}) => {
  as(OWNER);
  return req("/care-access/grants", "POST", { petId: PET, providerId: P1, sections: ["vaccines", "files"], expiry: "7d", ...over });
};
const createLink = (key?: string, user: Person = OWNER, petId = PET) => {
  as(user);
  return req(
    "/care-access/links", "POST", { petId, sections: ["vaccines"], expiry: "7d", allowNotes: false },
    key === undefined ? {} : { "idempotency-key": key },
  );
};

const migration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");

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
  // The router's pool belongs to this file.
  const { pool } = (await import("@/app/api/utils/sql")) as any;
  await pool.end({ timeout: 5 });
  await raw.end();
});
beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  await seedUser(raw, VET);
  await seedProviderWithStaff(raw, {
    providerId: P1, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId, staffRole: "owner",
    slug: "north-clinic", providerStatus: "published",
  });
  await seedCapability(raw, { providerId: P1, capability: "vet" });
});
afterEach(async () => { await resetDb(raw); authState.session = null; });

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A. sharing by section", () => {
  it.each([["7d"], ["until_revoked"]])("the same %s share sent several times at once gives one access, told once", async (expiry) => {
    const results = await together(5, () => share({ expiry }));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    const rows = await grants();
    expect(rows).toHaveLength(1);
    expect(results.every((r) => r.body.grant.id === rows[0].id)).toBe(true);
    expect(results.filter((r) => r.body.deduped)).toHaveLength(4);
    expect(await told()).toHaveLength(1);
  });

  it("the same parts in another order, moments later, are the same share", async () => {
    await share();
    const again = await share({ sections: ["files", "vaccines"] });
    expect(again.status).toBe(200);
    expect(await grants()).toHaveLength(1);
  });

  it.each([
    ["fewer parts", { sections: ["vaccines"] }],
    ["more parts", { sections: ["vaccines", "files", "photos"] }],
    ["another length", { expiry: "30d" }],
    ["no end date", { expiry: "until_revoked" }],
  ])("a different choice (%s) replaces it, as before", async (_name, over) => {
    await share();
    expect((await share(over)).status).toBe(201);
    expect((await grants()).map((g) => g.status)).toEqual(["revoked", "active"]);
  });

  it("the same choice sent again later is a new share", async () => {
    await share();
    await raw`update care_access_grants set granted_at = granted_at - interval '3 minutes', expires_at = expires_at - interval '3 minutes'`;
    expect((await share()).status).toBe(201);
    expect((await grants()).map((g) => g.status)).toEqual(["revoked", "active"]);
  });

  it("after revoking, the same choice is shared anew", async () => {
    const first = await (await share()).json();
    as(OWNER);
    await req(`/care-access/grants/${first.grant.id}`, "PATCH", { action: "revoke" });
    expect((await share()).status).toBe(201);
    expect((await grants()).map((g) => g.status)).toEqual(["revoked", "active"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("B. approving a request", () => {
  it("approving several times at once gives one access, told once", async () => {
    const [pending] = await raw`
      insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
      values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read"]}, 'pending', 'provider') returning id`;
    as(OWNER);
    const results = await together(4, () => req(`/care-access/grants/${pending.id}`, "PATCH", { action: "approve" }));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    expect((await grants()).map((g) => g.status)).toEqual(["active"]);
    expect(await told()).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("C. creating a record link", () => {
  const KEY = "link-request-0001";

  it("one request sent several times at once creates one link and never repeats its address", async () => {
    const results = await together(4, () => createLink(KEY));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    const rows = await links();
    expect(rows).toHaveLength(1);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(r.body).toEqual({ error: expect.any(String), code: "link_already_created", linkId: rows[0].id });
    }
  });

  it("another key, or none, is another request", async () => {
    for (const key of [KEY, "link-request-0002", undefined, undefined]) expect((await createLink(key)).status).toBe(201);
    expect(await links()).toHaveLength(4);
  });

  it("a key belongs to the owner who sent it", async () => {
    await createLink(KEY);
    expect((await createLink(KEY, OTHER, OTHER.petId)).status).toBe(201);
    expect(await links()).toHaveLength(2);
  });

  it("refuses a key that is not one", async () => {
    const res = await createLink("short");
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("idempotency_key_invalid");
    expect(await links()).toHaveLength(0);
  });

  describe("on a database without the key table", () => {
    beforeAll(async () => { await raw`drop table if exists request_idempotency_keys`; });
    afterAll(async () => { await raw.unsafe(migration("0138_request_idempotency_keys.sql")); });

    it("creates links and ignores the key", async () => {
      expect((await createLink(KEY)).status).toBe(201);
      expect((await createLink(KEY)).status).toBe(201);
      expect(await links()).toHaveLength(2);
    });
  });
});
