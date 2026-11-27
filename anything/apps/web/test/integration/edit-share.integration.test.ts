// Editing an existing share on the same row (migration 0159), through the real Hono router + real Postgres as
// pawpi_app: {A, B} becomes {A, B, C} with no second share and no gap, for a grant and for a record link.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { Sql } from "postgres";
import {
  MIGRATIONS_DIR, makeTestSql, resetDb, seedCapability, seedOwnerWithPet, seedPetCaregiver, seedProviderWithStaff,
  seedUser,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Olivia Owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "vet", fullName: "Dr. Paula" };
const FAMILY = { authUserId: 4, profileId: 4, username: "family" };
const PET = OWNER.petId;
const P1 = 1;

type Person = { authUserId: number; profileId: number };

let raw: Sql;
let api: any;

const as = (u: Person | null) => { authState.session = u ? { user: { id: u.authUserId } } : null; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const send = async (path: string, method: string, body: unknown, user: Person | null = OWNER) => {
  as(user);
  const res = await req(path, method, body);
  return { status: res.status, body: await res.json() };
};
const share = async (over: Record<string, unknown> = {}) => {
  const res = await send("/care-access/grants", "POST", {
    petId: PET, providerId: P1, sections: ["vaccines", "files"], editSections: ["vaccines"], expiry: "30d", ...over,
  });
  expect(res.status).toBe(201);
  return res.body.grant;
};
const edit = (id: number | string, over: Record<string, unknown> = {}, user: Person | null = OWNER) =>
  send(`/care-access/grants/${id}`, "PATCH", {
    action: "update", sections: ["vaccines", "files", "vet_notes"], editSections: ["vaccines"], expiry: "keep", ...over,
  }, user);
const link = async (over: Record<string, unknown> = {}) => {
  const res = await send("/care-access/links", "POST", {
    petId: PET, sections: ["vaccines", "files"], expiry: "30d", allowNotes: false, ...over,
  });
  expect(res.status).toBe(201);
  return { id: res.body.link.id as number, token: res.body.url.split("#")[1] as string, link: res.body.link };
};
const editLink = (id: number | string, over: Record<string, unknown> = {}, user: Person | null = OWNER) =>
  send(`/care-access/links/${id}`, "PATCH", {
    action: "update", sections: ["vaccines", "files", "vet_notes"], editSections: [], expiry: "keep", ...over,
  }, user);
const open = async (token: string) => send("/public/record-link/open", "POST", { token }, null);
const record = async () => { as(VET); return (await req(`/providers/${P1}/pets/${PET}/record`)).json(); };
const grants = () => raw`select * from care_access_grants order by id`;
const links = () => raw`select * from care_record_links order by id`;
const notices = () => raw`select * from notifications where type = 'care_access_granted' order by id`;
const unlimited = () => raw`delete from rate_limit_hits`;

const migration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");
const forgetSupport = async () =>
  ((await import("@/app/api/utils/editAccess")) as any).resetEditAccessSupport();
const latest = async () => {
  await raw.unsafe(migration("0157_record_link_note_edit.sql"));
  await raw.unsafe(migration("0158_share_edit_permission.sql"));
  await raw.unsafe(migration("0159_edit_share.sql"));
  await raw.unsafe(migration("0160_vet_record_writes.sql"));
};

beforeAll(async () => {
  raw = makeTestSql();
  // Other files re-apply older migrations on the shared database, which restores older functions and rules.
  await latest();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => {
  const { pool } = (await import("@/app/api/utils/sql")) as any;
  await pool.end({ timeout: 5 });
  await raw.end();
});
afterEach(async () => { await resetDb(raw); authState.session = null; vi.restoreAllMocks(); });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  await seedUser(raw, VET);
  await seedUser(raw, FAMILY);
  await raw`select setval(pg_get_serial_sequence('auth_users', 'id'), 100), setval(pg_get_serial_sequence('user_profiles', 'id'), 100)`;
  await seedProviderWithStaff(raw, {
    providerId: P1, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId, staffRole: "owner",
    slug: "biz-1", providerStatus: "published",
  });
  await seedCapability(raw, { providerId: P1, capability: "vet" });
  await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note) values (${PET}, ${OWNER.profileId}, '2026-01-02', 'OWNER-NOTE')`;
});

describe("editing a grant", () => {
  it("adds a part on the same row: no second share, no gap, the permission and end date kept", async () => {
    const before = await share();
    expect((await record()).notes).toEqual([]);
    const res = await edit(before.id);
    expect(res.status).toBe(200);
    expect(res.body.grant).toMatchObject({
      id: before.id, status: "active", sections: ["vet_notes", "vaccines", "files"], edit_sections: ["vaccines"],
      expires_at: before.expires_at, granted_at: before.granted_at,
    });
    const rows = await grants();
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked_at).toBeNull();
    expect((await record()).notes.map((n: any) => n.note)).toEqual(["OWNER-NOTE"]);
  });

  it("removes a part, changes the permission and chooses a new end date", async () => {
    const before = await share();
    const res = await edit(before.id, { sections: ["files"], editSections: ["files"], expiry: "1y" });
    expect(res.status).toBe(200);
    expect(res.body.grant).toMatchObject({ sections: ["files"], edit_sections: ["files"] });
    const days = (Date.parse(res.body.grant.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(363);
    const forever = await edit(before.id, { sections: ["files"], editSections: [], expiry: "until_revoked" });
    expect(forever.body.grant).toMatchObject({ expires_at: null, edit_sections: [] });
  });

  it("tells the vet's team once, and only when something changed", async () => {
    const before = await share();
    await raw`delete from notifications`;
    await edit(before.id, { sections: ["vaccines", "files"] });
    expect(await notices()).toHaveLength(0);
    await edit(before.id);
    const sent = await notices();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("cambió el acceso");
  });

  it("refuses an incomplete or too wide choice and changes nothing", async () => {
    const before = await share();
    for (const over of [
      { sections: [] }, { sections: ["nope"] }, { editSections: ["lab_results"] }, { editSections: undefined },
      { expiry: "forever" }, { expiry: undefined },
    ]) {
      expect((await edit(before.id, over)).status).toBe(400);
    }
    expect((await grants())[0]).toMatchObject({ sections: ["vaccines", "files"], edit_sections: ["vaccines"] });
  });

  it("only the pet's owner edits it", async () => {
    const before = await share();
    for (const who of [OTHER, VET, FAMILY]) expect((await edit(before.id, {}, who)).status).toBe(404);
    expect((await edit(before.id, {}, null)).status).toBe(401);
    expect((await edit("abc")).status).toBe(404);
    expect((await grants())[0].sections).toEqual(["vaccines", "files"]);
  });

  it("never reopens an ended access, and does not edit an older all-together one", async () => {
    const ended = await share();
    await send(`/care-access/grants/${ended.id}`, "PATCH", { action: "revoke" });
    expect((await edit(ended.id)).body.code).toBe("grant_not_active");
    const expired = await share();
    await raw`update care_access_grants set expires_at = now() - interval '1 second' where id = ${expired.id}`;
    expect((await edit(expired.id, { expiry: "30d" })).body.code).toBe("grant_not_active");
    const [older] = await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by, granted_at)
      values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read"]}, 'revoked', 'owner', now()) returning id`;
    expect((await edit(older.id)).body.code).toBe("grant_not_editable");
  });

  it("is limited like sharing", async () => {
    const before = await share();
    await unlimited();
    for (let i = 0; i < 20; i += 1) expect((await edit(before.id, { sections: ["vaccines"] })).status).toBe(200);
    expect((await edit(before.id)).status).toBe(429);
  });
});

