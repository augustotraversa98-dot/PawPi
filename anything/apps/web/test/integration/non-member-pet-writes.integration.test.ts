// A NON-MEMBER cannot insert, update or delete log / record rows for another user's pet (migration 0140 + two route checks).
//
// BACKGROUND (docs/family-sharing-audit-2026-11.md §A5, PR3). The own-row policies of 0022 / 0117 checked WHO wrote a row
// (owner_user_id = me) but not WHICH PET it pointed at, so any signed-in user could INSERT a row stamped to themselves against
// ANY pet_id, or UPDATE one of their rows to re-point pet_id at another dog. 0140 adds `AND app_owns_pet(pet_id)` to WITH CHECK
// on the 21 tables below. This file proves, as pawpi_app with real RLS, for EVERY one of them:
//   insert for another user's pet (stamped to self, stamped to the owner)  -> refused
//   update (re-point my row at their pet; edit their row)                  -> refused / zero rows
//   delete their row                                                       -> zero rows
//   select their row                                                       -> zero rows
//   …while the legitimate paths still work (owner on own pet; family anchored to the owner; caregiver append on the log tables).
// And the two API paths that could reach the gap before (PUT /api/routines, POST /api/health/reminder-dismissals).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" }; // owns a different dog; NOT a member of Rex
const FAMILY = { authUserId: 3, profileId: 3, username: "family" };
const CARE = { authUserId: 4, profileId: 4, username: "care" };
const REVOKED = { authUserId: 5, profileId: 5, username: "revoked" };

// table -> extra NOT NULL columns (name, SQL literal) so a minimal valid row can be built
const TABLES: Record<string, [string, string][]> = {
  health_food_logs: [],
  health_general_checks: [],
  health_medical_care_logs: [["status", "'given'"]],
  health_mobility_logs: [],
  health_pee_logs: [],
  health_photo_checks: [["body_area", "'paws'"], ["image_url", "'u'"]],
  health_poo_logs: [],
  health_vomit_logs: [],
  health_walk_logs: [],
  health_weight_logs: [["weight", "20"]],
  health_wellness_logs: [["check_type", "'general'"]],
  health_timeline_events: [["event_type", "'food'"], ["related_record_id", "1"], ["title", "'t'"], ["event_time", "now()"]],
  pet_allergies: [["allergen", "'a'"]],
  pet_conditions: [["condition", "'c'"]],
  pet_lab_results: [["test_name", "'t'"], ["test_date", "current_date"]],
  pet_surgeries: [["procedure", "'p'"], ["surgery_date", "current_date"]],
  vet_documents: [["name", "'n'"], ["document_type", "'x'"], ["file_url", "'u'"]],
  routines: [["routine_type", "'feeding'"]],
  reminder_dismissals: [["reminder_type", "'r'"], ["instance_key", "'k'"]],
  pet_medications: [["name", "'m'"]],
  pet_preventive_treatments: [["product_name", "'p'"]],
};
const NAMES = Object.keys(TABLES);
// the 12 log tables a CAREGIVER may append to (0139)
const LOG_TABLES = NAMES.filter((t) => t.startsWith("health_"));

