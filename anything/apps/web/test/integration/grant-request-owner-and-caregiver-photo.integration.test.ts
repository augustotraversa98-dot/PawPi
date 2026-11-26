// Migration 0150, proven as pawpi_app with real RLS, directly and through the real routes:
//   1. a provider-staff access request must name the pet's actual owner (care_access_grants_insert, via app_pet_owner_is);
//   2. a caregiver-role photo check must reference a private media key for THIS pet (health_photo_checks_caregiver_insert).
// The owner / family / owner-branch paths and the route behaviour for them are unchanged. supabase/verify_0150.sql must read PASS.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedOwnerWithPet, seedPetCaregiver, seedProviderWithStaff, seedUser } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "vet" };
const CARE = { authUserId: 4, profileId: 4, username: "care" };
const FAMILY = { authUserId: 5, profileId: 5, username: "family" };
const OUTSIDER = { authUserId: 6, profileId: 6, username: "outsider" };

let raw: Sql;
let app: Sql;
let api: any;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}
const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const req = (p: string, method = "GET", body?: unknown) =>
  api.request(p, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });

const grantSql = (petId: number, ownerId: number, extra = "") =>
  `insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by${extra ? ", sections" : ""})
   values (${petId}, ${ownerId}, 1, array['medical_read'], 'pending', 'provider'${extra ? `, ${extra}` : ""}) returning id`;
const photoSql = (petId: number, ownerId: number, url: string) =>
  `insert into health_photo_checks (pet_id, owner_user_id, body_area, image_url) values (${petId}, ${ownerId}, 'paws', '${url}') returning id`;
const photoRows = async () => Number((await raw`select count(*)::int n from health_photo_checks`)[0].n);
const grantRows = async () => Number((await raw`select count(*)::int n from care_access_grants`)[0].n);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  app = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""), username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {} });
  ({ api } = (await import("../../__create/route-builder")) as any);
  // Other files in this run re-apply 0139 / 0147 on the shared cluster (to prove those are idempotent), which puts the older
  // versions of these two policies back. 0150 is idempotent too, so assert the final state before this file's tests run.
  await raw.unsafe(await readFile(path.join(MIGRATIONS_DIR, "0150_grant_request_owner_and_caregiver_photo_ref.sql"), "utf8"));
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  for (const u of [VET, CARE, FAMILY, OUTSIDER]) await seedUser(raw, u);
  await seedPetCaregiver(raw, { id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId, role: "caregiver" });
  await seedPetCaregiver(raw, { id: 2, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await seedProviderWithStaff(raw, { providerId: 1, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId, slug: "clinic", providerStatus: "published" });
});

describe("0150 part 1 — a provider-staff access request names the pet's actual owner", () => {
  it("direct SQL: refused when owner_user_id is anyone but the pet's owner; accepted for the pet's owner", async () => {
    await expect(asApp(VET.profileId, (tx) => tx.unsafe(grantSql(OWNER.petId, OTHER.profileId))), "someone else").rejects.toThrow(/row-level security/i);
    await expect(asApp(VET.profileId, (tx) => tx.unsafe(grantSql(OWNER.petId, VET.profileId))), "the staff member").rejects.toThrow(/row-level security/i);
    expect(await grantRows()).toBe(0);
    await asApp(VET.profileId, async (tx) => {
      expect((await tx.unsafe(grantSql(OWNER.petId, OWNER.profileId))).length).toBe(1);
    });
  });

  it("the rest of the branch still holds: sections, non-pending status and non-staff are refused", async () => {
    await expect(asApp(VET.profileId, (tx) => tx.unsafe(
      `insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by, sections)
       values (${OWNER.petId}, ${OWNER.profileId}, 1, array['record_sections'], 'active', 'provider', array['vet_notes'])`))).rejects.toThrow();
    await expect(asApp(VET.profileId, (tx) => tx.unsafe(
      `insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
       values (${OWNER.petId}, ${OWNER.profileId}, 1, array['medical_read'], 'active', 'provider')`))).rejects.toThrow(/row-level security/i);
    await expect(asApp(OUTSIDER.profileId, (tx) => tx.unsafe(grantSql(OWNER.petId, OWNER.profileId))), "not staff").rejects.toThrow(/row-level security/i);
  });

  it("the owner branch is unchanged: the owner can still grant to a provider for their own pet only", async () => {
    await asApp(OWNER.profileId, async (tx) => {
      expect((await tx.unsafe(
        `insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
         values (${OWNER.petId}, ${OWNER.profileId}, 1, array['medical_read'], 'active', 'owner') returning id`)).length).toBe(1);
    });
    await expect(asApp(OWNER.profileId, (tx) => tx.unsafe(
      `insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
       values (${OTHER.petId}, ${OWNER.profileId}, 1, array['medical_read'], 'active', 'owner')`))).rejects.toThrow(/row-level security/i);
  });

  it("route: POST /providers/1/access-requests by staff still creates the request for the pet's owner", async () => {
    as(VET);
    const res = await req("/providers/1/access-requests", "POST", { petId: OWNER.petId, scopes: ["medical_read"] });
    expect(res.status).toBe(201);
    const [g] = await raw`select owner_user_id, status, requested_by from care_access_grants`;
    expect([g.owner_user_id, g.status, g.requested_by]).toEqual([OWNER.profileId, "pending", "provider"]);
  });
});

