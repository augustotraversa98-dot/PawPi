// vet_notes: the owner policy also requires the pet to be the caller's (migration 0149, same shape as 0140 for the other 21
// pet-linked tables). Proven as pawpi_app with real RLS, both directly and through the real routes:
//   • a user who does not own the pet cannot insert a note against it (stamped to self or to the owner), re-point their own
//     note at it, or see / change / delete the owner's notes;
//   • the legitimate paths are unchanged: the owner (own pet), a family Editor (0120 family policy, anchored to the owner),
//     a provider with medical_write (0023 provider policy, anchored to the owner), a provider with medical_read (read only);
//   • supabase/verify_0149.sql reads PASS on the migrated database.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedGrant, seedOwnerWithPet, seedPetCaregiver, seedProviderWithStaff, seedUser } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" }; // owns a different pet; no access to Rex
const FAMILY = { authUserId: 3, profileId: 3, username: "family" };
const CARE = { authUserId: 4, profileId: 4, username: "care" };
const VET = { authUserId: 5, profileId: 5, username: "vet" };

let raw: Sql;
let app: Sql;
let api: any;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}
const noteSql = (petId: number, ownerId: number, text = "n") =>
  `insert into vet_notes (pet_id, owner_user_id, note_date, note) values (${petId}, ${ownerId}, current_date, '${text}') returning id`;
const seedNote = async (petId: number, ownerId: number) => (await raw.unsafe(noteSql(petId, ownerId)))[0].id as number;
const noteRows = async () => Number((await raw`select count(*)::int n from vet_notes`)[0].n);

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const req = (p: string, method = "GET", body?: unknown) =>
  api.request(p, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  app = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""), username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {} });
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  for (const u of [FAMILY, CARE, VET]) await seedUser(raw, u);
  await seedPetCaregiver(raw, { id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await seedPetCaregiver(raw, { id: 2, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId, role: "caregiver" });
  await seedProviderWithStaff(raw, { providerId: 1, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId, slug: "clinic", providerStatus: "published" });
  await raw.unsafe(`select setval(pg_get_serial_sequence('vet_notes', 'id'), 10000)`);
});

describe("0149 — direct SQL as pawpi_app", () => {
  it("a user who does not own the pet cannot insert, re-point, read, change or delete notes on it", async () => {
    const ownerNote = await seedNote(OWNER.petId, OWNER.profileId);
    const otherNote = await seedNote(OTHER.petId, OTHER.profileId);

    await expect(asApp(OTHER.profileId, (tx) => tx.unsafe(noteSql(OWNER.petId, OTHER.profileId))), "insert as self").rejects.toThrow(/row-level security/i);
    await expect(asApp(OTHER.profileId, (tx) => tx.unsafe(noteSql(OWNER.petId, OWNER.profileId))), "insert as owner").rejects.toThrow(/row-level security/i);
    await expect(asApp(OTHER.profileId, (tx) => tx.unsafe(`update vet_notes set pet_id = ${OWNER.petId} where id = ${otherNote} returning id`)), "re-point").rejects.toThrow(/row-level security/i);
    await expect(asApp(null, (tx) => tx.unsafe(noteSql(OWNER.petId, OWNER.profileId))), "no identity").rejects.toThrow(/row-level security/i);

    await asApp(OTHER.profileId, async (tx) => {
      expect(await tx.unsafe(`select id from vet_notes where id = ${ownerNote}`)).toHaveLength(0);
      expect(await tx.unsafe(`update vet_notes set note = 'x' where id = ${ownerNote} returning id`)).toHaveLength(0);
      expect(await tx.unsafe(`delete from vet_notes where id = ${ownerNote} returning id`)).toHaveLength(0);
    });
    const left = await raw`select id, pet_id, owner_user_id, note from vet_notes order by id`;
    expect(left.map((r: any) => [r.id, r.pet_id, r.owner_user_id, r.note])).toEqual([
      [ownerNote, OWNER.petId, OWNER.profileId, "n"],
      [otherNote, OTHER.petId, OTHER.profileId, "n"],
    ]);
  });

  it("the owner still inserts, edits and deletes notes on their own pet", async () => {
    await asApp(OWNER.profileId, async (tx) => {
      const [ins] = await tx.unsafe(noteSql(OWNER.petId, OWNER.profileId));
      expect(await tx.unsafe(`update vet_notes set note = 'edited' where id = ${ins.id} returning id`)).toHaveLength(1);
      expect(await tx.unsafe(`delete from vet_notes where id = ${ins.id} returning id`)).toHaveLength(1);
    });
  });

  it("family still writes owner-anchored notes (0120 family policy); a caregiver still cannot", async () => {
    await asApp(FAMILY.profileId, async (tx) => {
      expect((await tx.unsafe(noteSql(OWNER.petId, OWNER.profileId))).length).toBe(1);
    });
    await expect(asApp(CARE.profileId, (tx) => tx.unsafe(noteSql(OWNER.petId, OWNER.profileId)))).rejects.toThrow(/row-level security/i);
  });

  it("a provider with medical_write still inserts an owner-anchored note (0023); medical_read alone cannot, but reads", async () => {
    await seedGrant(raw, { petId: OWNER.petId, ownerUserId: OWNER.profileId, providerId: 1, scopes: ["medical_read"] });
    const existing = await seedNote(OWNER.petId, OWNER.profileId);
    await expect(asApp(VET.profileId, (tx) => tx.unsafe(noteSql(OWNER.petId, OWNER.profileId)))).rejects.toThrow(/row-level security/i);
    await asApp(VET.profileId, async (tx) => {
      expect(await tx.unsafe(`select id from vet_notes where id = ${existing}`)).toHaveLength(1);
    });
    await raw`update care_access_grants set scopes = ${["medical_read", "medical_write"]} where pet_id = ${OWNER.petId} and provider_id = 1`;
    await asApp(VET.profileId, async (tx) => {
      expect((await tx.unsafe(noteSql(OWNER.petId, OWNER.profileId))).length).toBe(1);
    });
  });
});

