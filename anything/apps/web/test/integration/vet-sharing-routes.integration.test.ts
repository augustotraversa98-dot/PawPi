// Sharing the vet record by section (migration 0147), through the real Hono router + real Postgres as pawpi_app.
//   A. the by-scope body and its record / media responses        B. the by-section body: validation, expiry, stored row
//   C. each section opens its own data and files, nothing else   D. replacing a grant, 409, pending requests
//   E. expiry and revocation apply to the next request           F. who is denied, and one person staffing two vets
//   G. no write, and no other route, is opened by a grant by section
//   H. sharing while the vet's request is pending approves it with exactly the owner's choice
//   I. a limit on how often an owner can share

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedCapability, seedOwnerWithPet, seedPetCaregiver, seedProviderWithStaff, seedStaff, seedUser } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));
// Only the storage signing call is replaced; the key parsing and every access check are real.
vi.mock("@/app/api/utils/mediaAccess", async (original) => ({
  ...((await original()) as object),
  createSignedMediaUrl: async (key: string) => `https://signed.test/${key}`,
}));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "vet" };
const VET2 = { authUserId: 4, profileId: 4, username: "vet2" };
const BOTH = { authUserId: 5, profileId: 5, username: "both" };
const FORMER = { authUserId: 6, profileId: 6, username: "former" };
const FAMILY = { authUserId: 7, profileId: 7, username: "family" };
const P1 = 1;
const P2 = 2;
const PET = OWNER.petId;

const SECTIONS = [
  "profile", "emergency_contact", "insurance", "vet_notes", "vaccines", "files", "photos", "lab_results",
] as const;
type Section = (typeof SECTIONS)[number];

const PROFILE_COLUMNS: Record<string, string[]> = {
  profile: [
    "microchip_id", "spayed_neutered_status", "spayed_neutered_date", "primary_vet_name", "primary_clinic_name",
    "vet_phone", "vet_email", "medical_notes",
  ],
  emergency_contact: ["emergency_contact_name", "emergency_contact_phone"],
  insurance: ["insurance_provider", "insurance_policy_number"],
};
const ALL_PROFILE_COLUMNS = Object.values(PROFILE_COLUMNS).flat();

// Section → the key of the record response that carries its rows.
const ROWS_KEY: Partial<Record<Section, string>> = {
  vet_notes: "notes", vaccines: "vaccinations", files: "documents", photos: "photo_checks", lab_results: "lab_results",
};

const DOC_KEY = `pets/${PET}/doc.pdf`;
const PHOTO_KEY = `pets/${PET}/ear.jpg`;
const LOOSE_KEY = `pets/${PET}/chat.jpg`; // a private file of the pet that no record row points at
const ELSEWHERE_KEY = `pets/${PET}/elsewhere.pdf`; // only the OTHER pet's document row points at it
const OTHER_DOC_KEY = `pets/${OTHER.petId}/doc.pdf`;
const KEYS = [DOC_KEY, PHOTO_KEY, LOOSE_KEY, ELSEWHERE_KEY, OTHER_DOC_KEY];

let raw: Sql;
let watcher: Sql; // a second connection, to see another request waiting on a lock held by `raw`
let api: any;

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

const post = (body: object, user = OWNER) => { as(user); return req("/care-access/grants", "POST", body); };
const share = (sections: readonly string[], expiry = "until_revoked", providerId = P1) =>
  post({ petId: PET, providerId, sections, expiry });
const shareByScope = (extra: object = {}, providerId = P1) => post({ petId: PET, providerId, ...extra });
async function shared(sections: readonly string[], expiry = "until_revoked", providerId = P1) {
  const res = await share(sections, expiry, providerId);
  expect(res.status).toBe(201);
  return (await res.json()).grant;
}
const record = (user = VET, providerId = P1, petId = PET) => {
  as(user);
  return req(`/providers/${providerId}/pets/${petId}/record`);
};
const media = (key: string, user = VET, providerId = P1) => {
  as(user);
  return req(`/media?key=${encodeURIComponent(key)}&providerId=${providerId}`);
};
const openedKeys = async (user = VET, providerId = P1) => {
  const opened: string[] = [];
  for (const key of KEYS) {
    const res = await media(key, user, providerId);
    if (res.status === 302) {
      expect(res.headers.get("location")).toBe(`https://signed.test/${key}`);
      opened.push(key);
    } else {
      expect(res.status).toBe(403);
    }
  }
  return opened;
};
const grants = () => raw`select * from care_access_grants order by id`;
const audit = () => raw`select grant_id, staff_user_id, action, resource from care_access_audit order by id`;

