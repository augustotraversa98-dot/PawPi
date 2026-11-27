// View or "can add" on a share (migration 0158), through the real Hono router + real Postgres as pawpi_app: the owner's
// choice is stored on grants, links and invitations, view only unless they say otherwise, and never wider than what is
// shared.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  MIGRATIONS_DIR, makeTestSql, resetDb, seedCapability, seedOwnerWithPet, seedProviderWithStaff, seedUser,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Olivia Owner", petId: 1, petName: "Rex" };
const VET = { authUserId: 3, profileId: 3, username: "vet", fullName: "Dr. Paula" };
const PET = OWNER.petId;
const P1 = 1;

type Person = { authUserId: number; profileId: number };

let raw: Sql;
let app: Sql;
let api: any;

const as = (u: Person | null) => { authState.session = u ? { user: { id: u.authUserId } } : null; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const share = async (over: Record<string, unknown> = {}) => {
  as(OWNER);
  const res = await req("/care-access/grants", "POST", {
    petId: PET, providerId: P1, sections: ["vaccines", "vet_notes"], expiry: "7d", ...over,
  });
  return { status: res.status, body: await res.json() };
};
const grantList = async () => {
  as(OWNER);
  return (await req("/care-access/grants")).json();
};
const createLink = async (over: Record<string, unknown> = {}) => {
  as(OWNER);
  const res = await req("/care-access/links", "POST", {
    petId: PET, sections: ["vaccines"], expiry: "7d", allowNotes: false, ...over,
  });
  return { status: res.status, body: await res.json() };
};
const offerSend = async (over: Record<string, unknown> = {}) => {
  as(OWNER);
  const res = await req("/care-access/offers", "POST", {
    petId: PET, providerId: P1, sections: ["vaccines", "files"], expiry: "7d", ...over,
  });
  return { status: res.status, body: await res.json() };
};
const grants = () => raw`select * from care_access_grants order by id`;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

const migration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");
const forgetSupport = async () =>
  ((await import("@/app/api/utils/editAccess")) as any).resetEditAccessSupport();

beforeAll(async () => {
  raw = makeTestSql();
  // Other files re-apply older migrations on the shared database, which restores older functions.
  await raw.unsafe(migration("0157_record_link_note_edit.sql"));
  await raw.unsafe(migration("0158_share_edit_permission.sql"));
  await raw.unsafe(migration("0160_vet_record_writes.sql"));
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  app = postgres(url.toString(), { max: 1, onnotice: () => {} });
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => {
  const { pool } = (await import("@/app/api/utils/sql")) as any;
  await pool.end({ timeout: 5 });
  await raw.end();
  await app.end();
});
afterEach(async () => { await resetDb(raw); authState.session = null; vi.restoreAllMocks(); });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedUser(raw, VET);
  await raw`select setval(pg_get_serial_sequence('auth_users', 'id'), 100), setval(pg_get_serial_sequence('user_profiles', 'id'), 100)`;
  await seedProviderWithStaff(raw, {
    providerId: P1, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId, staffRole: "owner",
    slug: "biz-1", providerStatus: "published",
  });
  await seedCapability(raw, { providerId: P1, capability: "vet" });
});