let raw: Sql;
let app: Sql;
let api: any;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}
const insertSql = (t: string, petId: number, ownerId: number) => {
  const extra = TABLES[t];
  const cols = ["pet_id", "owner_user_id", ...extra.map((c) => c[0])].join(", ");
  const vals = [petId, ownerId, ...extra.map((c) => c[1])].map((v) => (typeof v === "number" ? String(v) : v)).join(", ");
  return `insert into ${t} (${cols}) values (${vals}) returning id`;
};
const seedRow = async (t: string, petId: number, ownerId: number): Promise<number> => (await raw.unsafe(insertSql(t, petId, ownerId)))[0].id;
const rowsOf = async (t: string) => Number((await raw.unsafe(`select count(*)::int n from ${t}`))[0].n);

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });

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
  for (const u of [FAMILY, CARE, REVOKED]) await seedUser(raw, u);
  await seedPetCaregiver(raw, { id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await seedPetCaregiver(raw, { id: 2, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: CARE.profileId, role: "caregiver" });
  await seedPetCaregiver(raw, { id: 3, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: REVOKED.profileId, role: "family", status: "revoked" });
  for (const t of ["pets", "pet_caregivers", ...NAMES]) {
    await raw.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), 10000)`);
  }
});

describe("0140 — a non-member cannot write rows against another user's pet (direct SQL as pawpi_app, all 21 tables)", () => {
  for (const t of NAMES) {
    it(`${t}: insert / update / delete / select against the owner's pet are all refused or empty`, async () => {
      const ownerRow = await seedRow(t, OWNER.petId, OWNER.profileId); // a real row on Rex
      const otherRow = await seedRow(t, OTHER.petId, OTHER.profileId); // OTHER's own row on Duke

      // INSERT stamped to MYSELF against someone else's pet — the pre-0140 hole
      await expect(asApp(OTHER.profileId, (tx) => tx.unsafe(insertSql(t, OWNER.petId, OTHER.profileId))), `${t} insert as self`).rejects.toThrow(/row-level security/i);
      // INSERT impersonating the owner
      await expect(asApp(OTHER.profileId, (tx) => tx.unsafe(insertSql(t, OWNER.petId, OWNER.profileId))), `${t} insert as owner`).rejects.toThrow(/row-level security/i);
      // UPDATE my own row so it points at the owner's pet — the other half of the hole
      await expect(asApp(OTHER.profileId, (tx) => tx.unsafe(`update ${t} set pet_id = ${OWNER.petId} where id = ${otherRow} returning id`)), `${t} re-point`).rejects.toThrow(/row-level security/i);
      // UPDATE / DELETE / SELECT the owner's row: invisible, so nothing happens
      await asApp(OTHER.profileId, async (tx) => {
        expect(await tx.unsafe(`update ${t} set pet_id = ${OTHER.petId} where id = ${ownerRow} returning id`), `${t} update theirs`).toHaveLength(0);
        expect(await tx.unsafe(`delete from ${t} where id = ${ownerRow} returning id`), `${t} delete theirs`).toHaveLength(0);
        expect(await tx.unsafe(`select id from ${t} where id = ${ownerRow}`), `${t} select theirs`).toHaveLength(0);
      });
      // ground truth: the owner's row is untouched, still on Rex, and nothing new appeared
      const left = await raw.unsafe(`select id, pet_id, owner_user_id from ${t} order by id`);
      expect(left.map((r: any) => [r.id, r.pet_id, r.owner_user_id])).toEqual([
        [ownerRow, OWNER.petId, OWNER.profileId],
        [otherRow, OTHER.petId, OTHER.profileId],
      ]);
    });
  }

  it("the same refusals hold for a REVOKED member and for a user with no identity", async () => {
    for (const t of NAMES) {
      await expect(asApp(REVOKED.profileId, (tx) => tx.unsafe(insertSql(t, OWNER.petId, REVOKED.profileId))), `${t} revoked as self`).rejects.toThrow(/row-level security/i);
      await expect(asApp(REVOKED.profileId, (tx) => tx.unsafe(insertSql(t, OWNER.petId, OWNER.profileId))), `${t} revoked as owner`).rejects.toThrow(/row-level security/i);
      await expect(asApp(null, (tx) => tx.unsafe(insertSql(t, OWNER.petId, OWNER.profileId))), `${t} anonymous`).rejects.toThrow(/row-level security/i);
    }
    expect(await rowsOf("health_food_logs")).toBe(0);
  });
});

