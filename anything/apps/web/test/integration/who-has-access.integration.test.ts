// "Who has access" (GET /api/care-access/who-has-access), through the real Hono router + real Postgres as pawpi_app.
//   A. each way of sharing, created one at a time through its own route, adds exactly one entry; ending it removes it
//   B. what is not access is not listed: requests, invitations, expired, revoked, declined and left rows, an inactive card
//   C. only the owner's own list: another owner, a family member and a signed-out caller see none of it
//   D. a database without an optional table, and with or without the edit permission column

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { Sql } from "postgres";
import {
  makeTestSql, resetDb, seedCapability, seedOwnerWithPet, seedPetCaregiver, seedProviderWithStaff, seedUser,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 11, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 12, username: "other", petId: 3, petName: "Duke" };
const SECOND_PET = 2;
const VET = { authUserId: 3, profileId: 13, username: "vet" };
const FAMILY = { authUserId: 4, profileId: 14, username: "maria" };
const NEWCOMER = { authUserId: 5, profileId: 15 };
const P1 = 1;
const P2 = 2;

let raw: Sql;
let api: any;

type Person = { authUserId: number };
const as = (u: Person | null) => { authState.session = u ? { user: { id: u.authUserId } } : null; };
const send = (user: Person | null, path: string, method = "GET", body?: unknown) => {
  as(user);
  return api.request(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};
async function entries(user: Person = OWNER) {
  const res = await send(user, "/care-access/who-has-access");
  expect(res.status).toBe(200);
  return (await res.json()).entries as any[];
}
const keys = async (user: Person = OWNER) =>
  (await entries(user)).map((e) => `${e.kind}:${e.pet_id}:${e.id}`).sort();

async function ok(res: Response, status: number) {
  expect(res.status).toBe(status);
  return res.json();
}
const shareWithVet = async (petId = OWNER.petId, providerId = P1, expiry = "30d") =>
  (await ok(await send(OWNER, "/care-access/grants", "POST", {
    petId, providerId, sections: ["vaccines", "vet_notes"], expiry,
  }), 201)).grant;
const createRecordLink = async (petId = OWNER.petId, allowNotes = false) =>
  ok(await send(OWNER, "/care-access/links", "POST", { petId, sections: ["files"], expiry: "7d", allowNotes }), 201);
async function createEmergencyLink(petId = OWNER.petId, ttlHours: number | null = null, scope = "full") {
  // Opening the card creates it, as the app does before a link can be made.
  await ok(await send(OWNER, `/emergency-card?petId=${petId}`), 200);
  return (await ok(await send(OWNER, "/emergency-card/links", "POST", { petId, scope, ttlHours }), 201)).link;
}
async function addFamily(petId = OWNER.petId, role = "family", expiresAt: string | null = null) {
  const { grant } = await ok(await send(OWNER, "/pet-caregivers", "POST", {
    petId, granteeUserId: FAMILY.profileId, role, expiresAt,
  }), 201);
  await ok(await send(FAMILY, `/pet-caregivers/${grant.id}/respond`, "POST", { accept: true }), 200);
  return grant;
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  await raw`insert into pets (id, owner_user_id, name, handle)
            values (${SECOND_PET}, ${OWNER.profileId}, 'Luna', 'owner-luna')`;
  await seedUser(raw, VET);
  await seedUser(raw, FAMILY);
  for (const [providerId, slug] of [[P1, "north-vet"], [P2, "south-vet"]] as const) {
    await seedProviderWithStaff(raw, {
      providerId, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId, slug,
      staffRole: "owner", providerStatus: "published",
    });
    await seedCapability(raw, { providerId, capability: "vet" });
  }
});