describe("editing a record link", () => {
  it("adds a part on the same link: same address, same row, the end date kept", async () => {
    const { id, token, link: before } = await link();
    expect((await open(token)).body.record.vet_notes).toBeNull();
    const res = await editLink(id, { editSections: ["vaccines", "vet_notes"] });
    expect(res.status).toBe(200);
    expect(res.body.link).toMatchObject({
      id, status: "active", sections: ["vet_notes", "vaccines", "files"], allow_notes: true,
      edit_sections: ["vet_notes", "vaccines"],
    });
    expect(Date.parse(res.body.link.expires_at)).toBe(Date.parse(before.expires_at));
    const shown = (await open(token)).body.record;
    expect(shown.vet_notes.map((n: any) => n.note)).toEqual(["OWNER-NOTE"]);
    expect(shown.allow_notes).toBe(true);
    expect(await links()).toHaveLength(1);
  });

  it("removing a part closes it at once", async () => {
    const { id, token } = await link({ sections: ["vet_notes", "vaccines"] });
    await editLink(id, { sections: ["vaccines"] });
    const shown = (await open(token)).body.record;
    expect(shown.vet_notes).toBeNull();
    expect(JSON.stringify(shown)).not.toContain("OWNER-NOTE");
  });

  it("chooses a new end date counted from now, also on an old link", async () => {
    const { id } = await link({ expiry: "1y" });
    await raw`update care_record_links set created_at = now() - interval '300 days', expires_at = now() + interval '65 days' where id = ${id}`;
    const res = await editLink(id, { expiry: "1y" });
    expect(res.status).toBe(200);
    expect((Date.parse(res.body.link.expires_at) - Date.now()) / 86_400_000).toBeGreaterThan(363);
    expect((await links())[0].terms_changed_at).not.toBeNull();
  });

  it("refuses what a link cannot be", async () => {
    const { id } = await link();
    for (const over of [
      { expiry: "until_revoked" }, { sections: [] }, { editSections: ["lab_results"] }, { editSections: undefined },
    ]) {
      expect((await editLink(id, over)).status).toBe(400);
    }
    expect((await links())[0].sections).toEqual(["vaccines", "files"]);
  });

  it("only the owner, and never a removed or expired link", async () => {
    const { id } = await link();
    for (const who of [OTHER, VET, FAMILY]) expect((await editLink(id, {}, who)).status).toBe(404);
    await raw`update care_record_links set created_at = now() - interval '8 days', expires_at = now() - interval '1 second' where id = ${id}`;
    expect((await editLink(id, { expiry: "1y" })).body.code).toBe("link_not_active");
    const removed = await link();
    await send(`/care-access/links/${removed.id}`, "PATCH", { action: "revoke" });
    expect((await editLink(removed.id)).body.code).toBe("link_not_active");
  });
});

