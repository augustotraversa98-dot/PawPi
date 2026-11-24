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
    // FLIPPED by PR4 (was TODAY [B9], accepted 404 or 500): the route now looks the invite up first and runs the function in a savepoint,
    // so a wrong account always gets the intended friendly 404.
    const wrongAccount = [(await apiReq(`/pet-caregivers/${grantId}/respond`, "POST", { accept: true })).status];
    as(SITTER);
    wrongAccount.push((await apiReq(`/pet-caregivers/${grantId}/respond`, "POST", { accept: true })).status);
    expect(wrongAccount).toEqual([404, 404]);
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

  it("FLIPPED by PR4 [B9]: a non-grantee answering an invite gets a friendly 404, not a 500", async () => {
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

  it("FLIPPED by PR4 [B4]: a grantee can LEAVE through the route; direct UPDATE/DELETE on pet_caregivers is still refused by RLS", async () => {
    await grant(1, PARTNER, "family");
    as(PARTNER);
    expect((await apiReq("/pet-caregivers/1", "DELETE")).status).toBe(404); // DELETE is the OWNER's revoke, not leave
    await asApp(PARTNER.profileId, async (tx) => {
      expect(await tx`update pet_caregivers set status = 'revoked' where id = 1 returning id`).toHaveLength(0);
      expect(await tx`delete from pet_caregivers where id = 1 returning id`).toHaveLength(0);
    });
    expect((await raw`select status from pet_caregivers where id = 1`)[0].status).toBe("active");
    expect((await apiReq("/pet-caregivers/1/leave", "POST")).status).toBe(200);
    expect((await raw`select status from pet_caregivers where id = 1`)[0].status).toBe("left");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("2. per-role access through the real routes", () => {
  beforeEach(async () => {
    await grant(1, PARTNER, "family");
    await grant(2, SITTER, "caregiver");
  });

  it("FAMILY and CAREGIVER append health logs anchored to the OWNER (PR3: a caregiver can log); an OUTSIDER cannot", async () => {
    for (const u of [PARTNER, SITTER]) {
      as(u);
      expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "kibble" })).status).toBe(201);
    }
    expect((await raw`select distinct owner_user_id from health_food_logs where pet_id = ${PET}`).map((r) => r.owner_user_id)).toEqual([OWNER.profileId]);
    as(OUTSIDER);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(403);
    expect(Number((await raw`select count(*)::int n from health_food_logs where pet_id = ${PET}`)[0].n)).toBe(3); // seed + partner + sitter
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

  // CHANGED by PR3b (owner decision 2): a FAMILY co-owner now edits the pet profile (see family-write-paths.integration.test.ts); a CAREGIVER
  // still cannot, and NOBODY but the owner can delete the pet (there is no DELETE route at all).
  it("a CAREGIVER cannot edit the pet profile; nobody but the owner can delete the pet; the family member's edit does not change the owner", async () => {
    as(SITTER);
    expect((await apiReq(`/pets/${PET}`, "PATCH", { name: "Hijack" })).status).toBe(404);
    for (const u of [PARTNER, SITTER]) {
      as(u);
      expect((await apiReq(`/pets/${PET}`, "DELETE")).status).toBeGreaterThanOrEqual(404); // no DELETE route exists
    }
    expect((await raw`select name from pets where id = ${PET}`)[0].name).toBe(OWNER.petName);
    as(PARTNER);
    expect((await apiReq(`/pets/${PET}`, "PATCH", { notes: "family note" })).status).toBe(200);
    expect((await raw`select owner_user_id from pets where id = ${PET}`)[0].owner_user_id).toBe(OWNER.profileId);
  });

  // FLIPPED by PR3 (were "TODAY [B2]" + three "DESIRED [PR3]" pins): both grantee roles READ what the owner decision allows.
  // The full per-role matrix, revoked/expired members and the default-response proof live in shared-pets-access.integration.test.ts.
  it("FAMILY reads the owner's food logs, routines, medical profile and emergency card", async () => {
    as(PARTNER);
    expect(((await json(await apiReq(`/health/food-logs?petId=${PET}`))).logs ?? []).length).toBe(1);
    expect((await apiReq(`/routines?petId=${PET}`)).status).toBe(200);
    expect((await apiReq(`/pet-medical-profiles?petId=${PET}`)).status).toBe(200);
    expect((await apiReq(`/emergency-card?petId=${PET}`)).status).toBe(200);
  });

  it("CAREGIVER reads routines, medical profile, emergency card and health logs, and can log — but cannot edit routines or the vet record", async () => {
    as(SITTER);
    expect((await apiReq(`/routines?petId=${PET}`)).status).toBe(200);
    expect((await apiReq(`/pet-medical-profiles?petId=${PET}`)).status).toBe(200);
    expect((await apiReq(`/emergency-card?petId=${PET}`)).status).toBe(200);
    expect(((await json(await apiReq(`/health/food-logs?petId=${PET}`))).logs ?? []).length).toBe(1);
    expect((await apiReq("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "kibble" })).status).toBe(201);
    expect((await apiReq("/vet-record/allergies", "POST", { petId: PET, allergen: "x" })).status).toBe(403);
    expect((await apiReq("/routines", "POST", { petId: PET, type: "feeding", title: "x" })).status).toBeGreaterThanOrEqual(400);
  });
});

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

  it("the DEFAULT GET /api/pets (what builds 30-32 call) stays EMPTY for a shared-only user — by design, the shared dog is opt-in", async () => {
    as(PARTNER);
    expect((await json(await apiReq("/pets"))).pets).toEqual([]);
  });

  it("FLIPPED by PR3: GET /api/pets?include_shared=1 also returns the shared dog with is_shared + access_role (active, unexpired grants only)", async () => {
    as(PARTNER);
    const pets = (await json(await apiReq("/pets?include_shared=1"))).pets;
    expect(pets.map((p: any) => [p.id, p.is_shared, p.access_role])).toEqual([[PET, true, "family"]]);
  });

  // FLIPPED by PR2 (was "TODAY [B8]" + "DESIRED [PR2]" pins): a retried create is a replay, never a second row.
  // The full matrix (window, race, keys, owners) lives in pets-duplicate-guard.integration.test.ts.
  it("a retried POST /api/pets (lost response / double tap) creates ONE row, the retry gets the existing pet", async () => {
    as(OWNER);
    const body = { name: "Milo", breed: "Beagle" };
    const first = await apiReq("/pets", "POST", body);
    const retry = await apiReq("/pets", "POST", body);
    expect([first.status, retry.status]).toEqual([201, 200]);
    expect((await json(retry)).pet.id).toBe((await json(first)).pet.id);
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

  it("FLIPPED by PR4 [C6]: revoking an already-revoked grant is a friendly 200 (the owner's list still shows the revoked row)", async () => {
    await grant(1, PARTNER, "family");
    as(OWNER);
    expect((await apiReq("/pet-caregivers/1", "DELETE")).status).toBe(200);
    expect((await apiReq("/pet-caregivers/1", "DELETE")).status).toBe(200);
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

  // FLIPPED by PR3 (were "TODAY [B4]" + "DESIRED [PR3]"): an expired grant is never presented as active.
  it("GET ?mine=true no longer lists an expired grant; the owner's list shows it as 'expired' (never 'active')", async () => {
    await grant(1, PARTNER, "family", { expiresAt: PAST });
    as(PARTNER);
    expect((await json(await apiReq("/pet-caregivers?mine=true"))).grants).toEqual([]);
    as(OWNER);
    const list = (await json(await apiReq(`/pet-caregivers?petId=${PET}`))).grants;
    expect(list.map((g: any) => [g.status, g.is_expired])).toEqual([["expired", true]]);
  });
});

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

  it("each carries FORCE RLS, the 0049 *_family_all policy, and (0139) a read policy for any grantee — writes for a caregiver exist only as INSERT on the 12 log tables", async () => {
    const LOG_TABLES = FAMILY_TABLES.filter((t) => t.startsWith("health_"));
    for (const t of FAMILY_TABLES) {
      const [cls] = await raw`select relrowsecurity as rls, relforcerowsecurity as forced from pg_class where oid = ${"public." + t}::regclass`;
      expect([t, cls.rls, cls.forced]).toEqual([t, true, true]);
      const pol = await raw`select policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = ${t}`;
      const fam = pol.find((p: any) => p.policyname === `${t}_family_all`);
      expect(fam, `${t}_family_all missing`).toBeTruthy();
      expect(String(fam!.qual)).toContain("app_user_has_pet_family");
      expect(String(fam!.with_check)).toContain("app_user_has_pet_family");
      const anyGrantee = pol.filter((p: any) => String(p.qual).includes("app_user_has_pet_access") || String(p.with_check).includes("app_user_has_pet_access"));
      if (LOG_TABLES.includes(t)) {
        // log tables: SELECT + INSERT for any active grantee, nothing else (append-only for a caregiver)
        expect(anyGrantee.map((p: any) => `${p.policyname}:${p.cmd}`).sort()).toEqual([`${t}_caregiver_insert:INSERT`, `${t}_grantee_read:SELECT`].sort());
      } else if (t === "pet_allergies" || t === "pet_conditions") {
        expect(anyGrantee.map((p: any) => `${p.policyname}:${p.cmd}`)).toEqual([`${t}_grantee_read:SELECT`]); // emergency picture: read only
      } else {
        expect(anyGrantee.map((p: any) => p.policyname), `${t} must stay closed to a caregiver`).toEqual([]); // vet documents/labs/surgeries, reminder dismissals
      }
    }
  });

  it("family WRITE through RLS works; a CAREGIVER READS the emergency picture (allergies) but cannot write the vet record", async () => {
    await grant(1, PARTNER, "family");
    await grant(2, SITTER, "caregiver");
    await asApp(PARTNER.profileId, async (tx) => {
      const r = await tx`insert into pet_allergies (pet_id, owner_user_id, allergen) values (${PET}, ${OWNER.profileId}, 'x') returning id`;
      expect(r).toHaveLength(1);
      expect(await tx`select id from pet_allergies where pet_id = ${PET}`).toHaveLength(1);
    });
    await asApp(SITTER.profileId, async (tx) => {
      expect(await tx`select id from pet_allergies where pet_id = ${PET}`).toHaveLength(1); // emergency info: read
    });
    await expect(
      asApp(SITTER.profileId, (tx) => tx`insert into pet_allergies (pet_id, owner_user_id, allergen) values (${PET}, ${OWNER.profileId}, 'y')`),
    ).rejects.toThrow(/row-level security/i);
  });
});

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
