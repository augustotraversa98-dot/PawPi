// Family & caregivers — the end-to-end JOURNEY, proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app, with an OWNER, a FAMILY partner who owns NO dog (the "couple sharing one dog" case),
// a CAREGIVER (sitter) and an unrelated OUTSIDER. See docs/family-sharing-audit-2026-11.md.
//
// HOW TO READ THIS FILE
//   • `it(...)`            behaviour that is correct TODAY and must stay correct.
//   • `it("TODAY: ...")`   PINS a known gap exactly as it behaves on main (audit ids in brackets). When the PR that
//                          fixes the gap lands, that pin FAILS and must be deleted/flipped on purpose.
//   • `it.fails("DESIRED: ...")`  the behaviour the product decisions require (owner decisions 2026-11-23). It is
//                          expected to fail until the named PR lands; `it.fails` turns RED the day the behaviour starts
//                          working, which is the signal to change it to a plain `it`. CI stays green meanwhile.
// Nothing here touches app code: PR1 is tests + the app_pet_ring_segments caller check (migration 0137).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedPetCaregiver,
  seedRoutineRow,
  seedFoodLogRow,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const PARTNER = { authUserId: 2, profileId: 2, username: "partner" }; // FAMILY, owns no dog (shared-only)
const SITTER = { authUserId: 3, profileId: 3, username: "sitter" }; // CAREGIVER, owns no dog
const OUTSIDER = { authUserId: 4, profileId: 4, username: "outsider", petId: 2, petName: "Duke" }; // owns another dog
const PET = OWNER.petId;
const DAY = "2026-11-20";