describe("0149 — through the real routes", () => {
  it("POST /vet-record/notes: the owner and a family Editor succeed (anchored to the owner); a stranger and a caregiver are refused with no row written", async () => {
    const body = { petId: OWNER.petId, noteDate: "2026-11-20", note: "Checkup" };
    as(OWNER);
    const mine = await req("/vet-record/notes", "POST", body);
    expect(mine.status).toBe(200);
    expect((await mine.json()).note.created_by_role).toBe("owner");

    as(FAMILY);
    const fam = await req("/vet-record/notes", "POST", body);
    expect(fam.status).toBe(200);
    const famNote = (await fam.json()).note;
    expect(famNote.owner_user_id).toBe(OWNER.profileId);
    expect(famNote.created_by_role).toBe("editor");

    const before = await noteRows();
    for (const u of [OTHER, CARE]) {
      as(u);
      const res = await req("/vet-record/notes", "POST", body);
      expect([403, 404], `${u.username} status ${res.status}`).toContain(res.status);
    }
    expect(await noteRows()).toBe(before);
  });

  it("POST /providers/[id]/pets/[petId]/notes: staff with medical_write add an owner-anchored note; without a grant it is refused", async () => {
    as(VET);
    const body = { note: "Seen today", note_date: "2026-11-20" };
    const denied = await req(`/providers/1/pets/${OWNER.petId}/notes`, "POST", body);
    expect([403, 404]).toContain(denied.status);
    expect(await noteRows()).toBe(0);

    await seedGrant(raw, { petId: OWNER.petId, ownerUserId: OWNER.profileId, providerId: 1, scopes: ["medical_read", "medical_write"] });
    const ok = await req(`/providers/1/pets/${OWNER.petId}/notes`, "POST", body);
    expect(ok.status).toBe(201);
    expect((await ok.json()).note.owner_user_id).toBe(OWNER.profileId);
  });

  it("DELETE /vet-record/notes: a user cannot delete another user's note; the owner can", async () => {
    const id = await seedNote(OWNER.petId, OWNER.profileId);
    as(OTHER);
    await req(`/vet-record/notes?id=${id}`, "DELETE");
    expect(await noteRows()).toBe(1);
    as(OWNER);
    expect((await req(`/vet-record/notes?id=${id}`, "DELETE")).status).toBe(200);
    expect(await noteRows()).toBe(0);
  });
});

describe("verify_0149.sql", () => {
  it("every row reads PASS on the migrated database", async () => {
    const sqlText = await readFile(path.resolve(MIGRATIONS_DIR, "../verify_0149.sql"), "utf8");
    const rows = await raw.unsafe(sqlText);
    expect(rows.length).toBe(7);
    for (const r of rows as any[]) expect(r.status, r.check_name).toBe("PASS");
  });

  it("the migration is idempotent (re-applying it leaves one owner policy)", async () => {
    const text = await readFile(path.join(MIGRATIONS_DIR, "0149_vet_notes_owner_pet_check.sql"), "utf8");
    await raw.unsafe(text);
    await raw.unsafe(text);
    const n = await raw`select count(*)::int n from pg_policies where tablename = 'vet_notes' and policyname = 'vet_notes_owner_all'`;
    expect(n[0].n).toBe(1);
  });
});