describe("0140 — the legitimate paths still work", () => {
  for (const t of NAMES) {
    it(`${t}: the OWNER inserts, edits and deletes rows on their own pet`, async () => {
      await asApp(OWNER.profileId, async (tx) => {
        const [ins] = await tx.unsafe(insertSql(t, OWNER.petId, OWNER.profileId));
        expect(ins.id).toBeTruthy();
        expect(await tx.unsafe(`update ${t} set pet_id = ${OWNER.petId} where id = ${ins.id} returning id`)).toHaveLength(1);
        expect(await tx.unsafe(`delete from ${t} where id = ${ins.id} returning id`)).toHaveLength(1);
      });
    });
  }

  it("FAMILY still writes owner-anchored rows through 0049's *_family_all (health logs, vet-record, routines, dismissals)", async () => {
    const familyTables = NAMES.filter((t) => t !== "pet_medications" && t !== "pet_preventive_treatments"); // those two have no family policy yet
    for (const t of familyTables) {
      await asApp(FAMILY.profileId, async (tx) => {
        expect((await tx.unsafe(insertSql(t, OWNER.petId, OWNER.profileId))).length, t).toBe(1);
      });
    }
  });

  it("a CAREGIVER still appends owner-anchored rows to the 12 log tables (0139) — and only those", async () => {
    for (const t of LOG_TABLES) {
      await asApp(CARE.profileId, async (tx) => {
        expect((await tx.unsafe(insertSql(t, OWNER.petId, OWNER.profileId))).length, t).toBe(1);
      });
    }
    for (const t of NAMES.filter((n) => !LOG_TABLES.includes(n))) {
      await expect(asApp(CARE.profileId, (tx) => tx.unsafe(insertSql(t, OWNER.petId, OWNER.profileId))), `${t} caregiver`).rejects.toThrow(/row-level security/i);
    }
  });
});

describe("the two API paths that could reach the gap before are closed at the route too", () => {
  it("PUT /api/routines cannot move a routine onto another user's pet (403), and the row is unchanged", async () => {
    const mine = await seedRow("routines", OTHER.petId, OTHER.profileId);
    as(OTHER);
    const res = await req("/routines", "PUT", { id: mine, petId: OWNER.petId, title: "moved" });
    expect(res.status).toBe(403);
    const [row] = await raw`select pet_id, title from routines where id = ${mine}`;
    expect(row.pet_id).toBe(OTHER.petId);
    expect(row.title).not.toBe("moved");
    // moving onto their OWN other pet, or editing in place, still works
    expect((await req("/routines", "PUT", { id: mine, petId: OTHER.petId, title: "fine" })).status).toBe(200);
    expect((await req("/routines", "PUT", { id: mine, title: "fine2" })).status).toBe(200);
  });

  it("POST /api/health/reminder-dismissals refuses a pet the caller does not own (403) and writes nothing; own pet works", async () => {
    as(OTHER);
    const bad = await req("/health/reminder-dismissals", "POST", { petId: OWNER.petId, reminderType: "feeding", instanceKey: "k1", scheduledDate: "2026-11-20" });
    expect(bad.status).toBe(403);
    expect(await rowsOf("reminder_dismissals")).toBe(0);
    const ok = await req("/health/reminder-dismissals", "POST", { petId: OTHER.petId, reminderType: "feeding", instanceKey: "k1", scheduledDate: "2026-11-20" });
    expect([200, 201]).toContain(ok.status);
    expect(await rowsOf("reminder_dismissals")).toBe(1);
  });

  it("every health log POST by a non-member is a 403 and creates no row on the owner's pet", async () => {
    as(OTHER);
    const posts: [string, any][] = [
      ["/health/food-logs", { petId: OWNER.petId, mealType: "dinner", foodName: "x" }],
      ["/health/walk-logs", { petId: OWNER.petId, durationMinutes: 5 }],
      ["/health/pee-logs", { petId: OWNER.petId }],
      ["/health/poo-logs", { petId: OWNER.petId }],
      ["/health/vomit-logs", { petId: OWNER.petId }],
      ["/health/weight-logs", { petId: OWNER.petId, weight: 20, weightUnit: "kg" }],
      ["/health/wellness-logs", { petId: OWNER.petId, checkType: "general" }],
      ["/health/general-checks", { petId: OWNER.petId, mood: "ok" }],
      ["/health/medical-care-logs", { petId: OWNER.petId, status: "given" }],
      ["/health/photo-checks", { petId: OWNER.petId, bodyArea: "paws", imageUrl: "u" }],
      ["/vet-record/allergies", { petId: OWNER.petId, allergen: "x" }],
    ];
    for (const [path, body] of posts) expect((await req(path, "POST", body)).status, path).toBe(403);
    for (const t of LOG_TABLES) expect(await rowsOf(t), t).toBe(0);
  });
});