describe("A. every way of sharing, one at a time", () => {
  it("starts empty", async () => {
    expect(await entries()).toEqual([]);
  });

  it("a vet grant: one entry with what it opens and until when; revoking it empties the list", async () => {
    const grant = await shareWithVet();
    const list = await entries();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      kind: "vet", id: grant.id, pet_id: 1, pet_name: "Rex", provider_id: P1, provider_name: "north-vet",
      scopes: ["record_sections"], sections: ["vet_notes", "vaccines"], edit_sections: [], expires_at: grant.expires_at,
    });
    await ok(await send(OWNER, `/care-access/grants/${grant.id}`, "PATCH", { action: "revoke" }), 200);
    expect(await entries()).toEqual([]);
  });

  it("an older grant by scope is listed with its scopes and no sections", async () => {
    await ok(await send(OWNER, "/care-access/grants", "POST", { petId: 1, providerId: P1 }), 201);
    expect((await entries())[0]).toMatchObject({
      kind: "vet", sections: null, scopes: ["medical_read"], expires_at: null, edit_sections: [],
    });
  });

  it("a record link: one entry with its sections and whether notes can be added; never its address", async () => {
    const created = await createRecordLink(SECOND_PET, true);
    const token = created.url.split("#")[1];
    const list = await entries();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      kind: "record_link", id: created.link.id, pet_id: SECOND_PET, pet_name: "Luna", sections: ["files"],
      allow_notes: true, edit_sections: ["vet_notes"], expires_at: created.link.expires_at,
    });
    expect(JSON.stringify(list)).not.toContain(token);
    expect(Object.keys(list[0])).not.toContain("token_hash");
    await ok(await send(OWNER, `/care-access/links/${created.link.id}`, "PATCH", { action: "revoke" }), 200);
    expect(await entries()).toEqual([]);
  });

  it("an emergency card link: one entry with its scope, never its token; revoking it empties the list", async () => {
    const link = await createEmergencyLink(OWNER.petId, 24, "basic");
    const list = await entries();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      kind: "emergency_link", id: link.id, pet_id: 1, pet_name: "Rex", scope: "basic", expires_at: link.expires_at,
    });
    expect(JSON.stringify(list)).not.toContain(link.token);
    await ok(await send(OWNER, `/emergency-card/links/${link.id}`, "DELETE"), 200);
    expect(await entries()).toEqual([]);
  });

  it("a family member: listed only once the invitation is accepted, and gone after revoking", async () => {
    const { grant } = await ok(await send(OWNER, "/pet-caregivers", "POST", {
      petId: 1, granteeUserId: FAMILY.profileId, role: "caregiver",
    }), 201);
    expect(await entries()).toEqual([]);
    await ok(await send(FAMILY, `/pet-caregivers/${grant.id}/respond`, "POST", { accept: true }), 200);
    const list = await entries();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      kind: "family", id: grant.id, pet_id: 1, pet_name: "Rex", role: "caregiver", grantee_username: "maria",
      expires_at: null,
    });
    await ok(await send(OWNER, `/pet-caregivers/${grant.id}`, "DELETE"), 200);
    expect(await entries()).toEqual([]);
  });

  it("a member who leaves is gone", async () => {
    const grant = await addFamily();
    expect(await entries()).toHaveLength(1);
    await ok(await send(FAMILY, `/pet-caregivers/${grant.id}/leave`, "POST"), 200);
    expect(await entries()).toEqual([]);
  });

  it("all of them together, across both pets: the list grows by exactly one each time", async () => {
    const expected: string[] = [];
    const add = async (key: string) => {
      expected.push(key);
      expect(await keys()).toEqual([...expected].sort());
    };
    await add(`vet:1:${(await shareWithVet()).id}`);
    await add(`vet:2:${(await shareWithVet(SECOND_PET, P2, "until_revoked")).id}`);
    await add(`record_link:1:${(await createRecordLink()).link.id}`);
    await add(`emergency_link:2:${(await createEmergencyLink(SECOND_PET)).id}`);
    await add(`family:1:${(await addFamily()).id}`);
  });
});