describe("grants", () => {
  it("are view only unless the owner says otherwise", async () => {
    const res = await share();
    expect(res.status).toBe(201);
    expect(res.body.grant.edit_sections).toEqual([]);
    const list = await grantList();
    expect(list.editAccessAvailable).toBe(true);
    expect(list.grants[0].edit_sections).toEqual([]);
  });

  it("store exactly the chosen parts", async () => {
    const res = await share({ editSections: ["vet_notes", "vaccines"] });
    expect(res.status).toBe(201);
    expect(res.body.grant.edit_sections).toEqual(["vet_notes", "vaccines"]);
    expect((await grants())[0].edit_sections).toEqual(["vet_notes", "vaccines"]);
  });

  it("refuse a part that is not shared, cannot be added to, or is not a list, and write nothing", async () => {
    for (const editSections of [["files"], ["profile"], ["nope"], "vaccines", ["vaccines", "vaccines"], null]) {
      expect((await share({ editSections })).status).toBe(400);
    }
    as(OWNER);
    const scoped = await req("/care-access/grants", "POST", { petId: PET, providerId: P1, editSections: [] });
    expect(scoped.status).toBe(400);
    expect(await grants()).toHaveLength(0);
  });

  it("the same choice sent again is not a second share, but another permission is a new choice", async () => {
    const first = await share({ editSections: ["vaccines"] });
    const again = await share({ editSections: ["vaccines"] });
    expect(again.body).toMatchObject({ deduped: true, grant: { id: first.body.grant.id } });
    const viewOnly = await share();
    expect(viewOnly.status).toBe(201);
    expect(viewOnly.body.grant.id).not.toBe(first.body.grant.id);
    expect((await grants()).filter((g) => g.status === "active")).toHaveLength(1);
  });

  it("approving a request with a permission stores it", async () => {
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
              values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read", "medical_write"]}, 'pending', 'provider')`;
    const res = await share({ editSections: ["vaccines"] });
    expect(res.body).toMatchObject({ approvedRequest: true, grant: { edit_sections: ["vaccines"], scopes: ["record_sections"] } });
  });
});

describe("links", () => {
  it("are view only by default, and the notes switch is the same permission", async () => {
    expect((await createLink()).body.link.edit_sections).toEqual([]);
    expect((await createLink({ allowNotes: true })).body.link.edit_sections).toEqual(["vet_notes"]);
    const rows = await raw`select allow_notes, edit_sections from care_record_links order by id`;
    expect(rows.map((r) => [r.allow_notes, r.edit_sections])).toEqual([[false, []], [true, ["vet_notes"]]]);
  });

  it("store more parts, and notes without showing them", async () => {
    const res = await createLink({
      sections: ["vaccines", "files"], allowNotes: true, editSections: ["files", "vaccines", "vet_notes"],
    });
    expect(res.status).toBe(201);
    expect(res.body.link.edit_sections).toEqual(["vet_notes", "vaccines", "files"]);
    expect((await raw`select edit_sections from care_record_links`)[0].edit_sections).toEqual(["vet_notes", "vaccines", "files"]);
    as(OWNER);
    const list = await (await req("/care-access/links")).json();
    expect(list.editAccessAvailable).toBe(true);
    expect(list.links[0].edit_sections).toEqual(["vet_notes", "vaccines", "files"]);
  });

  it("refuse a choice that disagrees with the notes switch or names an unshared part", async () => {
    for (const body of [
      { editSections: ["vet_notes"] },
      { allowNotes: true, editSections: [] },
      { editSections: ["files"] },
      { editSections: ["photos"] },
    ]) {
      expect((await createLink(body)).status).toBe(400);
    }
    expect(await raw`select * from care_record_links`).toHaveLength(0);
  });
});

describe("invitations", () => {
  it("show the business what it would be able to add to, and give exactly that on acceptance", async () => {
    const sent = await offerSend({ editSections: ["files"] });
    expect(sent.status).toBe(201);
    expect(sent.body.offer.edit_sections).toEqual(["files"]);
    as(VET);
    const waiting = await (await req(`/providers/${P1}/share-offers`)).json();
    expect(waiting.offers[0]).toMatchObject({ sections: ["vaccines", "files"], edit_sections: ["files"] });
    expect((await req(`/providers/${P1}/share-offers/${sent.body.offer.id}`, "POST", { action: "accept" })).status).toBe(200);
    expect((await grants())[0]).toMatchObject({ status: "active", edit_sections: ["files"] });
  });

  it("a different permission is a different invitation", async () => {
    await offerSend({ editSections: ["files"] });
    expect((await offerSend({ editSections: ["files"] })).body.deduped).toBe(true);
    expect((await offerSend()).body.code).toBe("offer_open");
    expect((await offerSend({ editSections: ["lab_results"] })).status).toBe(400);
  });
});