describe("the database", () => {
  it("verify_0159.sql reads PASS on every row, also after re-applying", async () => {
    await raw.unsafe(migration("0159_edit_share.sql"));
    await raw.unsafe(migration("0159_edit_share.sql"));
    const rows = (await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0159.sql"), "utf8"))) as any[];
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.status, `${r.ord} ${r.check_name} :: ${r.detail}`).toBe("PASS");
  });

  it("before 0159 a link edit says it is not available and changes nothing", async () => {
    const { id } = await link();
    try {
      await raw.unsafe("drop function app_update_record_link(integer, text[], text[], text)");
      const res = await editLink(id);
      expect([res.status, res.body.code]).toEqual([409, "edit_access_unavailable"]);
      expect((await links())[0].sections).toEqual(["vaccines", "files"]);
    } finally {
      await raw.unsafe(migration("0159_edit_share.sql"));
    }
  });

  it("while adding is not available yet, view only still removes a permission the access carries", async () => {
    const before = await share();
    expect(before.edit_sections).toEqual(["vaccines"]);
    const support = (await import("@/app/api/utils/editAccess")) as any;
    vi.spyOn(support, "editAccessSupported").mockResolvedValue(false);
    const narrowed = await edit(before.id, { sections: ["files"], editSections: [] });
    expect(narrowed.status).toBe(200);
    expect((await grants())[0]).toMatchObject({ sections: ["files"], edit_sections: [] });
  });

  it("before 0158 a grant's parts are still edited, view only", async () => {
    const before = await share({ editSections: [] });
    try {
      await raw.unsafe(`
        drop function if exists app_record_link_add_record(text, text, jsonb);
        drop function if exists app_update_record_link(integer, text[], text[], text);
        drop function if exists app_provider_share_offer_edits(integer);
        drop trigger if exists care_record_links_sync_notes on care_record_links;
        alter table care_access_grants drop column edit_sections;
        alter table care_record_links drop column edit_sections;
        alter table care_share_offers drop column edit_sections;
      `);
      await raw.unsafe(migration("0154_vet_share_offers.sql"));
      await forgetSupport();
      expect((await edit(before.id, { editSections: [] })).status).toBe(200);
      expect((await edit(before.id, { editSections: ["vaccines"] })).body.code).toBe("edit_access_unavailable");
      expect((await grants())[0].sections).toEqual(["vet_notes", "vaccines", "files"]);
    } finally {
      await latest();
      await forgetSupport();
    }
  });
});