describe("B. what is not access", () => {
  it("a pending request, an unanswered invitation and an unused vet invite link are not listed", async () => {
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
              values (1, ${OWNER.profileId}, ${P1}, array['medical_read'], 'pending', 'provider')`;
    await ok(await send(OWNER, "/care-access/offers", "POST", {
      petId: 1, providerId: P2, sections: ["vaccines"], expiry: "7d",
    }), 201);
    await ok(await send(OWNER, "/care-access/invites", "POST", { petId: 1 }), 201);
    expect(await entries()).toEqual([]);
  });

  it("everything past its end date drops out", async () => {
    await shareWithVet();
    await createRecordLink();
    await createEmergencyLink(1, 24);
    await addFamily(1, "caregiver", new Date(Date.now() + 86_400_000).toISOString());
    expect(await entries()).toHaveLength(4);
    await raw`update care_access_grants set expires_at = now() - interval '1 second'`;
    await raw`update care_record_links set created_at = now() - interval '8 days', expires_at = now() - interval '1 second'`;
    await raw`update pet_emergency_share_links set expires_at = now() - interval '1 second'`;
    await raw`update pet_caregivers set expires_at = now() - interval '1 second'`;
    expect(await entries()).toEqual([]);
  });

  it("revoked, expired, declined and left rows are not listed", async () => {
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
              values (1, ${OWNER.profileId}, ${P1}, array['medical_read'], 'revoked', 'owner'),
                     (1, ${OWNER.profileId}, ${P2}, array['medical_read'], 'expired', 'owner')`;
    for (const [id, status] of [[1, "revoked"], [2, "declined"], [3, "expired"]] as const) {
      await seedPetCaregiver(raw, {
        id, petId: 1, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, status,
      });
    }
    expect(await entries()).toEqual([]);
  });

  it("an emergency card that is switched off opens nothing, so its links are not listed until it is on again", async () => {
    await createEmergencyLink();
    await ok(await send(OWNER, "/emergency-card", "PATCH", { petId: 1, active: false }), 200);
    expect(await entries()).toEqual([]);
    await ok(await send(OWNER, "/emergency-card", "PATCH", { petId: 1, active: true }), 200);
    expect(await entries()).toHaveLength(1);
  });

  it("a record link and a grant by section for a pet that changed owner open nothing and are not listed", async () => {
    await shareWithVet();
    await createRecordLink();
    // Only the current owner can hand a pet over (0049), so the change is made as them.
    await raw.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${String(OWNER.profileId)}, true)`;
      await tx`update pets set owner_user_id = ${OTHER.profileId} where id = 1`;
    });
    expect(await entries()).toEqual([]);
    expect(await entries(OTHER)).toEqual([]);
  });
});

describe("C. only the owner's own list", () => {
  beforeEach(async () => {
    await shareWithVet();
    await createRecordLink();
    await createEmergencyLink();
    await addFamily();
  });

  it("another owner sees nothing", async () => {
    expect(await entries()).toHaveLength(4);
    expect(await entries(OTHER)).toEqual([]);
  });

  it("a family member of the pet and staff of the vet see nothing of the owner's list", async () => {
    expect(await entries(FAMILY)).toEqual([]);
    expect(await entries(VET)).toEqual([]);
  });

  it("someone with no profile yet gets an empty list; signed out is 401", async () => {
    await raw`insert into auth_users (id, name, email) values (${NEWCOMER.authUserId}, 'new', 'new@example.com')`;
    expect(await entries(NEWCOMER)).toEqual([]);
    expect((await send(null, "/care-access/who-has-access")).status).toBe(401);
  });

  it("the answer is never cached", async () => {
    const res = await send(OWNER, "/care-access/who-has-access");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("D. databases at other migration levels", () => {
  it("without the record link table, the other sources are still listed", async () => {
    await shareWithVet();
    await createEmergencyLink();
    await addFamily();
    await raw`alter table care_record_links rename to care_record_links_absent`;
    try {
      expect((await entries()).map((e) => e.kind)).toEqual(["vet", "emergency_link", "family"]);
    } finally {
      await raw`alter table care_record_links_absent rename to care_record_links`;
    }
  });

  it("without the emergency link and caregiver tables, vet grants and record links are still listed", async () => {
    await shareWithVet();
    await createRecordLink();
    await raw`alter table pet_emergency_share_links rename to pet_emergency_share_links_absent`;
    await raw`alter table pet_caregivers rename to pet_caregivers_absent`;
    try {
      expect((await entries()).map((e) => e.kind)).toEqual(["vet", "record_link"]);
    } finally {
      await raw`alter table pet_caregivers_absent rename to pet_caregivers`;
      await raw`alter table pet_emergency_share_links_absent rename to pet_emergency_share_links`;
    }
  });

  it("reports edit permission when the database stores it", async () => {
    const added: string[] = [];
    for (const table of ["care_access_grants", "care_record_links"]) {
      const [found] = await raw`
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and column_name = 'edit_sections'`;
      if (!found) {
        await raw.unsafe(`alter table ${table} add column edit_sections text[] not null default '{}'`);
        added.push(table);
      }
    }
    try {
      await shareWithVet();
      await createRecordLink(1, true);
      await raw`update care_access_grants set edit_sections = array['vaccines']`;
      await raw`update care_record_links set edit_sections = array['vet_notes','files']`;
      const list = await entries();
      expect(list.map((e) => [e.kind, e.edit_sections])).toEqual([
        ["vet", ["vaccines"]],
        ["record_link", ["vet_notes", "files"]],
      ]);
    } finally {
      for (const table of added) await raw.unsafe(`alter table ${table} drop column edit_sections`);
    }
  });
});
