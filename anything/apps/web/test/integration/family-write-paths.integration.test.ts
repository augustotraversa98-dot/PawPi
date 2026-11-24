// Family / co-owner WRITE paths — PR 3b of the Family & caregivers series. Proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app, with an OWNER, a FAMILY co-owner who owns no dog, a CAREGIVER, an OUTSIDER (owns another dog), and a REVOKED,
// an EXPIRED and a PENDING member.
//
// Owner decision 2 (2026-11-23): FAMILY reads and writes routines, the pet profile, the medical profile, meds, preventive care, vaccines
// (including the "recorded as given" path that also writes pet_vaccinations) and appointments. A CAREGIVER stays read + log only.
// Managing sharing and deleting the pet stay owner-only. Every row a family member writes is anchored to the pet's OWNER.
//
//   A. per area: owner + family allowed; caregiver / outsider / revoked / expired / pending refused — and nothing leaks into a row
//      stamped to the family member (they own no dog).
//   B. owner-only things stay owner-only.
//   C. RLS directly (pawpi_app): family inserts/updates/deletes owner-anchored rows; a mis-anchored or caregiver/outsider write is refused.
//   D. migration 0141 absent: friendly 403 / 404, never a 500; owner and caregiver unaffected.
//   E. old builds: the owner paths behave exactly as before (statuses, created_by_role 'owner').

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver, seedRoutineRow, seedMedicalProfile } from "./db";
import { MIGRATIONS_DIR } from "./migrate";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const FAMILY = { authUserId: 2, profileId: 2, username: "family" };
const CARE = { authUserId: 3, profileId: 3, username: "care" };
const OUTSIDER = { authUserId: 4, profileId: 4, username: "outsider", petId: 2, petName: "Duke" };
const REVOKED = { authUserId: 5, profileId: 5, username: "revoked" };
const EXPIRED = { authUserId: 6, profileId: 6, username: "expired" };
const PENDING = { authUserId: 7, profileId: 7, username: "pending" };
const PET = OWNER.petId;
const PAST = "2000-01-01T00:00:00Z";
const ALLOWED = [OWNER, FAMILY];
const DENIED = [CARE, OUTSIDER, REVOKED, EXPIRED, PENDING];

let raw: Sql;
let app: Sql;
let api: any;

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
function req(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
const json = async (r: Response) => r.json();
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}
const grant = (id: number, u: { profileId: number }, role: "family" | "caregiver", extra: object = {}) =>
  seedPetCaregiver(raw, { id, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: u.profileId, role, ...extra });
const MIG_0141 = () => readFileSync(join(MIGRATIONS_DIR, "0141_family_write_policies.sql"), "utf8");