describe("the database on its own", () => {
  it("never stores a permission wider than what is shared", async () => {
    await share();
    const id = (await grants())[0].id;
    for (const edit of [["files"], ["profile"]]) {
      await expect(
        asApp(OWNER.profileId, (tx) => tx`update care_access_grants set edit_sections = ${edit} where id = ${id}`),
      ).rejects.toMatchObject({ code: "23514" });
    }
    await expect(
      asApp(VET.profileId, (tx) => tx`insert into care_access_grants
        (pet_id, owner_user_id, provider_id, scopes, edit_sections, status, requested_by)
        values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read"]}, ${["vaccines"]}, 'pending', 'provider')`),
    ).rejects.toThrow();
  });

  it("the vet cannot change the permission", async () => {
    await share();
    const id = (await grants())[0].id;
    const changed = await asApp(VET.profileId, (tx) =>
      tx`update care_access_grants set edit_sections = ${["vaccines"]} where id = ${id} returning id`);
    expect(changed).toHaveLength(0);
  });

  it("keeps links and their notes switch equal, whichever a writer sets", async () => {
    await createLink({ sections: ["vaccines"], allowNotes: true, editSections: ["vet_notes", "vaccines"] });
    await raw`update care_record_links set allow_notes = false`;
    expect((await raw`select edit_sections from care_record_links`)[0].edit_sections).toEqual(["vaccines"]);
    await raw`update care_record_links set allow_notes = true`;
    expect((await raw`select edit_sections from care_record_links`)[0].edit_sections).toEqual(["vaccines", "vet_notes"]);
    await raw`update care_record_links set edit_sections = ${["vaccines"]}`;
    expect((await raw`select allow_notes from care_record_links`)[0].allow_notes).toBe(false);
  });

  it("verify_0158.sql reads PASS on every row, also after re-applying", async () => {
    await raw.unsafe(migration("0158_share_edit_permission.sql"));
    await raw.unsafe(migration("0158_share_edit_permission.sql"));
    const rows = (await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0158.sql"), "utf8"))) as any[];
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r.status, `${r.ord} ${r.check_name} :: ${r.detail}`).toBe("PASS");
  });
});

describe("a database without 0158", () => {
  const strip = () => raw.unsafe(`
    drop function if exists app_record_link_add_record(text, text, jsonb);
    drop function if exists app_provider_share_offer_edits(integer);
    drop trigger if exists care_record_links_sync_notes on care_record_links;
    alter table care_access_grants drop column if exists edit_sections;
    alter table care_record_links drop column if exists edit_sections;
    alter table care_share_offers drop column if exists edit_sections;
  `);
  beforeAll(async () => {
    await strip();
    await raw.unsafe(migration("0154_vet_share_offers.sql"));
    await forgetSupport();
  });
  afterAll(async () => {
    await raw.unsafe(migration("0158_share_edit_permission.sql"));
    await raw.unsafe(migration("0160_vet_record_writes.sql"));
    await forgetSupport();
  });

  it("shares view only, and says that adding is not available without ending any access", async () => {
    const first = await share();
    expect(first.status).toBe(201);
    const list = await grantList();
    expect(list.editAccessAvailable).toBe(false);
    expect(list.grants[0].edit_sections).toEqual([]);
    const refused = await share({ editSections: ["vaccines"] });
    expect([refused.status, refused.body.code]).toEqual([409, "edit_access_unavailable"]);
    expect((await grants()).map((g) => g.status)).toEqual(["active"]);

    expect((await createLink({ allowNotes: true })).status).toBe(201);
    const more = await createLink({ allowNotes: false, editSections: ["vaccines"] });
    expect([more.status, more.body.code]).toEqual([409, "edit_access_unavailable"]);
    as(OWNER);
    const links = await (await req("/care-access/links")).json();
    expect(links.links[0].edit_sections).toEqual(["vet_notes"]);

    const offer = await offerSend({ editSections: ["files"] });
    expect([offer.status, offer.body.code]).toEqual([409, "edit_access_unavailable"]);
  });

  it("an invitation is still listed to the business, view only", async () => {
    await raw`delete from care_access_grants`;
    expect((await offerSend()).status).toBe(201);
    as(VET);
    const waiting = await (await req(`/providers/${P1}/share-offers`)).json();
    expect(waiting.offers[0].edit_sections).toEqual([]);
  });
});
