// Shared pets — PR 3/7 of the Family & caregivers series. Proven through the REAL Hono router (api.request) on real
// Postgres as pawpi_app, with an OWNER, a FAMILY co-owner who owns no dog, a CAREGIVER, an OUTSIDER (owns another dog),
// plus a REVOKED, an EXPIRED and a PENDING member.
//
//   A. GET /api/pets: the DEFAULT response (builds 30-32) is byte-for-byte unchanged for a user holding grants; shared pets
//      appear ONLY with ?include_shared=1 (owned first, no duplicates, active+unexpired grants only, new fields only there).
//   B. READ paths per role: health logs, routines, medical profile, emergency card, meds. Owner decision 2 (2026-11-23).
//   C. LOGGING per role: a caregiver appends (anchored to the owner), cannot edit/delete; family does everything the API exposes.
//   D. Non-members and revoked / expired / pending / declined members are denied, immediately.
//   E. The daily-moment lock treats a household member as part of the household, not a stranger.
//   F. Expiry is never shown as "active"; an expired invite cannot be accepted.
//   G. No duplicate pet rows anywhere; migration 0139 absent => safe (no 500).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  seedMedicalProfile,
} from "./db";
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
const DAY = "2026-11-20";
const PAST = "2000-01-01T00:00:00Z";

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
const get = (path: string) => req(path);
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}
const petCount = async () => Number((await raw`select count(*)::int n from pets`)[0].n);
const grant = (id: number, u: { profileId: number }, role: "family" | "caregiver", extra: object = {}) =>
  seedPetCaregiver(raw, { id, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: u.profileId, role, ...extra });

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
  await seedFoodLogRow(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId });
  await seedMedicalProfile(raw, { profileRowId: 1, petId: PET, ownerUserId: OWNER.profileId });
  await raw`insert into pet_medications (pet_id, owner_user_id, name) values (${PET}, ${OWNER.profileId}, 'Apoquel')`;
  await raw`insert into pet_preventive_treatments (pet_id, owner_user_id, product_name) values (${PET}, ${OWNER.profileId}, 'NexGard')`;
  await raw`insert into pet_allergies (pet_id, owner_user_id, allergen) values (${PET}, ${OWNER.profileId}, 'chicken')`;
  await raw`insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit) values (${PET}, ${OWNER.profileId}, 21.5, 'kg')`;
  for (const t of ["pets", "pet_caregivers", "health_food_logs", "health_walk_logs", "routines", "posts"]) {
    await raw.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), 10000)`);
  }
  // the standing cast: FAMILY + CARE active; REVOKED, EXPIRED, PENDING are not members
  await grant(1, FAMILY, "family");
  await grant(2, CARE, "caregiver");
  await grant(3, REVOKED, "family", { status: "revoked" });
  await grant(4, EXPIRED, "family", { expiresAt: PAST });
  await grant(5, PENDING, "caregiver", { status: "pending" });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A. GET /api/pets — default response unchanged for old builds; shared pets are opt-in", () => {
  it("PROOF: the default body is byte-for-byte identical before and after the user is given an active grant", async () => {
    // OUTSIDER owns Duke. Capture the default body, then make them a caregiver on Rex, then capture it again.
    as(OUTSIDER);
    const before = await (await get("/pets")).text();
    await grant(10, OUTSIDER, "caregiver");
    const after = await (await get("/pets")).text();
    expect(after).toBe(before);
    const body = JSON.parse(after);
    expect(body.pets.map((p: any) => p.id)).toEqual([OUTSIDER.petId]); // only their own dog
    for (const p of body.pets) {
      expect(p).not.toHaveProperty("is_shared");
      expect(p).not.toHaveProperty("access_role");
      expect(p).not.toHaveProperty("owner_display");
    }
  });

  it("a shared-only user's DEFAULT response is the empty list builds 30-32 always got; any other query value is also 'default'", async () => {
    as(FAMILY);
    for (const q of ["", "?include_shared=0", "?include_shared=true", "?include_shared=", "?include=shared", "?shared=1"]) {
      const res = await get(`/pets${q}`);
      expect(await res.text(), q).toBe(JSON.stringify({ pets: [] }));
    }
  });

  it("opt-in: owned pets FIRST (unchanged rows + is_shared:false, access_role:'owner'), then shared pets with role, owner display and grant info", async () => {
    await grant(10, OUTSIDER, "caregiver");
    as(OUTSIDER);
    const defaults = (await json(await get("/pets"))).pets;
    const res = await json(await get("/pets?include_shared=1"));
    expect(res.pets.map((p: any) => [p.id, p.is_shared, p.access_role])).toEqual([
      [OUTSIDER.petId, false, "owner"],
      [PET, true, "caregiver"],
    ]);
    // the owned row is exactly the default row plus the two new fields
    const { is_shared, access_role, ...ownedRest } = res.pets[0];
    expect(ownedRest).toEqual(defaults[0]);
    const shared = res.pets[1];
    expect(shared.owner_user_id).toBe(OWNER.profileId);
    expect(shared.grant_id).toBe(10);
    expect(shared.grant_expires_at).toBeNull();
    // owner display: full_name is null when unset (never the username/e-mail as a name); the @username is offered separately
    expect(shared.owner_display).toEqual({ full_name: null, username: OWNER.username, avatar_url: null });
    // weight comes from the owner's latest weigh-in for that pet
    expect(Number(shared.weight)).toBeCloseTo(21.5);
  });

  it("opt-in for a shared-only FAMILY user: exactly the shared dog, role 'family'", async () => {
    as(FAMILY);
    const pets = (await json(await get("/pets?include_shared=1"))).pets;
    expect(pets.map((p: any) => [p.id, p.is_shared, p.access_role])).toEqual([[PET, true, "family"]]);
  });

  it("only ACTIVE, UNEXPIRED grants are listed: revoked / expired / pending / declined members get nothing", async () => {
    await grant(11, OUTSIDER, "family", { status: "declined" });
    for (const u of [REVOKED, EXPIRED, PENDING, OUTSIDER]) {
      as(u);
      const pets = (await json(await get("/pets?include_shared=1"))).pets;
      expect(pets.filter((p: any) => p.is_shared), `user ${u.username}`).toEqual([]);
    }
  });

  it("a grant that expires in the future is listed with its expiry; an owner is never listed as shared on their own dog (no duplicates)", async () => {
    await grant(12, OUTSIDER, "family", { expiresAt: "2999-01-01T00:00:00Z" });
    await grant(13, OUTSIDER, "caregiver", { status: "revoked" }); // history on the same pet must not duplicate it
    as(OUTSIDER);
    const pets = (await json(await get("/pets?include_shared=1"))).pets;
    const ids = pets.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pets.find((p: any) => p.id === PET).grant_expires_at).not.toBeNull();
    as(OWNER);
    const mine = (await json(await get("/pets?include_shared=1"))).pets;
    expect(mine.map((p: any) => [p.id, p.is_shared])).toEqual([[PET, false]]); // the owner's own dog is never "shared" with them
  });

  it("revoke removes it from the opt-in list on the very next request", async () => {
    as(CARE);
    expect((await json(await get("/pets?include_shared=1"))).pets).toHaveLength(1);
    as(OWNER);
    expect((await req("/pet-caregivers/2", "DELETE")).status).toBe(200);
    as(CARE);
    expect((await json(await get("/pets?include_shared=1"))).pets).toEqual([]);
  });

  it("an unauthenticated opt-in call is still 401", async () => {
    authState.session = null;
    expect((await get("/pets?include_shared=1")).status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("B. READ paths per role (owner decision 2)", () => {
  const READS = [
    ["food logs", `/health/food-logs?petId=${PET}`, (b: any) => (b.logs ?? []).length],
    ["routines", `/routines?petId=${PET}`, (b: any) => (b.routines ?? []).length],
    ["medical profile", `/pet-medical-profiles?petId=${PET}`, (b: any) => (b.medicalProfile ? 1 : 0)],
    ["medications", `/health/medications?petId=${PET}`, (b: any) => (b.medications ?? b.items ?? []).length],
    ["preventive treatments", `/health/preventive-treatments?petId=${PET}`, (b: any) => (b.treatments ?? b.items ?? []).length],
    ["timeline", `/health/timeline?petId=${PET}`, (b: any) => (b.timeline ?? []).length],
  ] as const;

  for (const [label, path, count] of READS) {
    it(`${label}: OWNER, FAMILY and CAREGIVER read it`, async () => {
      for (const u of [OWNER, FAMILY, CARE]) {
        as(u);
        const res = await get(path);
        expect(res.status, `${label} as ${u.username}`).toBe(200);
        expect(count(await json(res)), `${label} as ${u.username}`).toBeGreaterThan(0);
      }
    });

    it(`${label}: OUTSIDER, REVOKED, EXPIRED and PENDING get nothing (empty or 403/404)`, async () => {
      for (const u of [OUTSIDER, REVOKED, EXPIRED, PENDING]) {
        as(u);
        const res = await get(path);
        if (res.status === 200) expect(count(await json(res)), `${label} as ${u.username}`).toBe(0);
        else expect([403, 404], `${label} as ${u.username}`).toContain(res.status);
      }
    });
  }

  it("emergency card: a grantee READS it (allergies, medical) but never creates it, never sees the tag token, contact settings or share links", async () => {
    as(CARE);
    const none = await json(await get(`/emergency-card?petId=${PET}`));
    expect(none.card).toBeNull(); // the card does not exist yet and a grantee does not mint it
    expect(await raw`select id from pet_emergency_cards`).toHaveLength(0);
    expect(none.allergies.map((a: any) => a.allergen)).toEqual(["chicken"]);
    expect(none.medical?.microchip_id).toBe("chip-1");

    as(OWNER); // the owner opens it first (creates the card + a vet link)
    const own = await json(await get(`/emergency-card?petId=${PET}`));
    expect(own.card.tag_token).toBeTruthy();
    await raw`insert into pet_emergency_share_links (pet_id, owner_user_id, token, scope) values (${PET}, ${OWNER.profileId}, 'tok-secret', 'full')`;

    for (const u of [FAMILY, CARE]) {
      as(u);
      const g = await json(await get(`/emergency-card?petId=${PET}`));
      expect(g.card).not.toBeNull();
      expect(g.card).not.toHaveProperty("tag_token");
      expect(g.card).not.toHaveProperty("contact_value");
      expect(g.links).toEqual([]);
    }
    as(OWNER);
    expect((await json(await get(`/emergency-card?petId=${PET}`))).links).toHaveLength(1); // owner payload unchanged
  });

  it("the owner's payloads are unchanged: same keys as before on the emergency card and medical profile", async () => {
    as(OWNER);
    const ec = await json(await get(`/emergency-card?petId=${PET}`));
    expect(Object.keys(ec).sort()).toEqual(["allergies", "card", "conditions", "links", "lost", "medical", "pet"]);
    expect(ec.pet).not.toHaveProperty("_pet_owner");
    const mp = await json(await get(`/pet-medical-profiles?petId=${PET}`));
    expect(Object.keys(mp).sort()).toEqual(["currentWeight", "medicalProfile", "pet"]);
    expect(mp.pet).not.toHaveProperty("_pet_owner");
  });

  it("a row stamped to someone else on the pet (pre-existing owner-policy gap) is NOT shown: reads are anchored to the pet's owner", async () => {
    await raw`insert into health_food_logs (pet_id, owner_user_id, logged_at, food_name) values (${PET}, ${OUTSIDER.profileId}, now(), 'planted')`;
    for (const u of [OWNER, FAMILY, CARE]) {
      as(u);
      const logs = (await json(await get(`/health/food-logs?petId=${PET}`))).logs;
      expect(logs.map((l: any) => l.food_name), u.username).not.toContain("planted");
      expect(logs.every((l: any) => l.owner_user_id === OWNER.profileId)).toBe(true);
    }
  });

  it("no petId (the owner's 'all my logs'): unchanged and owner-scoped — a grantee does not get the owner's logs from it", async () => {
    as(OWNER);
    expect(((await json(await get("/health/food-logs"))).logs ?? []).length).toBe(1);
    as(FAMILY);
    expect(((await json(await get("/health/food-logs"))).logs ?? []).length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("C. LOGGING per role", () => {
  const LOGS: [string, string, any][] = [
    ["food", "/health/food-logs", { petId: PET, mealType: "dinner", foodName: "kibble" }],
    ["walk", "/health/walk-logs", { petId: PET, durationMinutes: 20, routeOrLocation: "park" }],
    ["pee", "/health/pee-logs", { petId: PET, color: "yellow" }],
    ["poo", "/health/poo-logs", { petId: PET, shape: "firm" }],
    ["vomit", "/health/vomit-logs", { petId: PET, color: "white" }],
    ["weight", "/health/weight-logs", { petId: PET, weight: 22, weightUnit: "kg" }],
    ["wellness", "/health/wellness-logs", { petId: PET, checkType: "general", status: "good" }],
    ["general check", "/health/general-checks", { petId: PET, mood: "happy", energy: "high" }],
    ["medical care (non-vaccine)", "/health/medical-care-logs", { petId: PET, careType: "medication", name: "Apoquel", status: "given" }],
    ["photo check", "/health/photo-checks", { petId: PET, bodyArea: "paws", imageUrl: "https://example.com/p.jpg" }],
  ];

  for (const [label, path, body] of LOGS) {
    it(`${label}: OWNER, FAMILY and CAREGIVER can log it (anchored to the owner); every non-member is 403`, async () => {
      for (const u of [OWNER, FAMILY, CARE]) {
        as(u);
        const res = await req(path, "POST", body);
        expect([200, 201], `${label} as ${u.username} -> ${res.status}`).toContain(res.status);
      }
      for (const u of [OUTSIDER, REVOKED, EXPIRED, PENDING]) {
        as(u);
        expect((await req(path, "POST", body)).status, `${label} as ${u.username}`).toBe(403);
      }
    });
  }

  it("every row a grantee logged is anchored to the pet's OWNER (never to the caregiver)", async () => {
    as(CARE);
    for (const [, path, body] of LOGS) await req(path, "POST", body);
    const tables = ["health_food_logs", "health_walk_logs", "health_pee_logs", "health_poo_logs", "health_vomit_logs", "health_weight_logs", "health_wellness_logs", "health_general_checks", "health_medical_care_logs", "health_photo_checks"];
    for (const t of tables) {
      const owners = await raw.unsafe(`select distinct owner_user_id from ${t} where pet_id = ${PET}`);
      expect(owners.map((r: any) => r.owner_user_id), t).toEqual([OWNER.profileId]);
    }
    expect((await raw`select owner_user_id from health_food_logs where pet_id = ${PET} and food_name = 'kibble'`).length).toBeGreaterThan(0);
  });

  it("a CAREGIVER cannot record an administered vaccine (owner-only) — friendly 403 with a code; a skipped vaccine is fine", async () => {
    as(CARE);
    const r = await req("/health/medical-care-logs", "POST", { petId: PET, careType: "vaccine", name: "Rabies", status: "completed" });
    expect(r.status).toBe(403);
    expect((await json(r)).code).toBe("vaccine_owner_only");
    expect(await raw`select id from pet_vaccinations`).toHaveLength(0);
    expect((await req("/health/medical-care-logs", "POST", { petId: PET, careType: "vaccine", name: "Rabies", status: "skipped" })).status).toBe(201);
    as(OWNER); // the owner still writes through to pet_vaccinations
    expect((await req("/health/medical-care-logs", "POST", { petId: PET, careType: "vaccine", name: "Rabies", status: "completed" })).status).toBe(201);
    expect(await raw`select id from pet_vaccinations`).toHaveLength(1);
  });

  it("a CAREGIVER cannot edit anything: routines, vet record, pet profile, sharing, deleting a log", async () => {
    as(CARE);
    expect((await req("/routines", "POST", { petId: PET, type: "feeding", title: "x" })).status).toBeGreaterThanOrEqual(400);
    expect((await req("/vet-record/allergies", "POST", { petId: PET, allergen: "x" })).status).toBe(403);
    expect((await req(`/vet-record/allergies?petId=${PET}`)).status).toBe(403);
    expect((await req(`/pets/${PET}`, "PATCH", { name: "Hijack" })).status).toBe(404);
    expect((await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: OUTSIDER.username })).status).toBe(403);
    expect((await req("/pet-medical-profiles", "POST", { petId: PET, microchipId: "evil" })).status).toBeGreaterThanOrEqual(400);
    expect((await raw`select microchip_id from pet_medical_profiles where pet_id = ${PET}`)[0].microchip_id).toBe("chip-1");
    expect((await raw`select name from pets where id = ${PET}`)[0].name).toBe("Rex");
  });

  it("RLS (direct SQL as pawpi_app): a caregiver can SELECT + INSERT a log but never UPDATE or DELETE one; family keeps full access", async () => {
    await asApp(CARE.profileId, async (tx) => {
      expect(await tx`select id from health_food_logs where pet_id = ${PET}`).toHaveLength(1);
      expect(await tx`insert into health_food_logs (id, pet_id, owner_user_id, logged_at) values (90, ${PET}, ${OWNER.profileId}, now()) returning id`).toHaveLength(1);
      expect(await tx`update health_food_logs set notes = 'x' where id = 1 returning id`).toHaveLength(0);
      expect(await tx`delete from health_food_logs where id = 1 returning id`).toHaveLength(0);
    });
    await asApp(FAMILY.profileId, async (tx) => {
      expect(await tx`update health_food_logs set notes = 'fam' where id = 1 returning id`).toHaveLength(1);
      expect(await tx`delete from health_food_logs where id = 90 returning id`).toHaveLength(1);
    });
    for (const u of [OUTSIDER, REVOKED, EXPIRED, PENDING]) {
      await asApp(u.profileId, async (tx) => {
        expect(await tx`select id from health_food_logs where pet_id = ${PET}`, u.username).toHaveLength(0);
        expect(await tx`select id from pet_medications where pet_id = ${PET}`, u.username).toHaveLength(0);
        expect(await tx`select id from pet_allergies where pet_id = ${PET}`, u.username).toHaveLength(0);
        expect(await tx`select pet_id from pet_emergency_cards`, u.username).toHaveLength(0);
      });
    }
  });

  it("caregivers do NOT get the private vet records: documents, labs, surgeries, notes, vaccinations stay closed (RLS)", async () => {
    await raw`insert into pet_surgeries (pet_id, owner_user_id, procedure, surgery_date) values (${PET}, ${OWNER.profileId}, 's', current_date)`;
    await raw`insert into pet_vaccinations (pet_id, owner_user_id, name) values (${PET}, ${OWNER.profileId}, 'Rabies')`;
    await asApp(CARE.profileId, async (tx) => {
      expect(await tx`select id from pet_surgeries`).toHaveLength(0);
      expect(await tx`select id from pet_vaccinations`).toHaveLength(0);
      expect(await tx`select id from vet_documents`).toHaveLength(0);
      expect(await tx`select id from vet_notes`).toHaveLength(0);
    });
    await asApp(FAMILY.profileId, async (tx) => {
      expect(await tx`select id from pet_surgeries`).toHaveLength(1); // family keeps the vet record (0049)
    });
  });

  it("revoke is immediate for logging AND reading", async () => {
    as(CARE);
    expect((await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "a" })).status).toBe(201);
    as(OWNER);
    await req("/pet-caregivers/2", "DELETE");
    as(CARE);
    expect((await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "b" })).status).toBe(403);
    expect(((await json(await get(`/health/food-logs?petId=${PET}`))).logs ?? []).length).toBe(0);
    expect((await get(`/routines?petId=${PET}`)).status).toBe(403);
    expect((await get(`/emergency-card?petId=${PET}`)).status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("E. the daily-moment lock: a household member is not a stranger", () => {
  const moment = (u: { authUserId: number }, extra: object = {}) => {
    as(u);
    return req("/posts", "POST", { pet_id: PET, image_url: "https://example.com/p.jpg", caption: "walk", is_daily_update: true, post_date: DAY, ...extra });
  };

  it("a grantee viewing the shared dog's profile is never locked out of its moments; a stranger still is", async () => {
    await raw`insert into posts (user_id, pet_id, caption, is_daily_update, post_date) values (${OWNER.profileId}, ${PET}, 'owner slide', true, ${DAY})`;
    for (const u of [OWNER, FAMILY, CARE]) {
      as(u);
      const prof = await json(await get(`/pets/${PET}/profile`));
      expect(prof.momentsLocked, u.username).toBeFalsy();
    }
    for (const u of [OUTSIDER, REVOKED, EXPIRED, PENDING]) {
      as(u);
      const prof = await json(await get(`/pets/${PET}/profile`));
      expect(prof.momentsLocked, u.username).toBe(true);
    }
  });

  it("owner-posted-today: a household moment on the SHARED dog counts for the family member (and for the owner, whoever posted it)", async () => {
    as(FAMILY);
    const before = await json(await get("/posts/owner-posted-today"));
    expect(before.hasPostedToday).toBe(false);
    // post for the SAME owner-local day the API reports (the fixed DAY used elsewhere is not "today")
    expect((await moment(FAMILY, { post_date: before.todayDate })).status).toBe(201); // the co-owner posts the dog's moment
    as(FAMILY);
    expect((await json(await get("/posts/owner-posted-today"))).hasPostedToday).toBe(true); // used to stay false: they own no dog
    as(OWNER);
    expect((await json(await get("/posts/owner-posted-today"))).hasPostedToday).toBe(true);
  });

  it("a caregiver (who cannot post) is unlocked once the household posted today; a stranger is not", async () => {
    await raw`insert into posts (user_id, pet_id, caption, is_daily_update, post_date) values (${OWNER.profileId}, ${PET}, 'owner slide', true, current_date)`;
    const today = (await raw`select current_date::text d`)[0].d;
    await raw`update posts set post_date = ${today}`;
    as(CARE);
    // owner-local "today" can differ from the DB date near midnight; assert against the same day the API reports
    const status = await json(await get("/posts/owner-posted-today"));
    await raw`update posts set post_date = ${status.todayDate}`;
    expect((await json(await get("/posts/owner-posted-today"))).hasPostedToday).toBe(true);
    as(OUTSIDER);
    expect((await json(await get("/posts/owner-posted-today"))).hasPostedToday).toBe(false);
  });

  it("revoked / expired members are strangers again (no unlock from a dog they no longer have)", async () => {
    await raw`insert into posts (user_id, pet_id, caption, is_daily_update, post_date) values (${OWNER.profileId}, ${PET}, 's', true, '2026-01-01')`;
    for (const u of [REVOKED, EXPIRED]) {
      as(u);
      const status = await json(await get("/posts/owner-posted-today"));
      await raw`update posts set post_date = ${status.todayDate}`;
      expect((await json(await get("/posts/owner-posted-today"))).hasPostedToday, u.username).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("F. expiry is never shown as active", () => {
  it("?mine=true omits an expired grant (active OR pending); the owner's list shows 'expired' with is_expired", async () => {
    as(EXPIRED);
    expect((await json(await get("/pet-caregivers?mine=true"))).grants).toEqual([]);
    await raw`update pet_caregivers set status = 'pending', accepted_at = null where id = 4`;
    expect((await json(await get("/pet-caregivers?mine=true"))).grants).toEqual([]);
    await raw`update pet_caregivers set status = 'active' where id = 4`;
    as(OWNER);
    const list = (await json(await get(`/pet-caregivers?petId=${PET}`))).grants;
    const row = list.find((g: any) => g.id === 4);
    expect([row.status, row.is_expired]).toEqual(["expired", true]);
    expect(list.find((g: any) => g.id === 1).status).toBe("active");
    expect(list.find((g: any) => g.id === 1).is_expired).toBe(false);
  });

  it("an expired PENDING invite cannot be accepted: friendly 410, the row stays pending", async () => {
    await raw`update pet_caregivers set expires_at = ${PAST}::timestamptz where id = 5`;
    as(PENDING);
    const r = await req("/pet-caregivers/5/respond", "POST", { accept: true });
    expect(r.status).toBe(410);
    expect((await json(r)).code).toBe("invite_expired");
    expect((await raw`select status from pet_caregivers where id = 5`)[0].status).toBe("pending");
  });

  it("a pending invite with a future expiry still accepts", async () => {
    await raw`update pet_caregivers set expires_at = '2999-01-01T00:00:00Z' where id = 5`;
    as(PENDING);
    expect((await req("/pet-caregivers/5/respond", "POST", { accept: true })).status).toBe(200);
  });

  it("inviting with a past / garbage expiry is a friendly 400; a future one is created", async () => {
    as(OWNER);
    for (const bad of [PAST, "not-a-date"]) {
      const r = await req("/pet-caregivers", "POST", { petId: PET, role: "caregiver", granteeUsername: OUTSIDER.username, expiresAt: bad });
      expect(r.status, bad).toBe(400);
      expect((await json(r)).code).toBe("invalid_expiry");
    }
    expect((await req("/pet-caregivers", "POST", { petId: PET, role: "caregiver", granteeUsername: OUTSIDER.username, expiresAt: "2999-01-01T00:00:00Z" })).status).toBe(201);
  });

  it("an expired member is denied everywhere (reads, logs, opt-in list)", async () => {
    as(EXPIRED);
    expect((await get(`/routines?petId=${PET}`)).status).toBe(403);
    expect((await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(403);
    expect((await json(await get("/pets?include_shared=1"))).pets).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("G. no duplicate pets, and migration 0139 not applied is safe", () => {
  it("the whole role matrix never creates or changes a pet row", async () => {
    const before = await petCount();
    for (const u of [FAMILY, CARE, OUTSIDER, REVOKED, EXPIRED, PENDING]) {
      as(u);
      await get("/pets");
      await get("/pets?include_shared=1");
      await get(`/health/food-logs?petId=${PET}`);
      await get(`/routines?petId=${PET}`);
      await get(`/emergency-card?petId=${PET}`);
      await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" });
    }
    expect(await petCount()).toBe(before);
  });

  it("WITHOUT 0139 (policies absent): a caregiver reads nothing and logging is a friendly 403 — never a 500; owner + family unaffected", async () => {
    const drop = async (t: string) => {
      await raw.unsafe(`drop policy if exists ${t}_grantee_read on ${t}`);
      await raw.unsafe(`drop policy if exists ${t}_caregiver_insert on ${t}`);
    };
    // The whole integration run shares ONE cluster (resetDb only truncates), so the policies MUST be restored afterwards or every
    // later test file sees a database without 0139. Re-applying the migration is exactly the production procedure (idempotent).
    const restore = async () => {
      await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "0139_grantee_read_and_caregiver_log_rls.sql"), "utf8"));
    };
    try {
      for (const t of ["health_food_logs", "health_walk_logs", "health_poo_logs", "pet_emergency_cards", "pet_medications", "pet_allergies"]) await drop(t);
      await runWithout();
    } finally {
      await restore();
    }
    // …and prove the restore really put them back (a caregiver reads + logs again)
    as(CARE);
    expect(((await json(await get(`/health/food-logs?petId=${PET}`))).logs ?? []).length).toBeGreaterThan(0);
    expect((await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "again" })).status).toBe(201);
  });

  async function runWithout() {
    as(CARE);
    const read = await get(`/health/food-logs?petId=${PET}`);
    expect(read.status).toBe(200);
    expect((await json(read)).logs).toEqual([]);
    const log = await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" });
    expect(log.status).toBe(403);
    expect((await json(log)).code).toBe("caregiver_logging_unavailable");
    expect((await get(`/emergency-card?petId=${PET}`)).status).toBeLessThan(500);
    as(FAMILY); // family never depended on 0139
    expect((await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(201);
    expect(((await json(await get(`/health/food-logs?petId=${PET}`))).logs ?? []).length).toBeGreaterThan(0);
    as(OWNER);
    expect((await req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "x" })).status).toBe(201);
  }
});