// tables a family member writes to (and where their rows must be anchored to the owner, never to them)
const WRITE_TABLES = ["routines", "pet_medications", "pet_preventive_treatments", "pet_vaccinations", "vet_appointments", "pet_medical_profiles", "health_weight_logs", "health_food_logs"];

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
  await seedOwnerWithPet(raw, OUTSIDER);
  for (const u of [FAMILY, CARE, REVOKED, EXPIRED, PENDING]) await seedUser(raw, u);
  await seedRoutineRow(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId });
  await seedMedicalProfile(raw, { profileRowId: 1, petId: PET, ownerUserId: OWNER.profileId });
  await raw`insert into pet_medications (id, pet_id, owner_user_id, name) values (1, ${PET}, ${OWNER.profileId}, 'Apoquel')`;
  await raw`insert into pet_preventive_treatments (id, pet_id, owner_user_id, product_name) values (1, ${PET}, ${OWNER.profileId}, 'NexGard')`;
  await raw`insert into pet_vaccinations (id, pet_id, owner_user_id, name) values (1, ${PET}, ${OWNER.profileId}, 'Rabies')`;
  await raw`insert into vet_appointments (id, pet_id, owner_user_id, title, appointment_date, appointment_time) values (1, ${PET}, ${OWNER.profileId}, 'Checkup', '2099-01-01', '10:00')`;
  for (const t of ["pets", "pet_caregivers", "routines", "pet_medications", "pet_preventive_treatments", "pet_vaccinations", "vet_appointments", "pet_medical_profiles", "health_weight_logs", "health_medical_care_logs"]) {
    await raw.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), 10000)`);
  }
  await grant(1, FAMILY, "family");
  await grant(2, CARE, "caregiver");
  await grant(3, REVOKED, "family", { status: "revoked" });
  await grant(4, EXPIRED, "family", { expiresAt: PAST });
  await grant(5, PENDING, "family", { status: "pending" });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A1. routines — create / edit / move / delete", () => {
  const create = (u: any) => { as(u); return req("/routines", "POST", { petId: PET, type: "feeding", title: `by-${u.username}` }); };

  it("OWNER and FAMILY create a routine, anchored to the OWNER; everyone else is refused", async () => {
    for (const u of ALLOWED) expect([200, 201], u.username).toContain((await create(u)).status);
    expect((await raw`select distinct owner_user_id from routines where title like 'by-%'`).map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
    for (const u of DENIED) expect((await create(u)).status, u.username).toBeGreaterThanOrEqual(400);
    expect(await raw`select id from routines where title like 'by-%'`).toHaveLength(2);
  });

  it("FAMILY edits and soft-deletes the owner's routine (owner stays the owner); a caregiver cannot", async () => {
    as(FAMILY);
    expect((await req("/routines", "PUT", { id: 1, title: "family-edit" })).status).toBe(200);
    expect((await raw`select title, owner_user_id from routines where id = 1`)[0]).toMatchObject({ title: "family-edit", owner_user_id: OWNER.profileId });
    for (const u of DENIED) {
      as(u);
      expect((await req("/routines", "PUT", { id: 1, title: "x" })).status, `${u.username} PUT`).toBe(403);
      expect((await req("/routines?id=1", "DELETE")).status, `${u.username} DELETE`).toBe(403);
    }
    as(FAMILY);
    expect((await req("/routines?id=1", "DELETE")).status).toBe(200);
    expect((await raw`select deleted_at, owner_user_id from routines where id = 1`)[0].deleted_at).not.toBeNull();
  });

  it("a routine can move between dogs of the SAME owner, never onto someone else's dog (family included)", async () => {
    await raw`insert into pets (id, owner_user_id, name, handle) values (20, ${OWNER.profileId}, 'Rex2', 'rex2')`;
    as(FAMILY);
    expect((await req("/routines", "PUT", { id: 1, petId: OUTSIDER.petId })).status).toBe(403);
    expect((await raw`select pet_id from routines where id = 1`)[0].pet_id).toBe(PET);
    // family has no grant on dog 20 (owner's second dog) -> refused too; the owner may
    expect((await req("/routines", "PUT", { id: 1, petId: 20 })).status).toBe(403);
    as(OWNER);
    expect((await req("/routines", "PUT", { id: 1, petId: 20 })).status).toBe(200);
  });

  it("GET (read) is unchanged: owner, family and caregiver read; outsider/revoked/expired/pending are refused", async () => {
    for (const u of [OWNER, FAMILY, CARE]) { as(u); expect((await req(`/routines?petId=${PET}`)).status, u.username).toBe(200); }
    for (const u of [OUTSIDER, REVOKED, EXPIRED, PENDING]) { as(u); expect((await req(`/routines?petId=${PET}`)).status, u.username).toBe(403); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A2. pet profile (PATCH) and medical profile", () => {
  it("FAMILY edits the pet profile (name, breed, handle, avatar, notes); the owner is unchanged; caregiver/outsider/revoked/expired/pending get 404", async () => {
    as(FAMILY);
    const r = await req(`/pets/${PET}`, "PATCH", { name: "Rexy", breed: "Lab", handle: "rexy_the_dog", avatar_url: "https://example.com/a.jpg", notes: "good boy", owner_user_id: FAMILY.profileId });
    expect(r.status).toBe(200);
    const [row] = await raw`select name, breed, handle, avatar_url, notes, owner_user_id from pets where id = ${PET}`;
    expect(row).toMatchObject({ name: "Rexy", breed: "Lab", handle: "rexy_the_dog", notes: "good boy", owner_user_id: OWNER.profileId });
    for (const u of DENIED) {
      as(u);
      expect((await req(`/pets/${PET}`, "PATCH", { name: "Hijack" })).status, u.username).toBe(404);
    }
    expect((await raw`select name from pets where id = ${PET}`)[0].name).toBe("Rexy");
  });

  it("a weight edit by FAMILY is logged anchored to the OWNER's history", async () => {
    await raw`insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit) values (${PET}, ${OWNER.profileId}, 20, 'kg')`;
    as(FAMILY);
    expect((await req(`/pets/${PET}`, "PATCH", { weight: 22, weight_unit: "kg" })).status).toBe(200);
    expect((await raw`select distinct owner_user_id from health_weight_logs where pet_id = ${PET}`).map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
    expect(Number((await raw`select weight from health_weight_logs where pet_id = ${PET} order by logged_at desc, id desc limit 1`)[0].weight)).toBe(22);
  });

  it("pet GET by id: owner, family AND caregiver read it (read access); outsider/revoked/expired/pending 404", async () => {
    for (const u of [OWNER, FAMILY, CARE]) { as(u); expect((await req(`/pets/${PET}`)).status, u.username).toBe(200); }
    for (const u of [OUTSIDER, REVOKED, EXPIRED, PENDING]) { as(u); expect((await req(`/pets/${PET}`)).status, u.username).toBe(404); }
  });

  it("medical profile: FAMILY updates the existing profile and CREATES one for a dog that has none, anchored to the owner; caregiver refused", async () => {
    as(FAMILY);
    expect((await req("/pet-medical-profiles", "POST", { petId: PET, microchipId: "family-chip", primaryVetName: "Dr. F" })).status).toBe(200);
    expect((await raw`select microchip_id, primary_vet_name, owner_user_id from pet_medical_profiles where pet_id = ${PET}`)[0]).toMatchObject({ microchip_id: "family-chip", primary_vet_name: "Dr. F", owner_user_id: OWNER.profileId });
    await raw`delete from pet_medical_profiles where pet_id = ${PET}`; // now a first-time INSERT by family
    expect((await req("/pet-medical-profiles", "POST", { petId: PET, microchipId: "fresh" })).status).toBe(200);
    expect((await raw`select owner_user_id from pet_medical_profiles where pet_id = ${PET}`).map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
    for (const u of DENIED) {
      as(u);
      expect((await req("/pet-medical-profiles", "POST", { petId: PET, microchipId: "evil" })).status, u.username).toBeGreaterThanOrEqual(400);
    }
    expect((await raw`select microchip_id from pet_medical_profiles where pet_id = ${PET}`)[0].microchip_id).toBe("fresh");
  });

  it("deleting the pet and managing sharing stay owner-only (no route for a grantee; family cannot invite or revoke)", async () => {
    as(FAMILY);
    expect((await req(`/pets/${PET}`, "DELETE")).status).toBeGreaterThanOrEqual(404);
    expect((await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: OUTSIDER.username })).status).toBe(403);
    expect((await req("/pet-caregivers/2", "DELETE")).status).toBe(404);
    expect(await raw`select id from pets where id = ${PET}`).toHaveLength(1);
    expect((await raw`select status from pet_caregivers where id = 2`)[0].status).toBe("active");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A3. meds, preventive care, vaccines, appointments", () => {
  const AREAS = [
    { name: "medications", path: "/health/medications", table: "pet_medications", create: { petId: PET, name: "Metacam" }, patch: { id: 1, dose: "5mg" }, attributed: true },
    { name: "preventive treatments", path: "/health/preventive-treatments", table: "pet_preventive_treatments", create: { petId: PET, productName: "Bravecto" }, patch: { id: 1, notes: "monthly" }, attributed: false },
    { name: "vaccinations", path: "/pet-vaccinations", table: "pet_vaccinations", create: { petId: PET, name: "Parvo", dateGiven: "2026-01-01" }, patch: { id: 1, notes: "booster" }, attributed: true },
  ] as const;

  for (const a of AREAS) {
    it(`${a.name}: OWNER and FAMILY create / edit / delete (rows anchored to the owner, created_by_role set); everyone else refused`, async () => {
      as(OWNER);
      const own = await req(a.path, "POST", a.create);
      expect(own.status).toBe(201);
      if (a.attributed) expect((await raw.unsafe(`select created_by_role from ${a.table} order by id desc limit 1`))[0].created_by_role).toBe("owner");

      as(FAMILY);
      const fam = await req(a.path, "POST", a.create);
      expect(fam.status, `${a.name} family create`).toBe(201);
      expect((await raw.unsafe(`select owner_user_id from ${a.table} order by id desc limit 1`))[0].owner_user_id).toBe(OWNER.profileId); // anchored to the pet's owner…
      if (a.attributed) {
        const row = (await raw.unsafe(`select created_by_user_id, created_by_role from ${a.table} order by id desc limit 1`))[0];
        expect([row.created_by_user_id, row.created_by_role]).toEqual([FAMILY.profileId, "editor"]); // …but attributed to who actually wrote it
      }
      expect((await req(a.path, "PATCH", a.patch)).status, `${a.name} family patch`).toBe(200);
      expect((await req(`${a.path}?id=1`, "DELETE")).status, `${a.name} family delete`).toBe(200);
      expect((await raw.unsafe(`select deleted_at from ${a.table} where id = 1`))[0].deleted_at).not.toBeNull();

      for (const u of DENIED) {
        as(u);
        expect((await req(a.path, "POST", a.create)).status, `${a.name} ${u.username} create`).toBeGreaterThanOrEqual(400);
        expect((await req(a.path, "PATCH", { ...a.patch, id: 2 })).status, `${a.name} ${u.username} patch`).toBeGreaterThanOrEqual(400);
        expect((await req(`${a.path}?id=2`, "DELETE")).status, `${a.name} ${u.username} delete`).toBeGreaterThanOrEqual(400);
      }
      expect(await raw.unsafe(`select id from ${a.table} where owner_user_id = ${FAMILY.profileId}`)).toHaveLength(0); // nothing stamped to the family member
    });
  }

  it("vaccinations are READABLE by family but NOT by a caregiver (the vet record stays closed to caregivers)", async () => {
    as(FAMILY);
    expect((await json(await req(`/pet-vaccinations?petId=${PET}`))).vaccinations).toHaveLength(1);
    as(OWNER);
    expect((await json(await req(`/pet-vaccinations?petId=${PET}`))).vaccinations).toHaveLength(1);
    for (const u of [CARE, OUTSIDER, REVOKED, EXPIRED, PENDING]) {
      as(u);
      expect((await json(await req(`/pet-vaccinations?petId=${PET}`))).vaccinations ?? [], u.username).toHaveLength(0);
    }
  });

  it("appointments: OWNER and FAMILY list / create / edit / cancel (anchored to the owner); caregiver and non-members refused; caregiver reads none", async () => {
    const newAppt = { petId: PET, title: "Vaccines", appointmentDate: "2099-02-02", appointmentTime: "11:30" };
    as(FAMILY);
    expect((await json(await req(`/vet-appointments?petId=${PET}`))).appointments).toHaveLength(1);
    const made = await req("/vet-appointments", "POST", newAppt);
    expect([200, 201]).toContain(made.status);
    expect((await raw`select distinct owner_user_id from vet_appointments`).map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
    expect((await req("/vet-appointments", "PUT", { id: 1, title: "Moved by family", appointmentDate: "2099-03-03" })).status).toBe(200);
    expect((await raw`select title, owner_user_id from vet_appointments where id = 1`)[0]).toMatchObject({ title: "Moved by family", owner_user_id: OWNER.profileId });
    expect((await req("/vet-appointments?id=1", "DELETE")).status).toBe(200);
    expect((await raw`select deleted_at from vet_appointments where id = 1`)[0].deleted_at).not.toBeNull();
    for (const u of DENIED) {
      as(u);
      expect((await req("/vet-appointments", "POST", newAppt)).status, `${u.username} create`).toBeGreaterThanOrEqual(400);
      expect((await req("/vet-appointments", "PUT", { id: 2, title: "x" })).status, `${u.username} edit`).toBeGreaterThanOrEqual(400);
      expect((await req("/vet-appointments?id=2", "DELETE")).status, `${u.username} delete`).toBeGreaterThanOrEqual(400);
      expect((await json(await req(`/vet-appointments?petId=${PET}`))).appointments ?? [], `${u.username} list`).toHaveLength(0);
    }
  });

  it("the 'recorded as given' vaccine path: OWNER and FAMILY write the log AND the vaccination (anchored to the owner); a CAREGIVER gets a friendly 403 vaccine_family_only", async () => {
    const vaccine = { petId: PET, careType: "vaccine", name: "Rabies", status: "completed" };
    as(FAMILY);
    expect((await req("/health/medical-care-logs", "POST", vaccine)).status).toBe(201);
    as(OWNER);
    expect((await req("/health/medical-care-logs", "POST", { ...vaccine, name: "Distemper" })).status).toBe(201);
    expect((await raw`select distinct owner_user_id from pet_vaccinations where name in ('Rabies','Distemper') and source_medical_care_log_id is not null`).map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
    expect((await raw`select owner_user_id from health_medical_care_logs where name = 'Rabies'`)[0].owner_user_id).toBe(OWNER.profileId);

    as(CARE);
    const c = await req("/health/medical-care-logs", "POST", { ...vaccine, name: "Lepto" });
    expect(c.status).toBe(403);
    expect((await json(c)).code).toBe("vaccine_family_only");
    for (const u of [OUTSIDER, REVOKED, EXPIRED, PENDING]) { as(u); expect((await req("/health/medical-care-logs", "POST", { ...vaccine, name: "Lepto" })).status, u.username).toBe(403); }
    expect(await raw`select id from pet_vaccinations where name = 'Lepto'`).toHaveLength(0);
    // a caregiver still logs a NON-vaccine completion (log + complete)
    as(CARE);
    expect((await req("/health/medical-care-logs", "POST", { petId: PET, careType: "medication", name: "Apoquel", status: "given" })).status).toBe(201);
  });

  it("revoke / expiry are immediate for every write above", async () => {
    as(OWNER);
    await req("/pet-caregivers/1", "DELETE"); // revoke FAMILY
    as(FAMILY);
    expect((await req("/health/medications", "POST", { petId: PET, name: "x" })).status).toBeGreaterThanOrEqual(400);
    expect((await req("/routines", "PUT", { id: 1, title: "x" })).status).toBe(403);
    expect((await req(`/pets/${PET}`, "PATCH", { name: "x" })).status).toBe(404);
    expect((await req("/vet-appointments", "PUT", { id: 1, title: "x" })).status).toBeGreaterThanOrEqual(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("C. RLS directly as pawpi_app", () => {
  const INSERTS: Record<string, (owner: number) => string> = {
    pet_medications: (o) => `insert into pet_medications (pet_id, owner_user_id, name) values (${PET}, ${o}, 'm') returning id`,
    pet_preventive_treatments: (o) => `insert into pet_preventive_treatments (pet_id, owner_user_id, product_name) values (${PET}, ${o}, 'p') returning id`,
    pet_vaccinations: (o) => `insert into pet_vaccinations (pet_id, owner_user_id, name) values (${PET}, ${o}, 'v') returning id`,
    vet_appointments: (o) => `insert into vet_appointments (pet_id, owner_user_id, title, appointment_date, appointment_time) values (${PET}, ${o}, 't', '2099-01-01', '09:00') returning id`,
  };

  for (const [t, ins] of Object.entries(INSERTS)) {
    it(`${t}: family inserts/updates/deletes owner-anchored rows; a row stamped to the family member, a caregiver, an outsider, revoked/expired/pending writes are refused (0141)`, async () => {
      await asApp(FAMILY.profileId, async (tx) => {
        const [r] = await tx.unsafe(ins(OWNER.profileId));
        expect(r.id).toBeTruthy();
        expect(await tx.unsafe(`update ${t} set updated_at = now() where id = ${r.id} returning id`)).toHaveLength(1);
        expect(await tx.unsafe(`delete from ${t} where id = ${r.id} returning id`)).toHaveLength(1);
      });
      await expect(asApp(FAMILY.profileId, (tx) => tx.unsafe(ins(FAMILY.profileId))), "stamped to family").rejects.toThrow(/row-level security/i);
      for (const u of [CARE, OUTSIDER, REVOKED, EXPIRED, PENDING]) {
        await expect(asApp(u.profileId, (tx) => tx.unsafe(ins(OWNER.profileId))), `${t} ${u.username} as owner`).rejects.toThrow(/row-level security/i);
      }
      // a caregiver also cannot READ vaccines / appointments (meds + preventive are readable by any grantee via 0139)
      const readable = t === "pet_medications" || t === "pet_preventive_treatments";
      await asApp(CARE.profileId, async (tx) => {
        expect((await tx.unsafe(`select id from ${t} where pet_id = ${PET}`)).length > 0, `${t} caregiver read`).toBe(readable);
      });
    });
  }

  it("pet_medical_profiles: family INSERT (owner-anchored) is allowed once; mis-anchored / caregiver / outsider are refused", async () => {
    await raw`delete from pet_medical_profiles`;
    await asApp(FAMILY.profileId, async (tx) => {
      expect(await tx`insert into pet_medical_profiles (pet_id, owner_user_id, microchip_id) values (${PET}, ${OWNER.profileId}, 'f') returning id`).toHaveLength(1);
    });
    await raw`delete from pet_medical_profiles`;
    await expect(asApp(FAMILY.profileId, (tx) => tx`insert into pet_medical_profiles (pet_id, owner_user_id, microchip_id) values (${PET}, ${FAMILY.profileId}, 'x')`)).rejects.toThrow(/row-level security/i);
    for (const u of [CARE, OUTSIDER, REVOKED, EXPIRED]) {
      await expect(asApp(u.profileId, (tx) => tx`insert into pet_medical_profiles (pet_id, owner_user_id, microchip_id) values (${PET}, ${OWNER.profileId}, 'x')`), u.username).rejects.toThrow(/row-level security/i);
    }
  });

  it("the pet row: family can UPDATE the profile columns but cannot move the pet to themselves or delete it (0049 trigger / no delete policy)", async () => {
    await asApp(FAMILY.profileId, async (tx) => {
      expect(await tx`update pets set breed = 'Lab' where id = ${PET} returning id`).toHaveLength(1);
      expect(await tx`delete from pets where id = ${PET} returning id`).toHaveLength(0);
    });
    await expect(asApp(FAMILY.profileId, (tx) => tx`update pets set owner_user_id = ${FAMILY.profileId} where id = ${PET}`)).rejects.toThrow(/transfer ownership/i);
    await asApp(CARE.profileId, async (tx) => {
      expect(await tx`update pets set breed = 'Hijack' where id = ${PET} returning id`).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("D. migration 0141 not applied: friendly 403 / 404, never a 500", () => {
  it("family gets `family_write_unavailable` creating meds/preventive/vaccines/appointments/medical profile, and 404 editing existing rows; owner + caregiver unaffected", async () => {
    const drop = async () => {
      for (const t of ["pet_medications", "pet_preventive_treatments", "pet_vaccinations", "vet_appointments"]) await raw.unsafe(`drop policy if exists ${t}_family_all on ${t}`);
      await raw.unsafe("drop policy if exists pet_medical_profiles_family_insert on pet_medical_profiles");
    };
    try {
      await drop();
      as(FAMILY);
      const creates: [string, any][] = [
        ["/health/medications", { petId: PET, name: "x" }],
        ["/health/preventive-treatments", { petId: PET, productName: "x" }],
        ["/pet-vaccinations", { petId: PET, name: "x" }],
        ["/vet-appointments", { petId: PET, title: "x", appointmentDate: "2099-01-01", appointmentTime: "10:00" }],
      ];
      for (const [path, body] of creates) {
        const r = await req(path, "POST", body);
        expect(r.status, path).toBe(403);
        expect((await json(r)).code, path).toBe("family_write_unavailable");
      }
      await raw`delete from pet_medical_profiles`;
      const mp = await req("/pet-medical-profiles", "POST", { petId: PET, microchipId: "x" });
      expect(mp.status).toBe(403);
      expect((await json(mp)).code).toBe("family_write_unavailable");
      const vac = await req("/health/medical-care-logs", "POST", { petId: PET, careType: "vaccine", name: "Rabies", status: "completed" });
      expect(vac.status).toBe(403);
      expect((await json(vac)).code).toBe("family_write_unavailable");
      expect((await req("/health/medications", "PATCH", { id: 1, dose: "9" })).status).toBe(404); // edits match zero rows
      expect((await req("/vet-appointments?id=1", "DELETE")).status).toBe(404);
      // owner is unaffected, and a caregiver still logs non-vaccine care
      as(OWNER);
      expect((await req("/health/medications", "POST", { petId: PET, name: "own" })).status).toBe(201);
      expect((await req("/pet-vaccinations", "POST", { petId: PET, name: "own" })).status).toBe(201);
      expect((await req("/pet-medical-profiles", "POST", { petId: PET, microchipId: "own" })).status).toBe(200);
      as(CARE);
      expect((await req("/health/medical-care-logs", "POST", { petId: PET, careType: "medication", name: "Apoquel", status: "given" })).status).toBe(201);
    } finally {
      await raw.unsafe(MIG_0141()); // the whole run shares ONE cluster: restore exactly what production would have
    }
    as(FAMILY);
    expect((await req("/health/medications", "POST", { petId: PET, name: "back" })).status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("E. old builds / invariants", () => {
  it("OWNER paths are unchanged: same statuses, created_by_role 'owner', rows stamped to the owner", async () => {
    as(OWNER);
    expect((await req("/health/medications", "POST", { petId: PET, name: "m" })).status).toBe(201);
    expect((await req("/health/preventive-treatments", "POST", { petId: PET, productName: "p" })).status).toBe(201);
    expect((await req("/pet-vaccinations", "POST", { petId: PET, name: "v" })).status).toBe(201);
    expect((await req("/vet-appointments", "POST", { petId: PET, title: "a", appointmentDate: "2099-01-01", appointmentTime: "10:00" })).status).toBeLessThan(300);
    expect((await req("/routines", "POST", { petId: PET, type: "feeding", title: "r" })).status).toBeLessThan(300);
    expect((await req(`/pets/${PET}`, "PATCH", { notes: "n" })).status).toBe(200);
    expect((await raw`select created_by_role from pet_medications order by id desc limit 1`)[0].created_by_role).toBe("owner");
    expect((await raw`select created_by_role from pet_vaccinations order by id desc limit 1`)[0].created_by_role).toBe("owner");
  });

  it("a stranger POSTing for the owner's dog still gets the old 404 'Pet not found' on the add routes (no new information)", async () => {
    as(OUTSIDER);
    for (const [path, body] of [["/health/medications", { petId: PET, name: "x" }], ["/health/preventive-treatments", { petId: PET, productName: "x" }], ["/pet-vaccinations", { petId: PET, name: "x" }]] as const) {
      expect((await req(path, "POST", body)).status, path).toBe(404);
    }
  });

  it("across everything the family member did, NOTHING is stamped to them and NO pet row was created", async () => {
    as(FAMILY);
    await req("/health/medications", "POST", { petId: PET, name: "f" });
    await req("/pet-vaccinations", "POST", { petId: PET, name: "f" });
    await req("/routines", "POST", { petId: PET, type: "feeding", title: "f" });
    await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "f" });
    await req(`/pets/${PET}`, "PATCH", { weight: 25, weight_unit: "kg" });
    for (const t of WRITE_TABLES) expect(await raw.unsafe(`select id from ${t} where owner_user_id = ${FAMILY.profileId}`), t).toHaveLength(0);
    expect(await raw`select id from pets where owner_user_id = ${FAMILY.profileId}`).toHaveLength(0);
    expect(Number((await raw`select count(*)::int n from pets`)[0].n)).toBe(2);
  });
});