beforeAll(async () => {
  raw = makeTestSql();
  watcher = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); await watcher.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  for (const u of [VET, VET2, BOTH, FORMER, FAMILY]) await seedUser(raw, u);
  await seedProviderWithStaff(raw, {
    providerId: P1, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId,
    staffRole: "owner", slug: "vet-1", providerStatus: "published",
  });
  await seedProviderWithStaff(raw, {
    providerId: P2, ownerUserProfileId: VET2.profileId, staffUserProfileId: VET2.profileId,
    staffRole: "owner", slug: "vet-2", providerStatus: "published",
  });
  await seedStaff(raw, { providerId: P1, userProfileId: BOTH.profileId });
  await seedStaff(raw, { providerId: P2, userProfileId: BOTH.profileId });
  await seedStaff(raw, { providerId: P1, userProfileId: FORMER.profileId, status: "removed" });
  await seedCapability(raw, { providerId: P1, capability: "vet" });
  await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });

  for (const [petId, ownerId] of [[PET, OWNER.profileId], [OTHER.petId, OTHER.profileId]]) {
    const s = `SECRET${petId}`;
    await raw`
      insert into pet_medical_profiles
        (pet_id, owner_user_id, microchip_id, spayed_neutered_status, spayed_neutered_date, primary_vet_name,
         primary_clinic_name, vet_phone, vet_email, medical_notes, emergency_contact_name, emergency_contact_phone,
         insurance_provider, insurance_policy_number)
      values (${petId}, ${ownerId}, ${`${s}-chip`}, 'Spayed', '2024-05-01', ${`${s}-vet`}, ${`${s}-clinic`},
              ${`${s}-vetphone`}, ${`${s}-vetemail`}, ${`${s}-mednotes`}, ${`${s}-kin`}, ${`${s}-kinphone`},
              ${`${s}-insurer`}, ${`${s}-policy`})`;
    await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note)
              values (${petId}, ${ownerId}, '2026-01-02', ${`${s}-note`})`;
    await raw`insert into pet_vaccinations (pet_id, owner_user_id, name) values (${petId}, ${ownerId}, ${`${s}-rabies`})`;
    await raw`insert into pet_vaccinations (pet_id, owner_user_id, name, deleted_at)
              values (${petId}, ${ownerId}, ${`${s}-removed`}, now())`;
    await raw`insert into vet_documents (pet_id, owner_user_id, name, document_type, file_url)
              values (${petId}, ${ownerId}, ${`${s}-doc`}, 'pdf', ${`pets/${petId}/doc.pdf`})`;
    await raw`insert into health_photo_checks (pet_id, owner_user_id, body_area, image_url)
              values (${petId}, ${ownerId}, 'ears', ${`pets/${petId}/ear.jpg`})`;
    await raw`insert into pet_lab_results (pet_id, owner_user_id, test_name, test_date)
              values (${petId}, ${ownerId}, ${`${s}-blood`}, '2026-01-01')`;
    await raw`insert into pet_allergies (pet_id, owner_user_id, allergen) values (${petId}, ${ownerId}, ${`${s}-pollen`})`;
  }
  await raw`insert into vet_documents (pet_id, owner_user_id, name, document_type, file_url)
            values (${OTHER.petId}, ${OTHER.profileId}, 'misfiled', 'pdf', ${ELSEWHERE_KEY})`;
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A. the by-scope body (existing clients)", () => {
  it("creates an active medical_read grant with no sections and no expiry (201), then dedupes (200)", async () => {
    const created = await shareByScope();
    expect(created.status).toBe(201);
    const { grant } = await created.json();
    expect(grant).toMatchObject({
      pet_id: PET, provider_id: P1, scopes: ["medical_read"], sections: null, expires_at: null,
      status: "active", requested_by: "owner",
    });
    const again = await shareByScope();
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ deduped: true, grant: { id: grant.id } });
    expect(await grants()).toHaveLength(1);
  });

  it("stores the scopes asked for, and keeps its status codes", async () => {
    expect((await post({ petId: PET })).status).toBe(400);
    expect((await shareByScope({ scopes: ["record_sections"] })).status).toBe(400);
    expect((await post({ petId: OTHER.petId, providerId: P1 })).status).toBe(404);
    expect((await shareByScope({}, 999)).status).toBe(404);
    expect((await post({ petId: PET, providerId: P1 }, FAMILY)).status).toBe(404);
    const res = await shareByScope({ scopes: ["medical_read", "appointments"] });
    expect(res.status).toBe(201);
    expect((await res.json()).grant.scopes).toEqual(["medical_read", "appointments"]);
  });

  it("record: profile (all columns), notes and vaccinations as before, plus sharedSections null", async () => {
    const { grant } = await (await shareByScope()).json();
    const res = await record();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["medical_profile", "notes", "sharedSections", "vaccinations"]);
    expect(body.sharedSections).toBeNull();
    for (const column of ALL_PROFILE_COLUMNS) expect(body.medical_profile[column], column).not.toBeNull();
    expect(body.notes).toHaveLength(1);
    expect(body.vaccinations.map((v: any) => v.name)).toEqual(["SECRET1-rabies"]);
    expect([...(await audit())]).toEqual([
      { grant_id: grant.id, staff_user_id: VET.profileId, action: "read", resource: "medical_record" },
    ]);
  });

  it("media: any private file of that pet by its exact key, no other pet's", async () => {
    await shareByScope();
    expect(await openedKeys()).toEqual([DOC_KEY, PHOTO_KEY, LOOSE_KEY, ELSEWHERE_KEY]);
  });

  it("a grant past its date no longer blocks a new one", async () => {
    await shareByScope();
    await raw`update care_access_grants set expires_at = now() - interval '1 minute'`;
    const res = await shareByScope();
    expect(res.status).toBe(201);
    expect((await grants()).map((g: any) => g.status)).toEqual(["expired", "active"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("B. the by-section body", () => {
  it.each([
    ["no expiry", { sections: ["vaccines"] }],
    ["no sections", { expiry: "7d" }],
    ["empty sections", { sections: [], expiry: "7d" }],
    ["an unknown section", { sections: ["allergies"], expiry: "7d" }],
    ["an unknown expiry", { sections: ["vaccines"], expiry: "90d" }],
    ["scopes with sections", { sections: ["vaccines"], expiry: "7d", scopes: ["medical_read"] }],
    ["scopes with expiry only", { expiry: "7d", scopes: ["medical_read"] }],
  ])("400 for %s, and nothing is shared", async (_label, extra) => {
    expect((await shareByScope(extra)).status).toBe(400);
    expect(await grants()).toHaveLength(0);
  });

  it("404 for another owner's pet, a family member and an unpublished provider", async () => {
    const body = { sections: ["vaccines"], expiry: "7d" };
    expect((await post({ petId: OTHER.petId, providerId: P1, ...body })).status).toBe(404);
    expect((await post({ petId: PET, providerId: P1, ...body }, FAMILY)).status).toBe(404);
    await raw`update providers set status = 'draft' where id = ${P1}`;
    expect((await shareByScope(body)).status).toBe(404);
    expect(await grants()).toHaveLength(0);
  });

  it.each([
    ["7d", "7 days"],
    ["30d", "30 days"],
    ["1y", "1 year"],
    ["until_revoked", null],
  ])("expiry %s is computed by the server", async (expiry, interval) => {
    const grant = await shared(["vaccines"], expiry);
    expect(grant).toMatchObject({
      scopes: ["record_sections"], sections: ["vaccines"], status: "active", requested_by: "owner",
    });
    const [row] = await raw`
      select expires_at, expires_at = granted_at + ${interval}::interval as exact from care_access_grants where id = ${grant.id}`;
    if (interval === null) {
      expect(grant.expires_at).toBeNull();
      expect(row.expires_at).toBeNull();
    } else {
      expect(row.exact).toBe(true);
      expect(new Date(grant.expires_at).getTime()).toBe(new Date(row.expires_at).getTime());
    }
  });

  it("stores each chosen section once, in the fixed order, and the owner's list shows it", async () => {
    await shared(["lab_results", "profile", "profile"], "30d");
    as(OWNER);
    const [row] = (await (await req("/care-access/grants?status=active")).json()).grants;
    expect(row).toMatchObject({
      scopes: ["record_sections"], sections: ["profile", "lab_results"], status: "active",
      provider_id: P1, pet_id: PET, pet_name: "Rex",
    });
    expect(row.expires_at).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("C. each section opens its own data and files, nothing else", () => {
  const assertOnly = async (chosen: readonly Section[], grantId: number) => {
    const res = await record();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sharedSections).toEqual(SECTIONS.filter((s) => chosen.includes(s)));
    expect(Object.keys(body).sort()).toEqual(
      ["documents", "lab_results", "medical_profile", "notes", "photo_checks", "sharedSections", "vaccinations"],
    );
    for (const [section, key] of Object.entries(ROWS_KEY)) {
      expect(body[key as string], section).toHaveLength(chosen.includes(section as Section) ? 1 : 0);
    }
    const columns = chosen.flatMap((s) => PROFILE_COLUMNS[s] ?? []);
    if (columns.length === 0) {
      expect(body.medical_profile).toBeNull();
    } else {
      for (const column of ALL_PROFILE_COLUMNS) {
        if (columns.includes(column)) expect(body.medical_profile[column], column).not.toBeNull();
        else expect(body.medical_profile[column], column).toBeNull();
      }
    }
    // Nothing of the other pet, nothing that is never shared, no deleted vaccination.
    expect(JSON.stringify(body)).not.toMatch(/SECRET2|SECRET1-pollen|SECRET1-removed/);

    const expected = [
      ...(chosen.includes("files") ? [DOC_KEY] : []),
      ...(chosen.includes("photos") ? [PHOTO_KEY] : []),
    ];
    expect(await openedKeys()).toEqual(expected);

    // One audit row per successful read, none for a refused file.
    expect([...(await audit())]).toEqual(
      ["medical_record", ...expected.map((k) => `media:${k}`)].map((resource) => ({
        grant_id: grantId, staff_user_id: VET.profileId, action: "read", resource,
      })),
    );
  };

  it.each(SECTIONS)("only %s", async (section) => {
    const grant = await shared([section]);
    await assertOnly([section], grant.id);
  });

  it("all of them together", async () => {
    const grant = await shared(SECTIONS);
    await assertOnly(SECTIONS, grant.id);
  });

  it("a section with nothing recorded is empty, not an error", async () => {
    await raw`delete from pet_medical_profiles where pet_id = ${PET}`;
    await shared(["profile", "files"]);
    await raw`delete from vet_documents where pet_id = ${PET}`;
    const body = await (await record()).json();
    expect(body.medical_profile).toBeNull();
    expect(body.documents).toEqual([]);
    expect((await media(DOC_KEY)).status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("D. replacing a grant", () => {
  it("by section over by scope: the old one ends and only the new choice applies", async () => {
    const { grant: old } = await (await shareByScope()).json();
    const next = await shared(["vaccines"], "7d");
    expect(next.id).not.toBe(old.id);
    const rows = await grants();
    expect(rows.map((g: any) => [g.id, g.status])).toEqual([[old.id, "revoked"], [next.id, "active"]]);
    expect(rows[0].revoked_at).not.toBeNull();
    expect((await (await record()).json()).sharedSections).toEqual(["vaccines"]);
    expect(await openedKeys()).toEqual([]);
  });

  it("by section over by section: never the union of both", async () => {
    await shared(["files", "insurance"]);
    await shared(["photos"], "1y");
    const body = await (await record()).json();
    expect(body.sharedSections).toEqual(["photos"]);
    expect(body.documents).toEqual([]);
    expect(body.medical_profile).toBeNull();
    expect(await openedKeys()).toEqual([PHOTO_KEY]);
    expect((await grants()).map((g: any) => g.status)).toEqual(["revoked", "active"]);
  });

  it("two shares at once both succeed and leave exactly one active", async () => {
    as(OWNER);
    const results = await Promise.all(
      ["files", "photos"].map((s) =>
        req("/care-access/grants", "POST", { petId: PET, providerId: P1, sections: [s], expiry: "7d" })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect((await grants()).map((g: any) => g.status).sort()).toEqual(["active", "revoked"]);
  });

  it("only that vet's grant is replaced", async () => {
    await shared(["files"], "until_revoked", P2);
    await shared(["vaccines"]);
    await shared(["photos"]);
    expect((await grants()).filter((g: any) => g.provider_id === P2).map((g: any) => g.status)).toEqual(["active"]);
  });

  it("by scope over an active grant by section: 409 sectioned_grant_exists, nothing changes", async () => {
    await shared(["vaccines"], "7d");
    const before = await grants();
    for (const extra of [{}, { scopes: ["appointments"] }]) {
      const res = await shareByScope(extra);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: "sectioned_grant_exists", error: expect.any(String) });
    }
    expect(await grants()).toEqual(before);
    expect((await (await record()).json()).sharedSections).toEqual(["vaccines"]);
  });

  it("by scope after the grant by section has expired or been revoked: 201", async () => {
    const first = await shared(["vaccines"], "7d");
    await raw`update care_access_grants set expires_at = now() - interval '1 second' where id = ${first.id}`;
    expect((await shareByScope()).status).toBe(201);
    expect((await grants()).map((g: any) => g.status)).toEqual(["expired", "active"]);
  });

  it("a vet's request: blocked by an active grant by section, allowed once it has expired", async () => {
    await shared(["vaccines"], "7d");
    const ask = () => { as(VET); return req(`/providers/${P1}/access-requests`, "POST", { petId: PET, scopes: ["medical_read"] }); };
    expect((await ask()).status).toBe(409);
    await raw`update care_access_grants set expires_at = now() - interval '1 second'`;
    expect((await ask()).status).toBe(201);
    expect((await grants()).map((g: any) => g.status)).toEqual(["expired", "pending"]);
  });

  it("a vet cannot ask for the by-section scope", async () => {
    as(VET);
    const res = await req(`/providers/${P1}/access-requests`, "POST", { petId: PET, scopes: ["record_sections"] });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("E. expiry and revocation apply to the next request", () => {
  const listed = async (query = "") => {
    as(OWNER);
    return (await (await req(`/care-access/grants${query}`)).json()).grants;
  };

  it.each([
    ["by section", () => share(SECTIONS, "7d")],
    ["by scope", () => shareByScope()],
  ])("expired (%s): no record, no file, listed as expired", async (_label, make) => {
    const { grant } = await (await make()).json();
    expect((await record()).status).toBe(200);
    expect((await media(DOC_KEY)).status).toBe(302);
    await raw`update care_access_grants set expires_at = now() - interval '1 second' where id = ${grant.id}`;
    const reads = (await audit()).length;

    expect((await record()).status).toBe(403);
    expect(await openedKeys()).toEqual([]);
    expect(await audit()).toHaveLength(reads);
    // The stored row still says active; the list reports what is true.
    expect((await grants())[0].status).toBe("active");
    expect((await listed()).map((g: any) => g.status)).toEqual(["expired"]);
    expect((await listed("?status=expired")).map((g: any) => g.id)).toEqual([grant.id]);
    expect(await listed("?status=active")).toEqual([]);
    expect(await listed(`?status=active&petId=${PET}`)).toEqual([]);
  });

  it("a revoked grant stays revoked in the list even past its date", async () => {
    const grant = await shared(["vaccines"], "7d");
    await raw`update care_access_grants set status = 'revoked', expires_at = now() - interval '1 day' where id = ${grant.id}`;
    expect((await listed()).map((g: any) => g.status)).toEqual(["revoked"]);
    expect(await listed("?status=expired")).toEqual([]);
  });

  it("revoked by the owner: no record and no file", async () => {
    const grant = await shared(SECTIONS);
    expect((await record()).status).toBe(200);
    as(OWNER);
    expect((await req(`/care-access/grants/${grant.id}`, "PATCH", { action: "revoke" })).status).toBe(200);
    expect((await record()).status).toBe(403);
    expect(await openedKeys()).toEqual([]);
    expect((await listed()).map((g: any) => g.status)).toEqual(["revoked"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("F. who is denied", () => {
  it("another provider, someone else's staff, former staff, strangers and signed-out callers", async () => {
    await shared(SECTIONS);
    for (const [user, providerId] of [[VET2, P2], [VET2, P1], [VET, P2], [FORMER, P1], [OTHER, P1]] as const) {
      expect((await record(user, providerId)).status, `${user.username} via ${providerId}`).toBe(403);
      expect((await media(DOC_KEY, user, providerId)).status).toBe(403);
      expect((await media(PHOTO_KEY, user, providerId)).status).toBe(403);
    }
    expect((await record(VET, P1, OTHER.petId)).status).toBe(403);
    expect((await record(FAMILY, P1)).status).toBe(403);
    authState.session = null;
    expect((await req(`/providers/${P1}/pets/${PET}/record`)).status).toBe(401);
    expect((await req(`/media?key=${encodeURIComponent(DOC_KEY)}&providerId=${P1}`)).status).toBe(401);
    expect(await audit()).toHaveLength(0);
  });

  it("staff of two vets sees through each one only what that vet was given", async () => {
    await shared(["vaccines", "insurance"], "until_revoked", P1);
    await shared(["files", "emergency_contact"], "until_revoked", P2);

    const one = await (await record(BOTH, P1)).json();
    expect(one.sharedSections).toEqual(["insurance", "vaccines"]);
    expect(one.documents).toEqual([]);
    expect(one.medical_profile.emergency_contact_name).toBeNull();
    expect(one.medical_profile.insurance_provider).toBe("SECRET1-insurer");
    expect(await openedKeys(BOTH, P1)).toEqual([]);

    const two = await (await record(BOTH, P2)).json();
    expect(two.vaccinations).toEqual([]);
    expect(two.medical_profile.insurance_provider).toBeNull();
    expect(two.medical_profile.emergency_contact_name).toBe("SECRET1-kin");
    expect(await openedKeys(BOTH, P2)).toEqual([DOC_KEY]);
  });

  it("a medical_read grant at another vet does not widen a grant by section", async () => {
    await shared(["vaccines"], "until_revoked", P1);
    expect((await shareByScope({}, P2)).status).toBe(201);
    const body = await (await record(BOTH, P1)).json();
    expect(body.sharedSections).toEqual(["vaccines"]);
    expect(body.medical_profile).toBeNull();
    expect(body.notes).toEqual([]);
    expect(await openedKeys(BOTH, P1)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("G. nothing else is opened", () => {
  it("no provider write", async () => {
    await shared(SECTIONS);
    as(VET);
    const base = `/providers/${P1}/pets/${PET}`;
    expect((await req(`${base}/notes`, "POST", { note: "x" })).status).toBe(403);
    expect((await req(`${base}/vaccinations`, "POST", { name: "x" })).status).toBe(403);
    expect((await req(`${base}/prescriptions`, "POST", { drug_name: "x", dose: "1", frequency: "daily" })).status).toBe(403);
    const [counts] = await raw`
      select (select count(*)::int from vet_notes) as notes, (select count(*)::int from pet_vaccinations) as vax,
             (select count(*)::int from prescriptions) as rx`;
    expect(counts).toEqual({ notes: 2, vax: 4, rx: 0 });
  });

  // Family-side routes that read the shared tables. The second list answers the family with record values or file keys,
  // which is what makes "nothing for the vet" below a real check.
  const OTHER_ROUTES = [
    `/health/photo-checks`,
    `/pets/${PET}/daycare-stays`,
    `/pets/${PET}/vet-summary-readiness`,
    `/pets/${PET}/weekly-digest`,
    `/providers/${P1}/pets/${PET}/vaccine-check`,
    `/providers/${P1}/pets/${PET}/walk-sessions`,
    `/providers/${P1}/pets/${PET}/groom-sessions`,
  ];
  const RECORD_ROUTES = [
    `/vet-record/notes?petId=${PET}`,
    `/vet-record/documents?petId=${PET}`,
    `/vet-record/lab-results?petId=${PET}`,
    `/vet-record/full-summary?petId=${PET}&from=2000-01-01&to=2100-01-01`,
    `/pet-vaccinations?petId=${PET}`,
    `/pet-medical-profiles?petId=${PET}`,
    `/health/photo-checks?petId=${PET}`,
    `/emergency-card?petId=${PET}`,
  ];
  const OWNER_DATA = /SECRET1|pets\/1\//;

  it("the family's own record routes give provider staff nothing about the pet", async () => {
    await shared(SECTIONS);
    as(OWNER);
    for (const path of RECORD_ROUTES) {
      expect(await (await req(path)).text(), path).toMatch(OWNER_DATA);
    }
    as(VET);
    for (const path of [...RECORD_ROUTES, ...OTHER_ROUTES, `/vet-record/summary?petId=${PET}`, `/health/timeline?petId=${PET}`]) {
      const res = await req(path);
      expect(res.status, path).toBeLessThan(500);
      expect(await res.text(), path).not.toMatch(OWNER_DATA);
    }
    const timeline = await (await req(`/health/timeline?petId=${PET}`)).text();
    expect(timeline).not.toContain("photo_check");
    // Without ?providerId a vet is not the pet's family.
    expect((await req(`/media?key=${encodeURIComponent(DOC_KEY)}`)).status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("H. the vet's request is still pending", () => {
  // Everything a request can ask for that the owner's share does not open unless chosen.
  const ASKED = ["medical_read", "medical_write", "vaccinations_write", "appointments", "health_logs_read"];
  const ask = async (scopes: string[] = ASKED, providerId = P1, user = VET) => {
    as(user);
    const res = await req(`/providers/${providerId}/access-requests`, "POST", { petId: PET, scopes });
    expect(res.status).toBe(201);
    return (await res.json()).grant;
  };
  const writeStatuses = async () => {
    as(VET);
    const base = `/providers/${P1}/pets/${PET}`;
    return [
      (await req(`${base}/notes`, "POST", { note: "x" })).status,
      (await req(`${base}/vaccinations`, "POST", { name: "x" })).status,
    ];
  };
  const columns = (rows: any) =>
    [...rows].map((g: any) => [g.id, g.status, g.requested_by, g.scopes, g.sections]);

  it.each([
    ["7d", "7 days"],
    ["30d", "30 days"],
    ["1y", "1 year"],
    ["until_revoked", null],
  ])("by section (%s): the request is approved with exactly that choice (200)", async (expiry, interval) => {
    const request = await ask();
    expect((await record()).status).toBe(403);

    const res = await share(["vaccines", "profile"], expiry);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["approvedRequest", "grant"]);
    expect(body.approvedRequest).toBe(true);
    expect(body.grant).toMatchObject({
      id: request.id, pet_id: PET, provider_id: P1, status: "active", requested_by: "provider",
      scopes: ["record_sections"], sections: ["profile", "vaccines"], revoked_at: null,
    });
    const [row] = await raw`
      select granted_at, expires_at, expires_at = granted_at + ${interval}::interval as exact
      from care_access_grants where id = ${request.id}`;
    expect(new Date(body.grant.granted_at).getTime()).toBe(row.granted_at.getTime());
    if (interval === null) {
      expect(body.grant.expires_at).toBeNull();
      expect(row.expires_at).toBeNull();
    } else {
      expect(row.exact).toBe(true);
      expect(new Date(body.grant.expires_at).getTime()).toBe(row.expires_at.getTime());
    }
    expect(await grants()).toHaveLength(1);

    const shown = await (await record()).json();
    expect(shown.sharedSections).toEqual(["profile", "vaccines"]);
    expect(shown.notes).toEqual([]);
    expect(await openedKeys()).toEqual([]);
    expect(await writeStatuses()).toEqual([403, 403]);
  });

  it.each([
    ["no scopes named", {}, ["medical_read"]],
    ["scopes named", { scopes: ["appointments"] }, ["appointments"]],
  ])("by scope (%s): approved with the owner's scopes only, no expiry (200)", async (_label, extra, scopes) => {
    const request = await ask(["medical_write", "vaccinations_write", "messaging"]);
    // Whatever date the pending row carried, a share by scope has none.
    await raw`update care_access_grants set expires_at = now() + interval '1 day'`;

    const res = await shareByScope(extra);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["approvedRequest", "grant"]);
    expect(body.approvedRequest).toBe(true);
    expect(body.grant).toMatchObject({
      id: request.id, status: "active", requested_by: "provider", scopes, sections: null, expires_at: null,
    });
    expect(body.grant.granted_at).not.toBeNull();
    expect(await grants()).toHaveLength(1);
    expect(await writeStatuses()).toEqual([403, 403]);
    expect((await record()).status).toBe(scopes.includes("medical_read") ? 200 : 403);
  });

  it("the owner's date replaces any date the pending row carried", async () => {
    await ask();
    await raw`update care_access_grants set expires_at = now() + interval '2 years'`;
    expect((await share(["vaccines"], "7d")).status).toBe(200);
    const [row] = await raw`select expires_at = granted_at + interval '7 days' as exact from care_access_grants`;
    expect(row.exact).toBe(true);
  });

  it.each([
    ["by section", () => share(["vaccines"], "7d")],
    ["by scope", () => shareByScope()],
  ])("a pending request past its date is closed and a new grant is created (%s, 201)", async (_label, make) => {
    const request = await ask();
    await raw`update care_access_grants set expires_at = now() - interval '1 second'`;
    const res = await make();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.approvedRequest).toBeUndefined();
    expect(body.grant.id).not.toBe(request.id);
    expect((await grants()).map((g: any) => [g.status, g.requested_by])).toEqual([
      ["expired", "provider"], ["active", "owner"],
    ]);
  });

  it("only the request of that vet for that pet is answered", async () => {
    await ask(ASKED, P1, VET);
    await ask(ASKED, P2, VET2);
    as(VET);
    expect((await req(`/providers/${P1}/access-requests`, "POST", { petId: OTHER.petId, scopes: ASKED })).status).toBe(201);
    const untouched = [...(await grants())].slice(1);

    expect((await share(["vaccines"])).status).toBe(200);
    const after = [...(await grants())];
    expect(after[0].status).toBe("active");
    expect(after.slice(1)).toEqual(untouched);
    expect((await record(VET2, P2)).status).toBe(403);
    expect((await record(VET, P1, OTHER.petId)).status).toBe(403);
  });

  it("nobody but the pet's owner can answer it by sharing", async () => {
    await ask();
    const before = await grants();
    for (const user of [FAMILY, OTHER, VET, BOTH, FORMER]) {
      for (const extra of [{}, { sections: ["vaccines"], expiry: "7d" }]) {
        const res = await post({ petId: PET, providerId: P1, ...extra }, user);
        expect(res.status, user.username).toBe(404);
      }
    }
    authState.session = null;
    expect((await req("/care-access/grants", "POST", { petId: PET, providerId: P1 })).status).toBe(401);
    expect(await grants()).toEqual(before);
  });

  it("a refused body, or an unpublished provider, leaves it pending", async () => {
    await ask();
    const before = await grants();
    expect((await shareByScope({ sections: [], expiry: "7d" })).status).toBe(400);
    expect((await shareByScope({ expiry: "7d" })).status).toBe(400);
    expect((await shareByScope({ scopes: ["record_sections"] })).status).toBe(400);
    await raw`update providers set status = 'draft' where id = ${P1}`;
    expect((await share(["vaccines"])).status).toBe(404);
    expect(await grants()).toEqual(before);
  });

  it("afterwards it behaves like any active grant: dedup by scope, replacement by section, revoke", async () => {
    const request = await ask();
    expect((await shareByScope()).status).toBe(200);
    const again = await shareByScope();
    expect(await again.json()).toMatchObject({ deduped: true, grant: { id: request.id } });
    const next = await shared(["photos"]);
    expect((await grants()).map((g: any) => g.status)).toEqual(["revoked", "active"]);
    as(OWNER);
    expect((await req(`/care-access/grants/${next.id}`, "PATCH", { action: "revoke" })).status).toBe(200);
    expect((await record()).status).toBe(403);
  });

  // ── at the same time ───────────────────────────────────────────────────────────────────────
  const together = (bodies: object[]) => {
    as(OWNER);
    return Promise.all(
      bodies.map((b) => req("/care-access/grants", "POST", { petId: PET, providerId: P1, ...b })),
    );
  };

  it("two shares by section at once: one approves, the other replaces it", async () => {
    const request = await ask();
    const results = await together(["files", "photos"].map((s) => ({ sections: [s], expiry: "7d" })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    const rows = [...(await grants())];
    expect(rows.map((g: any) => [g.id === request.id, g.status])).toEqual([[true, "revoked"], [false, "active"]]);
    for (const g of rows) expect(g.scopes).toEqual(["record_sections"]);
  });

  it("two shares by scope at once: one approves, the other gets the same grant", async () => {
    const request = await ask();
    const results = await together([{}, {}]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(bodies.map((b) => b.grant.id)).toEqual([request.id, request.id]);
    expect(bodies.map((b) => Object.keys(b).sort().join()).sort()).toEqual(["approvedRequest,grant", "deduped,grant"]);
    expect(columns(await grants())).toEqual([[request.id, "active", "provider", ["medical_read"], null]]);
  });

  it("one share of each shape at once leaves exactly one of the two choices active", async () => {
    await ask();
    await together([{}, { sections: ["vaccines"], expiry: "7d" }]);
    const active = [...(await grants())].filter((g: any) => g.status !== "revoked");
    expect(active.map((g: any) => [g.status, g.scopes, g.sections])).toEqual([
      ["active", ["record_sections"], ["vaccines"]],
    ]);
  });

  // Runs `request` while `change` is made but not yet committed on another connection, and commits only once the
  // request is waiting for it.
  const whileUncommitted = async (change: (tx: any) => Promise<unknown>, request: () => Promise<Response>) => {
    let response: Promise<Response> | undefined;
    await raw.begin(async (tx) => {
      await change(tx);
      response = Promise.resolve(request());
      await vi.waitFor(async () => {
        const [{ waiting }] = await watcher`select count(*)::int as waiting from pg_locks where not granted`;
        expect(waiting).toBeGreaterThan(0);
      }, { timeout: 10_000, interval: 20 });
    });
    return response!;
  };

  const requestArrives = (tx: any) => tx`
    insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
    values (${PET}, ${OWNER.profileId}, ${P1}, ${ASKED}, 'pending', 'provider')`;

  it.each([
    ["by section", () => share(["vaccines"], "7d"), ["record_sections"], ["vaccines"]],
    ["by scope", () => shareByScope(), ["medical_read"], null],
  ])("a request that arrives during the share is approved with the choice (%s)", async (_l, make, scopes, sections) => {
    const res = await whileUncommitted(requestArrives, make);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ approvedRequest: true, grant: { scopes, sections } });
    expect(columns(await grants())).toEqual([[expect.any(Number), "active", "provider", scopes, sections]]);
  });

  it.each([
    ["by section", () => share(["vaccines"], "7d"), 201, ["record_sections"], ["vaccines"]],
    // The approval of the request already opened more than this share asks for: it is what stands.
    ["by scope", () => shareByScope(), 200, ASKED, null],
  ])("the request being approved during the share (%s)", async (_l, make, status, scopes, sections) => {
    const request = await ask();
    const res = await whileUncommitted(
      (tx) => tx`update care_access_grants set status = 'active', granted_at = now() where id = ${request.id}`,
      make,
    );
    expect(res.status).toBe(status);
    const active = [...(await grants())].filter((g: any) => g.status === "active");
    expect(active.map((g: any) => [g.scopes, g.sections])).toEqual([[scopes, sections]]);
  });

  it("an approval that loses to a share changes nothing (409): the chosen date stays", async () => {
    const request = await ask();
    // What a share by section stores, committing while the approval is already under way.
    const res = await whileUncommitted(
      (tx) => tx`
        update care_access_grants
        set status = 'active', scopes = array['record_sections'], sections = array['vaccines'], granted_at = now(),
            expires_at = now() + interval '7 days'
        where id = ${request.id}`,
      () => { as(OWNER); return req(`/care-access/grants/${request.id}`, "PATCH", { action: "approve" }); },
    );
    expect(res.status).toBe(409);
    const [row] = await grants();
    expect(row.expires_at).not.toBeNull();
    expect(row.sections).toEqual(["vaccines"]);
  });

  const answer = (grantId: number, action: string) => () => {
    as(OWNER);
    return req(`/care-access/grants/${grantId}`, "PATCH", { action });
  };
  const endedNotices = async () =>
    (await raw`select count(*)::int as n from notifications where type = 'care_access_revoked'`)[0].n;

  it("a revoke of a grant that a new share is replacing changes nothing (409) and sends no notice", async () => {
    const old = await shared(["vaccines"]);
    // What a share by section stores over an active grant: that one ends and a new row takes its place.
    const res = await whileUncommitted(
      async (tx) => {
        await tx`update care_access_grants set status = 'revoked', revoked_at = now() where id = ${old.id}`;
        await tx`
          insert into care_access_grants
            (pet_id, owner_user_id, provider_id, scopes, sections, status, requested_by, granted_at)
          values (${PET}, ${OWNER.profileId}, ${P1}, array['record_sections'], array['photos'], 'active', 'owner', now())`;
      },
      answer(old.id, "revoke"),
    );
    expect(res.status).toBe(409);
    expect(await endedNotices()).toBe(0);
    const [, next] = await grants();
    expect(next.status).toBe("active");
    // The new grant is the owner's to end.
    expect((await answer(next.id, "revoke")()).status).toBe(200);
    expect(await endedNotices()).toBe(2); // one per active staff member
    expect((await record()).status).toBe(403);
  });

  it("a revoke of a grant that is already being revoked answers 409 and sends no notice", async () => {
    const grant = await shared(["vaccines"]);
    const res = await whileUncommitted(
      (tx) => tx`update care_access_grants set status = 'revoked', revoked_at = now() where id = ${grant.id}`,
      answer(grant.id, "revoke"),
    );
    expect(res.status).toBe(409);
    expect(await endedNotices()).toBe(0);
  });

  it("a deny that overlaps an approval changes nothing (409): the grant stays active", async () => {
    const request = await ask();
    const res = await whileUncommitted(
      (tx) => tx`update care_access_grants set status = 'active', granted_at = now() where id = ${request.id}`,
      answer(request.id, "deny"),
    );
    expect(res.status).toBe(409);
    const [row] = await grants();
    expect([row.status, row.revoked_at]).toEqual(["active", null]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("I. how often an owner can share", () => {
  const LIMIT = 20;
  const answer = (grantId: number, action: string) => {
    as(OWNER);
    return req(`/care-access/grants/${grantId}`, "PATCH", { action });
  };
  const noticeCount = async () => (await raw`select count(*)::int as n from notifications`)[0].n;
  // LIMIT shares, each but the last one revoked again. Returns the grant left active.
  const useTheLimit = async () => {
    for (let i = 1; i < LIMIT; i++) {
      const grant = await shared(["vaccines"]);
      expect((await answer(grant.id, "revoke")).status).toBe(200);
    }
    return shared(["vaccines"]);
  };

  it(`takes ${LIMIT} shares an hour; the next one, of either shape, is a 429 that changes and sends nothing`, async () => {
    await useTheLimit();
    const before = await grants();
    const sent = await noticeCount();
    for (const res of [await share(["photos"]), await shareByScope()]) {
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(await res.json()).toMatchObject({ code: "rate_limited" });
    }
    expect(await grants()).toEqual(before);
    expect(await noticeCount()).toBe(sent);
  });

  it("revoking, approving and denying still work once the limit is reached", async () => {
    const active = await useTheLimit();
    expect((await share(["vaccines"], "7d", P2)).status).toBe(429);
    expect((await answer(active.id, "revoke")).status).toBe(200);
    for (const action of ["deny", "approve", "revoke"]) {
      let id: number;
      if (action === "revoke") {
        [{ id }] = await raw`select id from care_access_grants where status = 'active'`;
      } else {
        as(VET2);
        const asked = await req(`/providers/${P2}/access-requests`, "POST", { petId: PET, scopes: ["medical_read"] });
        expect(asked.status).toBe(201);
        id = (await asked.json()).grant.id;
      }
      expect((await answer(id, action)).status, action).toBe(200);
    }
    expect([...(await grants())].filter((g: any) => g.status !== "revoked")).toEqual([]);
  });

  it("is counted per owner", async () => {
    await useTheLimit();
    expect((await share(["vaccines"])).status).toBe(429);
    expect((await post({ petId: OTHER.petId, providerId: P1 }, OTHER)).status).toBe(201);
  });
});