describe("0150 part 2 — a caregiver's photo check must reference this pet's private media key", () => {
  it("direct SQL as a caregiver: another host, another pet's key, traversal and non-keys are refused; this pet's key is accepted", async () => {
    for (const url of ["https://other.example/x.jpg", "pets/2/abc.jpg", "pets/1/../2/abc.jpg", "pets/1/a/b.jpg", "pets/1/", "/pets/1/abc.jpg", "x"]) {
      await expect(asApp(CARE.profileId, (tx) => tx.unsafe(photoSql(OWNER.petId, OWNER.profileId, url))), url).rejects.toThrow(/row-level security/i);
    }
    expect(await photoRows()).toBe(0);
    await asApp(CARE.profileId, async (tx) => {
      expect((await tx.unsafe(photoSql(OWNER.petId, OWNER.profileId, "pets/1/3f2a-uuid.jpg"))).length).toBe(1);
    });
  });

  it("the owner-anchor requirement from 0139 still holds for a caregiver", async () => {
    await expect(asApp(CARE.profileId, (tx) => tx.unsafe(photoSql(OWNER.petId, CARE.profileId, "pets/1/abc.jpg")))).rejects.toThrow(/row-level security/i);
  });

  it("owner and family are unchanged: any stored reference (including a legacy URL) still goes in", async () => {
    await asApp(OWNER.profileId, async (tx) => {
      expect((await tx.unsafe(photoSql(OWNER.petId, OWNER.profileId, "https://legacy.example/storage/v1/object/public/media/uploads/a.jpg"))).length).toBe(1);
    });
    await asApp(FAMILY.profileId, async (tx) => {
      expect((await tx.unsafe(photoSql(OWNER.petId, OWNER.profileId, "https://legacy.example/storage/v1/object/public/media/uploads/b.jpg"))).length).toBe(1);
    });
  });

  it("route: a caregiver gets a clear 400 (no server error, no row) for a non-key, and 201 for this pet's key", async () => {
    as(CARE);
    for (const imageUrl of ["https://other.example/x.jpg", "pets/2/abc.jpg", 42]) {
      const bad = await req("/health/photo-checks", "POST", { petId: OWNER.petId, bodyArea: "paws", imageUrl });
      expect(bad.status, String(imageUrl)).toBe(400);
      expect((await bad.json()).code).toBe("invalid_photo_reference");
    }
    expect(await photoRows()).toBe(0);
    const ok = await req("/health/photo-checks", "POST", { petId: OWNER.petId, bodyArea: "paws", imageUrl: "pets/1/abc.jpg" });
    expect(ok.status).toBe(201);
    expect((await ok.json()).photoCheck.owner_user_id).toBe(OWNER.profileId);
  });

  it("route: owner and family can still post any reference", async () => {
    for (const u of [OWNER, FAMILY]) {
      as(u);
      const res = await req("/health/photo-checks", "POST", { petId: OWNER.petId, bodyArea: "ears", imageUrl: "https://legacy.example/a.jpg" });
      expect(res.status, u.username).toBe(201);
    }
  });
});

describe("verify_0150.sql and idempotence", () => {
  it("every row reads PASS on the migrated database", async () => {
    const rows = await raw.unsafe(await readFile(path.resolve(MIGRATIONS_DIR, "../verify_0150.sql"), "utf8"));
    expect(rows.length).toBe(8);
    for (const r of rows as any[]) expect(r.status, `${r.check_name} :: ${r.detail}`).toBe("PASS");
  });

  it("re-applying the migration leaves one policy of each and one helper", async () => {
    const text = await readFile(path.join(MIGRATIONS_DIR, "0150_grant_request_owner_and_caregiver_photo_ref.sql"), "utf8");
    await raw.unsafe(text);
    await raw.unsafe(text);
    const n = await raw`select
      (select count(*)::int from pg_policies where tablename = 'care_access_grants' and policyname = 'care_access_grants_insert') as g,
      (select count(*)::int from pg_policies where tablename = 'health_photo_checks' and policyname = 'health_photo_checks_caregiver_insert') as p,
      (select count(*)::int from pg_proc where proname = 'app_pet_owner_is') as f`;
    expect([n[0].g, n[0].p, n[0].f]).toEqual([1, 1, 1]);
  });
});