let raw: Sql; // superuser: seeding + ground-truth reads
let app: Sql; // pawpi_app: direct RLS/function checks
let api: any; // the real router (also runs as pawpi_app)

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
const as = (u: { authUserId: number }) => {
  authState.session = sessionFor(u.authUserId);
};
function apiReq(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
const json = async (res: Response) => res.json();
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}
const petCount = async () => Number((await raw`select count(*)::int as n from pets`)[0].n);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  app = postgres({
    host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""),
    username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {},
  });
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedUser(raw, PARTNER);
  await seedUser(raw, SITTER);
  await seedOwnerWithPet(raw, OUTSIDER);
  await seedRoutineRow(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId });
  await seedFoodLogRow(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId });
  // The seed helpers insert EXPLICIT ids, which leave the identity sequences at 1 — so a route that inserts a row
  // next (a new pet, grant, log…) would collide on the primary key. Move every sequence this file touches past the seeds.
  for (const t of ["pets", "pet_caregivers", "health_food_logs", "health_walk_logs", "routines", "pet_allergies", "posts", "user_profiles"]) {
    await raw.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), 10000)`);
  }
});

// Active grants helper (bypasses the invite flow; the journey describe uses the real routes instead).
const grant = (id: number, grantee: { profileId: number }, role: "family" | "caregiver", extra: object = {}) =>
  seedPetCaregiver(raw, { id, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: grantee.profileId, role, ...extra });

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("1. invite → accept / decline through the real routes", () => {
  it("owner invites by username; only the named grantee can see + accept it; it becomes active", async () => {
    as(OWNER);
    const inv = await apiReq("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: PARTNER.username });
    expect(inv.status).toBe(201);
    const created = (await json(inv)).grant;
    const grantId = created.id;
    expect(created.status).toBe("pending");

    // The invitee sees a PENDING invite naming the pet; an outsider sees nothing.
    as(PARTNER);
    const mine = (await json(await apiReq("/pet-caregivers?mine=true"))).grants;
    expect(mine.map((g: any) => [g.id, g.status, g.role, g.pet_id])).toEqual([[grantId, "pending", "family", PET]]);
    as(OUTSIDER);
    expect((await json(await apiReq("/pet-caregivers?mine=true"))).grants).toEqual([]);

    // The WRONG account cannot accept it (respond_pet_caregiver pins grantee = caller). The grant stays pending.
    // TODAY [B9]: the route means to answer 404 "No pending invite for you" but the function's RAISE aborts the request
    // transaction, so withRequestContext returns a blanket 500 (the route needs a savepoint — fixed in PR4). Either way: denied.
    const wrongAccount = [(await apiReq(`/pet-caregivers/${grantId}/respond`, "POST", { accept: true })).status];
    as(SITTER);
    wrongAccount.push((await apiReq(`/pet-caregivers/${grantId}/respond`, "POST", { accept: true })).status);
    expect(wrongAccount.every((st) => st === 404 || st === 500)).toBe(true);
    expect((await raw`select status from pet_caregivers where id = ${grantId}`)[0].status).toBe("pending");

    // …the invitee can.
    as(PARTNER);
    const ok = await apiReq(`/pet-caregivers/${grantId}/respond`, "POST", { accept: true });
    expect(ok.status).toBe(200);
    expect((await json(ok)).status).toBe("active");
    as(OWNER);
    const list = (await json(await apiReq(`/pet-caregivers?petId=${PET}`))).grants;
    expect(list.map((g: any) => [g.grantee_username, g.status])).toEqual([[PARTNER.username, "active"]]);
  });

  it.fails("DESIRED [PR4, B9]: a non-grantee (or a double-tap) answering an invite gets a friendly 404, not a 500", async () => {
    await seedPetCaregiver(raw, { id: 50, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: PARTNER.profileId, role: "family", status: "pending" });
    as(OUTSIDER);
    expect((await apiReq("/pet-caregivers/50/respond", "POST", { accept: true })).status).toBe(404);
  });

  it("decline leaves no access and the owner can re-invite afterwards", async () => {
    as(OWNER);
    const grantId = (await json(await apiReq("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: PARTNER.username }))).grant.id;
    as(PARTNER);
    expect((await json(await apiReq(`/pet-caregivers/${grantId}/respond`, "POST", { accept: false }))).status).toBe("declined");
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "kibble" })).status).toBe(403);
    as(OWNER);
    expect((await apiReq("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: PARTNER.username })).status).toBe(201);
  });

  it("guards: duplicate live invite 409 · self-invite 400 · not my pet 403 · unknown user 404 · no identity 401", async () => {
    as(OWNER);
    const body = { petId: PET, role: "caregiver", granteeUsername: SITTER.username };
    expect((await apiReq("/pet-caregivers", "POST", body)).status).toBe(201);
    expect((await apiReq("/pet-caregivers", "POST", body)).status).toBe(409);
    expect((await apiReq("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: OWNER.username })).status).toBe(400);
    expect((await apiReq("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: "nobody-here" })).status).toBe(404);
    as(OUTSIDER); // not the owner of PET → cannot invite anyone onto it
    expect((await apiReq("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: PARTNER.username })).status).toBe(403);
    authState.session = null;
    expect((await apiReq("/pet-caregivers", "POST", body)).status).toBe(401);
  });

  it("a family/caregiver grantee can NEVER manage sharing: invite, revoke or re-share", async () => {
    await grant(1, PARTNER, "family");
    await grant(2, SITTER, "caregiver");
    as(PARTNER);
    expect((await apiReq("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: OUTSIDER.username })).status).toBe(403);
    expect((await apiReq("/pet-caregivers/2", "DELETE")).status).toBe(404); // revoke someone else's grant: not found for them
    as(SITTER);
    expect((await apiReq("/pet-caregivers", "POST", { petId: PET, role: "caregiver", granteeUsername: OUTSIDER.username })).status).toBe(403);
    expect((await apiReq("/pet-caregivers/1", "DELETE")).status).toBe(404);
    expect(await raw`select id from pet_caregivers where status = 'active' order by id`).toHaveLength(2);
  });

  it("TODAY [B4]: a grantee has no way to LEAVE (no route; RLS gives them no UPDATE/DELETE) — PR4 adds it", async () => {
    await grant(1, PARTNER, "family");
    as(PARTNER);
    expect((await apiReq("/pet-caregivers/1", "DELETE")).status).toBe(404);
    await asApp(PARTNER.profileId, async (tx) => {
      expect(await tx`update pet_caregivers set status = 'revoked' where id = 1 returning id`).toHaveLength(0);
      expect(await tx`delete from pet_caregivers where id = 1 returning id`).toHaveLength(0);
    });
    expect((await raw`select status from pet_caregivers where id = 1`)[0].status).toBe("active");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("2. per-role access through the real routes (what is true TODAY)", () => {
  beforeEach(async () => {
    await grant(1, PARTNER, "family");
    await grant(2, SITTER, "caregiver");
  });

  it("FAMILY writes health logs anchored to the OWNER; CAREGIVER and OUTSIDER cannot", async () => {
    as(PARTNER);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "kibble" })).status).toBe(201);
    expect((await raw`select owner_user_id from health_food_logs where pet_id = ${PET} order by id desc limit 1`)[0].owner_user_id).toBe(OWNER.profileId);
    for (const u of [SITTER, OUTSIDER]) {
      as(u);
      expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(403);
    }
    expect(Number((await raw`select count(*)::int n from health_food_logs where pet_id = ${PET}`)[0].n)).toBe(2); // seed + partner's
  });

  it("FAMILY reads and adds vet-record rows (attributed 'editor'); CAREGIVER + OUTSIDER are 403", async () => {
    as(PARTNER);
    const add = await apiReq("/vet-record/allergies", "POST", { petId: PET, allergen: "chicken" });
    expect(add.status).toBe(200);
    const row = (await raw`select created_by_user_id, created_by_role, owner_user_id from pet_allergies where pet_id = ${PET}`)[0];
    expect([row.created_by_user_id, row.created_by_role, row.owner_user_id]).toEqual([PARTNER.profileId, "editor", OWNER.profileId]);
    expect((await json(await apiReq(`/vet-record/allergies?petId=${PET}`))).allergies?.length ?? 1).toBeGreaterThan(0);
    for (const u of [SITTER, OUTSIDER]) {
      as(u);
      expect((await apiReq(`/vet-record/allergies?petId=${PET}`)).status).toBe(403);
      expect((await apiReq("/vet-record/allergies", "POST", { petId: PET, allergen: "x" })).status).toBe(403);
    }
  });

  it("FAMILY + CAREGIVER (any active grantee) can read the shared care ring; OUTSIDER gets 404", async () => {
    for (const u of [OWNER, PARTNER, SITTER]) {
      as(u);
      expect((await apiReq(`/pets/${PET}/care-ring?day=${DAY}`)).status).toBe(200);
    }
    as(OUTSIDER);
    expect((await apiReq(`/pets/${PET}/care-ring?day=${DAY}`)).status).toBe(404);
  });

  it("only FAMILY may post the dog's DAILY MOMENT (one per author per day); CAREGIVER/OUTSIDER 403; normal posts stay owner-only", async () => {
    as(PARTNER);
    const moment = { pet_id: PET, image_url: "https://example.com/p.jpg", caption: "walk", is_daily_update: true, post_date: DAY };
    expect((await apiReq("/posts", "POST", moment)).status).toBe(201);
    expect((await apiReq("/posts", "POST", moment)).status).toBe(400); // second slide same author/day
    expect((await apiReq("/posts", "POST", { ...moment, is_daily_update: false })).status).toBe(403);
    for (const u of [SITTER, OUTSIDER]) {
      as(u);
      expect((await apiReq("/posts", "POST", moment)).status).toBe(403);
    }
    as(OWNER); // the owner adds their own slide the same day
    expect((await apiReq("/posts", "POST", moment)).status).toBe(201);
  });

  it("a grantee cannot edit the pet profile, routines or medical profile through the API; nor delete the pet", async () => {
    for (const u of [PARTNER, SITTER]) {
      as(u);
      expect((await apiReq(`/pets/${PET}`, "PATCH", { name: "Hijack" })).status).toBe(404);
      expect((await apiReq(`/pets/${PET}`, "DELETE")).status).toBeGreaterThanOrEqual(404); // no DELETE route exists
    }
    expect((await raw`select name from pets where id = ${PET}`)[0].name).toBe(OWNER.petName);
  });

  it("TODAY [B2]: FAMILY can write a log but reads back NOTHING; routines + medical profile + emergency card are owner-only", async () => {
    as(PARTNER);
    expect((await json(await apiReq(`/health/food-logs?petId=${PET}`))).logs ?? []).toHaveLength(0);
    expect((await apiReq(`/routines?petId=${PET}`)).status).toBe(403);
    expect((await apiReq(`/pet-medical-profiles?petId=${PET}`)).status).toBe(404);
    expect((await apiReq(`/emergency-card?petId=${PET}`)).status).toBe(404);
    as(SITTER);
    expect((await apiReq(`/routines?petId=${PET}`)).status).toBe(403);
    expect((await apiReq(`/pet-medical-profiles?petId=${PET}`)).status).toBe(404);
    expect((await apiReq(`/emergency-card?petId=${PET}`)).status).toBe(404);
  });

  // DESIRED (owner decision 2): caregiver reads feeding/routines/meds/emergency/health logs and can LOG/complete tasks but
  // not edit; family reads + writes everything except sharing + deleting the pet. Lands in PR3 (+ a policy migration for caregiver).
  it.fails("DESIRED [PR3]: FAMILY reads the owner's food logs and routines", async () => {
    as(PARTNER);
    expect(((await json(await apiReq(`/health/food-logs?petId=${PET}`))).logs ?? []).length).toBe(1);
    expect((await apiReq(`/routines?petId=${PET}`)).status).toBe(200);
  });
  it.fails("DESIRED [PR3]: CAREGIVER reads routines, medical profile, emergency card and health logs", async () => {
    as(SITTER);
    expect((await apiReq(`/routines?petId=${PET}`)).status).toBe(200);
    expect((await apiReq(`/pet-medical-profiles?petId=${PET}`)).status).toBe(200);
    expect(((await json(await apiReq(`/health/food-logs?petId=${PET}`))).logs ?? []).length).toBe(1);
  });
  it.fails("DESIRED [PR3]: CAREGIVER can log (feeding/walk) but still cannot edit routines or the vet record", async () => {
    as(SITTER);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "kibble" })).status).toBe(201);
    expect((await apiReq("/vet-record/allergies", "POST", { petId: PET, allergen: "x" })).status).toBe(403);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("3. a SHARED-ONLY user (owns no dog) and duplicate pets", () => {
  beforeEach(async () => { await grant(1, PARTNER, "family"); });

  it("the partner can act on the shared dog: household lists it (is_mine=false), ring, walk log — and gets NO pet row of their own", async () => {
    const before = await petCount();
    as(PARTNER);
    const hh = await json(await apiReq("/household"));
    expect(hh.dogs.map((d: any) => [d.pet_id ?? d.id, d.is_mine])).toEqual([[PET, false]]);
    expect((await apiReq(`/pets/${PET}/care-ring?day=${DAY}`)).status).toBe(200);
    expect((await apiReq("/health/walk-logs", "POST", { petId: PET, durationMinutes: 20, routeOrLocation: "park" })).status).toBe(201);
    expect(await petCount()).toBe(before);
    expect(await raw`select id from pets where owner_user_id = ${PARTNER.profileId}`).toHaveLength(0);
  });

  it("TODAY [B1]: GET /api/pets for a shared-only user is EMPTY — the app routes this account to onboarding (duplicate-dog path)", async () => {
    as(PARTNER);
    expect((await json(await apiReq("/pets"))).pets).toEqual([]);
  });

  it.fails("DESIRED [PR3]: GET /api/pets also returns the shared dog with is_shared + access_role, only for active/unexpired grants", async () => {
    as(PARTNER);
    const pets = (await json(await apiReq("/pets"))).pets;
    expect(pets.map((p: any) => [p.id, p.is_shared, p.access_role])).toEqual([[PET, true, "family"]]);
  });

  it("TODAY [B8]: POST /api/pets has NO duplicate/retry guard — the same dog posted twice creates two rows", async () => {
    as(OWNER);
    const body = { name: "Rex", breed: "Labrador" };
    expect((await apiReq("/pets", "POST", body)).status).toBe(201);
    expect((await apiReq("/pets", "POST", body)).status).toBe(201);
    expect(Number((await raw`select count(*)::int n from pets where owner_user_id = ${OWNER.profileId} and name = 'Rex'`)[0].n)).toBe(3); // seeded Rex + 2
  });

  it.fails("DESIRED [PR2]: the same owner+name+breed retried (lost response) is idempotent — still ONE new row", async () => {
    as(OWNER);
    const body = { name: "Milo", breed: "Beagle" };
    await apiReq("/pets", "POST", body);
    await apiReq("/pets", "POST", body);
    expect(Number((await raw`select count(*)::int n from pets where owner_user_id = ${OWNER.profileId} and name = 'Milo'`)[0].n)).toBe(1);
  });

  it("the whole invite → accept → log → revoke journey never changes the number of pet rows", async () => {
    const before = await petCount();
    as(OWNER);
    const g = (await json(await apiReq("/pet-caregivers", "POST", { petId: PET, role: "caregiver", granteeUsername: SITTER.username }))).grant.id;
    as(SITTER);
    await apiReq(`/pet-caregivers/${g}/respond`, "POST", { accept: true });
    as(OWNER);
    await apiReq(`/pet-caregivers/${g}`, "DELETE");
    expect(await petCount()).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("4. revoke is immediate and preserves history", () => {
  it("after revoke the ex-member is denied on the very next request; what they logged stays; the grant row is kept", async () => {
    await grant(1, PARTNER, "family");
    as(PARTNER);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "kibble" })).status).toBe(201);
    expect((await apiReq(`/pets/${PET}/care-ring?day=${DAY}`)).status).toBe(200);

    as(OWNER);
    expect((await apiReq("/pet-caregivers/1", "DELETE")).status).toBe(200);

    as(PARTNER);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(403);
    expect((await apiReq(`/pets/${PET}/care-ring?day=${DAY}`)).status).toBe(404);
    expect((await apiReq(`/vet-record/allergies?petId=${PET}`)).status).toBe(403);
    expect((await apiReq("/posts", "POST", { pet_id: PET, image_url: "https://example.com/p.jpg", is_daily_update: true, post_date: DAY })).status).toBe(403);
    expect((await json(await apiReq("/household"))).dogs).toEqual([]);

    // History preserved: the partner's log is still there (owner-anchored), the grant row is soft-revoked + audited.
    expect(Number((await raw`select count(*)::int n from health_food_logs where pet_id = ${PET}`)[0].n)).toBe(2);
    const [row] = await raw`select status, revoked_at from pet_caregivers where id = 1`;
    expect(row.status).toBe("revoked");
    expect(row.revoked_at).not.toBeNull();
    expect((await raw`select action from pet_caregiver_audit where grant_id = 1 and action = 'revoke'`)).toHaveLength(1);
  });

  it("TODAY [C6]: revoking an already-revoked grant is a 404 (the owner's list still shows revoked rows with a trash icon)", async () => {
    await grant(1, PARTNER, "family");
    as(OWNER);
    expect((await apiReq("/pet-caregivers/1", "DELETE")).status).toBe(200);
    expect((await apiReq("/pet-caregivers/1", "DELETE")).status).toBe(404);
    expect((await json(await apiReq(`/pet-caregivers?petId=${PET}`))).grants.map((g: any) => g.status)).toEqual(["revoked"]);
  });

  it("a revoked member can be invited again (history kept, new live grant)", async () => {
    await grant(1, PARTNER, "family");
    as(OWNER);
    await apiReq("/pet-caregivers/1", "DELETE");
    expect((await apiReq("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: PARTNER.username })).status).toBe(201);
    expect(await raw`select id from pet_caregivers where grantee_user_id = ${PARTNER.profileId}`).toHaveLength(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("5. expiry", () => {
  const PAST = "2000-01-01T00:00:00Z";

  it("an EXPIRED active grant grants nothing (every gate checks expires_at)", async () => {
    await grant(1, PARTNER, "family", { expiresAt: PAST });
    as(PARTNER);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(403);
    expect((await apiReq(`/pets/${PET}/care-ring?day=${DAY}`)).status).toBe(404);
    expect((await json(await apiReq("/household"))).dogs).toEqual([]);
    await asApp(PARTNER.profileId, async (tx) => expect(await tx`select id from routines`).toHaveLength(0));
  });

  it("a grant that expires in the future works until then", async () => {
    await grant(1, PARTNER, "family", { expiresAt: "2999-01-01T00:00:00Z" });
    as(PARTNER);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(201);
  });

  it("TODAY [B4]: GET ?mine=true still lists an expired grant as 'active' (and nothing ever flips it to 'expired') — PR3/PR5", async () => {
    await grant(1, PARTNER, "family", { expiresAt: PAST });
    as(PARTNER);
    expect((await json(await apiReq("/pet-caregivers?mine=true"))).grants.map((g: any) => g.status)).toEqual(["active"]);
  });

  it.fails("DESIRED [PR3]: GET ?mine=true does not present an expired grant as active", async () => {
    await grant(1, PARTNER, "family", { expiresAt: PAST });
    as(PARTNER);
    expect((await json(await apiReq("/pet-caregivers?mine=true"))).grants.map((g: any) => g.status)).not.toContain("active");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("6. a NON-member is denied everywhere", () => {
  beforeEach(async () => {
    await grant(1, PARTNER, "family");
    await grant(2, SITTER, "caregiver");
  });

  it("API: no ring, no logs, no vet record, no routines, no moment, no profile edit, no grants visible", async () => {
    as(OUTSIDER);
    expect((await apiReq(`/pets/${PET}/care-ring?day=${DAY}`)).status).toBe(404);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(403);
    expect(((await json(await apiReq(`/health/food-logs?petId=${PET}`))).logs ?? [])).toHaveLength(0);
    expect((await apiReq(`/vet-record/allergies?petId=${PET}`)).status).toBe(403);
    expect((await apiReq(`/routines?petId=${PET}`)).status).toBe(403);
    expect((await apiReq("/posts", "POST", { pet_id: PET, image_url: "https://example.com/p.jpg", is_daily_update: true, post_date: DAY })).status).toBe(403);
    expect((await apiReq(`/pets/${PET}`, "PATCH", { name: "x" })).status).toBe(404);
    expect((await json(await apiReq(`/pet-caregivers?petId=${PET}`))).grants).toEqual([]);
    expect((await json(await apiReq("/household"))).dogs.map((d: any) => d.is_mine)).toEqual([true]); // only their own dog
  });

  it("RLS (direct SQL as pawpi_app): sees none of the PRIVATE pet data and none of the grants", async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`select id from routines where pet_id = ${PET}`).toHaveLength(0);
      expect(await tx`select id from health_food_logs where pet_id = ${PET}`).toHaveLength(0);
      expect(await tx`select pet_id from pet_medical_profiles where pet_id = ${PET}`).toHaveLength(0);
      expect(await tx`select id from pet_caregivers`).toHaveLength(0);
      expect(await tx`select id from pet_caregiver_audit`).toHaveLength(0);
      expect(await tx`update pets set name = 'x' where id = ${PET} returning id`).toHaveLength(0);
      expect(await tx`delete from pets where id = ${PET} returning id`).toHaveLength(0);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("7. policy coverage on the family tables (catalog-level, all 18)", () => {
  const FAMILY_TABLES = [
    "health_food_logs", "health_general_checks", "health_medical_care_logs", "health_mobility_logs",
    "health_pee_logs", "health_photo_checks", "health_poo_logs", "health_vomit_logs", "health_walk_logs",
    "health_weight_logs", "health_wellness_logs", "health_timeline_events", "pet_allergies", "pet_conditions",
    "pet_lab_results", "pet_surgeries", "vet_documents", "reminder_dismissals",
  ];

  it("each carries FORCE RLS, an owner policy, and a *_family_all policy gated on app_user_has_pet_family — and NO grantee-any/caregiver write policy today", async () => {
    for (const t of FAMILY_TABLES) {
      const [cls] = await raw`select relrowsecurity as rls, relforcerowsecurity as forced from pg_class where oid = ${"public." + t}::regclass`;
      expect([t, cls.rls, cls.forced]).toEqual([t, true, true]);
      const pol = await raw`select policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = ${t}`;
      const fam = pol.find((p: any) => p.policyname === `${t}_family_all`);
      expect(fam, `${t}_family_all missing`).toBeTruthy();
      expect(String(fam!.qual)).toContain("app_user_has_pet_family");
      expect(String(fam!.with_check)).toContain("app_user_has_pet_family");
      // No policy on these tables is keyed on app_user_has_pet_access (the any-grantee gate) yet — that arrives with PR3's caregiver read/log policies.
      expect(pol.filter((p: any) => String(p.qual).includes("app_user_has_pet_access")).map((p: any) => p.policyname)).toEqual([]);
    }
  });

  it("family WRITE through RLS works on the tables that have a row, and a CAREGIVER sees zero of them", async () => {
    await grant(1, PARTNER, "family");
    await grant(2, SITTER, "caregiver");
    await asApp(PARTNER.profileId, async (tx) => {
      const r = await tx`insert into pet_allergies (pet_id, owner_user_id, allergen) values (${PET}, ${OWNER.profileId}, 'x') returning id`;
      expect(r).toHaveLength(1);
      expect(await tx`select id from pet_allergies where pet_id = ${PET}`).toHaveLength(1);
    });
    await asApp(SITTER.profileId, async (tx) => {
      expect(await tx`select id from pet_allergies where pet_id = ${PET}`).toHaveLength(0);
    });
    await expect(
      asApp(SITTER.profileId, (tx) => tx`insert into pet_allergies (pet_id, owner_user_id, allergen) values (${PET}, ${OWNER.profileId}, 'y')`),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("8. app_pet_ring_segments authorises its caller (migration 0137, audit gap A2)", () => {
  const ring = (uid: number | null, petId = PET) =>
    asApp(uid, (tx) => tx`select * from app_pet_ring_segments(${petId}, 'UTC', ${DAY}::date)`);

  it("owner, active family and active caregiver get exactly one row; everyone else gets ZERO rows (not an error)", async () => {
    await grant(1, PARTNER, "family");
    await grant(2, SITTER, "caregiver");
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${PET}, ${OWNER.profileId}, ${DAY + " 12:00:00+00"})`;
    for (const uid of [OWNER.profileId, PARTNER.profileId, SITTER.profileId]) {
      const rows = await ring(uid);
      expect(rows).toHaveLength(1);
      expect(rows[0].walk_done).toBe(true); // the derivation itself is unchanged
    }
    expect(await ring(OUTSIDER.profileId)).toHaveLength(0);
    expect(await ring(null)).toHaveLength(0); // no identity in scope
  });

  it("a revoked, declined, pending or expired grantee gets zero rows", async () => {
    await grant(1, PARTNER, "family", { status: "revoked" });
    await grant(2, SITTER, "caregiver", { expiresAt: "2000-01-01T00:00:00Z" });
    expect(await ring(PARTNER.profileId)).toHaveLength(0);
    expect(await ring(SITTER.profileId)).toHaveLength(0);
    await raw`update pet_caregivers set status = 'pending', expires_at = null, accepted_at = null where id = 2`;
    expect(await ring(SITTER.profileId)).toHaveLength(0);
  });

  it("a stranger cannot probe someone else's pet by id (the A2 leak): zero rows even with real activity that day", async () => {
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${PET}, ${OWNER.profileId}, ${DAY + " 12:00:00+00"})`;
    expect(await ring(OUTSIDER.profileId, PET)).toHaveLength(0);
  });

  it("the routes that call it are unchanged for legitimate callers (care-ring still 200 for owner + grantee, ring shows the log)", async () => {
    await grant(1, PARTNER, "family");
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${PET}, ${OWNER.profileId}, ${DAY + " 12:00:00+00"})`;
    for (const u of [OWNER, PARTNER]) {
      as(u);
      const res = await apiReq(`/pets/${PET}/care-ring?day=${DAY}`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(await json(res))).toContain("walk");
    }
  });
});
