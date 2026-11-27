// Record links (migration 0153): parts of the vet record opened with no account, through the real Hono router + real
// Postgres as pawpi_app.
//   A. the owner creates, lists and removes links          B. what a link holder reads, and nothing else
//   C. one answer for every unusable link, on every call   D. files
//   E. notes through a link and who they are from          F. such a note unlocks nothing and is labelled everywhere
//   G. limits                                              H. the database rules on their own; invites stay invites
//   I. a database without 0153                             J. verify_0153.sql passes, can fail, re-applies
//   K. request bodies, signing and the characters the database cannot hold

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  MIGRATIONS_DIR, makeTestSql, resetDb, seedCapability, seedOwnerWithPet, seedPetCaregiver, seedProviderWithStaff,
  seedUser,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));
const signed = vi.hoisted(() => ({ calls: [] as [string, number][], whileSigning: null as null | (() => Promise<void>) }));
vi.mock("@/app/api/utils/mediaAccess", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  createSignedMediaUrl: async (key: string, seconds: number) => {
    signed.calls.push([key, seconds]);
    await signed.whileSigning?.();
    return `https://storage.example.test/signed/${signed.calls.length}`;
  },
}));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Olivia Owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "vet", fullName: "Dr. Paula Gómez" };
const FAMILY = { authUserId: 4, profileId: 4, username: "family" };
const NAMELESS = { authUserId: 5, profileId: 5, username: "nameless" };
const PET = OWNER.petId;
const P1 = 1;
const ALL = ["profile", "emergency_contact", "insurance", "vet_notes", "vaccines", "files", "photos", "lab_results"];

type Person = { authUserId: number; profileId: number } | { authUserId: number };

let raw: Sql;
let app: Sql;
let api: any;

const as = (u: Person | null) => { authState.session = u ? { user: { id: u.authUserId } } : null; };
const req = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  api.request(path, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const choice = (over: Record<string, unknown> = {}) => ({
  petId: PET, sections: ["vaccines"], expiry: "7d", allowNotes: false, ...over,
});
const create = (body: unknown = choice(), user: Person | null = OWNER) => { as(user); return req("/care-access/links", "POST", body); };
async function link(over: Record<string, unknown> = {}) {
  const res = await create(choice(over));
  expect(res.status).toBe(201);
  const body = await res.json();
  return { id: body.link.id as number, token: body.url.split("#")[1] as string, body };
}
const list = (user: Person | null = OWNER, query = "") => { as(user); return req(`/care-access/links${query}`); };
const remove = (id: number | string, user: Person | null = OWNER) => {
  as(user);
  return req(`/care-access/links/${id}`, "PATCH", { action: "revoke" });
};
const view = (token: unknown, user: Person | null = null, headers: Record<string, string> = {}) => {
  as(user);
  return req("/public/record-link/open", "POST", { token }, headers);
};
const file = (token: unknown, kind: unknown, id: unknown, headers: Record<string, string> = {}) => {
  as(null);
  return req("/public/record-link/file", "POST", { token, kind, id }, headers);
};
const addNote = (token: unknown, note: unknown, user: Person | null = null, extra: Record<string, unknown> = {}) => {
  as(user);
  return req("/public/record-link/notes", "POST", { token, note, ...extra });
};
const ownerNotes = async (user: Person = OWNER) => {
  as(user);
  const res = await req(`/vet-record/notes?petId=${PET}`);
  expect(res.status).toBe(200);
  return (await res.json()).notes as any[];
};
const linkRows = () => raw`select * from care_record_links order by id`;
const noteRows = () => raw`select * from vet_notes where via_record_link order by id`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const expire = (id: number) =>
  raw`update care_record_links set created_at = now() - interval '8 days', expires_at = now() - interval '1 second' where id = ${id}`;
const unlimited = () => raw`delete from rate_limit_hits`;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

const migration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");
const verify0153 = () => readFileSync(join(MIGRATIONS_DIR, "..", "verify_0153.sql"), "utf8");

beforeAll(async () => {
  raw = makeTestSql();
  // Other files re-apply older migrations on the shared database, which restores older functions. 0153 is idempotent.
  await raw.unsafe(migration("0153_vet_record_links.sql"));
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  app = postgres(url.toString(), { max: 1, onnotice: () => {} });
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); await app.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; signed.calls = []; signed.whileSigning = null; vi.restoreAllMocks(); });

const ids = { docPrivate: 0, docPublic: 0, docForeign: 0, photo: 0, otherPetDoc: 0 };

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  for (const u of [VET, FAMILY, NAMELESS]) await seedUser(raw, u);
  // The seeds above use explicit ids: move the generated ones past them.
  await raw`select setval(pg_get_serial_sequence('auth_users', 'id'), 100), setval(pg_get_serial_sequence('user_profiles', 'id'), 100)`;
  await seedProviderWithStaff(raw, {
    providerId: P1, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId, staffRole: "owner",
    slug: "biz-1", providerStatus: "published",
  });
  await seedCapability(raw, { providerId: P1, capability: "vet" });
  await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  const o = OWNER.profileId;
  await raw`
    insert into pet_medical_profiles (pet_id, owner_user_id, microchip_id, medical_notes, emergency_contact_name,
      emergency_contact_phone, insurance_provider, insurance_policy_number)
    values (${PET}, ${o}, 'CHIP-1', 'MEDNOTES', 'CONTACT-NAME', 'CONTACT-PHONE', 'INSURER', 'POLICY')`;
  await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note, created_by_user_id, created_by_role)
            values (${PET}, ${o}, '2026-01-02', 'OWNER-NOTE', ${o}, 'owner')`;
  await raw`insert into pet_vaccinations (pet_id, owner_user_id, name) values (${PET}, ${o}, 'VACCINE')`;
  await raw`insert into pet_vaccinations (pet_id, owner_user_id, name, deleted_at) values (${PET}, ${o}, 'DELETED-VACCINE', now())`;
  await raw`insert into pet_lab_results (pet_id, owner_user_id, test_name, test_date) values (${PET}, ${o}, 'LABTEST', '2026-02-03')`;
  const doc = async (petId: number, owner: number, name: string, url: string) =>
    (await raw`insert into vet_documents (pet_id, owner_user_id, name, document_type, file_url)
               values (${petId}, ${owner}, ${name}, 'other', ${url}) returning id`)[0].id as number;
  ids.docPrivate = await doc(PET, o, "DOC-PRIVATE", `pets/${PET}/private-doc.pdf`);
  ids.docPublic = await doc(PET, o, "DOC-PUBLIC", "https://cdn.example.test/public-doc.pdf");
  ids.docForeign = await doc(PET, o, "DOC-OTHER-KEY", `pets/${OTHER.petId}/someone-else.pdf`);
  ids.otherPetDoc = await doc(OTHER.petId, OTHER.profileId, "OTHER-PET-DOC", `pets/${OTHER.petId}/theirs.pdf`);
  ids.photo = (await raw`insert into health_photo_checks (pet_id, owner_user_id, body_area, image_url, notes)
    values (${PET}, ${o}, 'ears', ${`pets/${PET}/ear.jpg`}, 'PHOTO-NOTE') returning id`)[0].id;
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A. the owner's links", () => {
  it("creates a link from a complete choice; only a hash of its token is stored", async () => {
    const res = await create(choice({ sections: ["files", "vaccines"], expiry: "30d", allowNotes: true }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["link", "url"]);
    expect(Object.keys(body.link).sort()).toEqual(["allow_notes", "created_at", "expires_at", "id", "pet_id", "sections", "status"]);
    expect(body.link).toMatchObject({ sections: ["vaccines", "files"], allow_notes: true, status: "active" });
    const days = (Date.parse(body.link.expires_at) - Date.parse(body.link.created_at)) / 86_400_000;
    expect(days).toBeCloseTo(30, 5);
    expect(body.url).toMatch(/^https?:\/\/[^/]+\/shared-record#[A-Za-z0-9_-]{43}$/);
    const token = body.url.split("#")[1];
    const [row] = await linkRows();
    expect(row.token_hash).toBe(sha(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it.each([
    ["no sections", { sections: [] }],
    ["sections missing", { sections: undefined }],
    ["an unknown section", { sections: ["vaccines", "allergies"] }],
    ["a repeated section", { sections: ["vaccines", "vaccines"] }],
    ["no length", { expiry: undefined }],
    ["until revoked", { expiry: "until_revoked" }],
    ["no answer about notes", { allowNotes: undefined }],
    ["notes as text", { allowNotes: "yes" }],
    ["no pet", { petId: undefined }],
  ])("refuses %s and creates nothing", async (_name, over) => {
    expect((await create(choice(over))).status).toBe(400);
    expect(await linkRows()).toHaveLength(0);
  });

  it("only the pet's owner creates one: not a family member, a stranger or a signed-out caller", async () => {
    for (const user of [FAMILY, OTHER, VET]) expect((await create(choice(), user)).status).toBe(404);
    expect((await create(choice(), null)).status).toBe(401);
    expect(await linkRows()).toHaveLength(0);
  });

  it("lists links without any token, and only the owner's", async () => {
    const { id } = await link({ allowNotes: true });
    const mine = await (await list(OWNER, `?petId=${PET}`)).json();
    expect(mine.available).toBe(true);
    expect(mine.links).toHaveLength(1);
    expect(Object.keys(mine.links[0]).sort()).toEqual([
      "allow_notes", "created_at", "expires_at", "id", "pet_id", "pet_name", "revoked_at", "sections", "status",
    ]);
    expect(mine.links[0]).toMatchObject({ id, pet_name: "Rex", status: "active" });
    expect((await (await list(OTHER)).json()).links).toEqual([]);
    expect((await (await list(FAMILY)).json()).links).toEqual([]);
    await expire(id);
    expect((await (await list()).json()).links[0].status).toBe("expired");
  });

  it("removes only their own, repeatably, and removing is never rate limited", async () => {
    const { id } = await link();
    expect((await remove(id, OTHER)).status).toBe(404);
    expect((await remove(id, FAMILY)).status).toBe(404);
    expect((await remove("abc")).status).toBe(404);
    expect((await linkRows())[0].revoked_at).toBeNull();
    for (let i = 0; i < 25; i++) expect((await remove(id)).status).toBe(200);
    expect((await (await list()).json()).links[0].status).toBe("revoked");
  });

  it("keeps at most 10 links in use per owner; a removed or ended one frees a place", async () => {
    const made = [];
    for (let i = 0; i < 10; i++) made.push((await link()).id);
    const refused = await create();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "link_limit", limit: 10 });
    await remove(made[0]);
    expect((await create()).status).toBe(201);
    await expire(made[1]);
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(409);
  });

  it("holds the limit when creations arrive together", async () => {
    for (let i = 0; i < 9; i++) await link();
    as(OWNER);
    const results = await Promise.all([1, 2, 3, 4].map(() => req("/care-access/links", "POST", choice())));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(await linkRows()).toHaveLength(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("B. what a link holder reads", () => {
  const MARKERS: Record<string, string[]> = {
    profile: ["CHIP-1", "MEDNOTES"],
    emergency_contact: ["CONTACT-NAME", "CONTACT-PHONE"],
    insurance: ["INSURER", "POLICY"],
    vet_notes: ["OWNER-NOTE"],
    vaccines: ["VACCINE"],
    files: ["DOC-PRIVATE", "DOC-PUBLIC"],
    photos: ["PHOTO-NOTE"],
    lab_results: ["LABTEST"],
  };

  it.each(ALL)("a link for %s alone shows that part and none of the others, with no account", async (section) => {
    const { token } = await link({ sections: [section] });
    const res = await view(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { record } = await res.json();
    expect(record.sections).toEqual([section]);
    expect(record.pet_name).toBe("Rex");
    expect(record.owner_name).toBe("Olivia Owner");
    const text = JSON.stringify(record);
    for (const [other, markers] of Object.entries(MARKERS)) {
      for (const marker of markers) {
        if (other === section) expect(text).toContain(marker);
        else expect(text).not.toContain(marker);
      }
    }
    for (const other of ALL.filter((s) => s !== section)) expect(record[other]).toBeNull();
  });

  it("never shows an e-mail address as the owner's name", async () => {
    await raw`update user_profiles set full_name = 'owner@example.com' where id = ${OWNER.profileId}`;
    const { token } = await link();
    expect((await (await view(token)).json()).record.owner_name).toBeNull();
  });

  it("carries no user id, storage key or file address, and no deleted vaccination", async () => {
    const { token } = await link({ sections: ALL });
    const { record } = await (await view(token)).json();
    const text = JSON.stringify(record);
    for (const forbidden of [
      "owner_user_id", "user_id", "pet_id", "created_by", "file_url", "image_url", "token", "pets/", "https://",
      "DELETED-VACCINE", "OTHER-PET-DOC", "example.com",
    ]) expect(text).not.toContain(forbidden);
    expect(record.files.map((f: any) => [f.name, f.file_available]).sort()).toEqual([
      ["DOC-OTHER-KEY", false], ["DOC-PRIVATE", true], ["DOC-PUBLIC", false],
    ]);
    expect(record.photos).toEqual([expect.objectContaining({ id: ids.photo, file_available: true })]);
  });

  it("answers the same signed in as a vet's staff member, and opens nothing outside the link", async () => {
    const { token } = await link({ sections: ["vaccines"] });
    const anonymous = await (await view(token)).json();
    expect(await (await view(token, VET)).json()).toEqual(anonymous);
    as(VET);
    expect((await req(`/providers/${P1}/pets/${PET}/record`)).status).toBe(403);
    expect(await raw`select * from care_access_grants`).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("C. unusable links", () => {
  const everyCall = (token: unknown) => [
    view(token),
    file(token, "document", ids.docPrivate),
    addNote(token, "hello"),
  ];
  const refused = async (token: unknown) => {
    for (const pending of everyCall(token)) {
      const res = await pending;
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "This link is not available", code: "link_not_valid" });
    }
  };
  const full = { sections: ["files"], allowNotes: true };

  it("an unknown, malformed or missing token", async () => {
    await refused("A".repeat(43));
    await refused("short");
    await refused(undefined);
    await refused(12345);
  });

  it("a removed link, from the next call on", async () => {
    const { id, token } = await link(full);
    expect((await view(token)).status).toBe(200);
    expect((await file(token, "document", ids.docPrivate)).status).toBe(200);
    expect((await addNote(token, "before")).status).toBe(201);
    expect((await remove(id)).status).toBe(200);
    await refused(token);
    expect(await noteRows()).toHaveLength(1);
  });

  it("an expired link", async () => {
    const { id, token } = await link(full);
    await expire(id);
    await refused(token);
    expect(await noteRows()).toHaveLength(0);
  });

  it("a link whose pet changed owner", async () => {
    const { token } = await link(full);
    await raw.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${String(OWNER.profileId)}, true)`;
      await tx`update pets set owner_user_id = ${OTHER.profileId} where id = ${PET}`;
    });
    await refused(token);
    expect(await noteRows()).toHaveLength(0);
    expect((await (await list()).json()).links[0].status).toBe("expired");
  });

  it("a link of a deleted pet", async () => {
    const { token } = await link(full);
    await raw`delete from pets where id = ${PET}`;
    await refused(token);
    expect(await linkRows()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("D. files", () => {
  it("signs a private file of a granted section for about a minute", async () => {
    const { token } = await link({ sections: ["files", "photos"] });
    const doc = await file(token, "document", ids.docPrivate);
    expect(doc.status).toBe(200);
    expect(doc.headers.get("cache-control")).toBe("no-store");
    expect(await doc.json()).toEqual({ url: "https://storage.example.test/signed/1", expiresIn: 60 });
    expect((await file(token, "photo", ids.photo)).status).toBe(200);
    expect(signed.calls).toEqual([[`pets/${PET}/private-doc.pdf`, 60], [`pets/${PET}/ear.jpg`, 60]]);
  });

  it("never hands out a public web address or another pet's file", async () => {
    const { token } = await link({ sections: ["files"] });
    for (const id of [ids.docPublic, ids.docForeign]) {
      const res = await file(token, "document", id);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("file_not_available");
      expect(JSON.stringify(body)).not.toContain("example");
    }
    expect(signed.calls).toEqual([]);
  });

  it("opens nothing outside the granted sections or the pet", async () => {
    const files = await link({ sections: ["files"] });
    const photos = await link({ sections: ["photos"] });
    const neither = await link({ sections: ["vaccines", "lab_results", "vet_notes"] });
    expect((await file(files.token, "photo", ids.photo)).status).toBe(403);
    expect((await file(photos.token, "document", ids.docPrivate)).status).toBe(403);
    expect((await file(neither.token, "document", ids.docPrivate)).status).toBe(403);
    expect((await file(neither.token, "photo", ids.photo)).status).toBe(403);
    expect((await file(files.token, "document", ids.otherPetDoc)).status).toBe(403);
    expect((await file(files.token, "document", 999999)).status).toBe(403);
    expect((await file(files.token, "video", ids.docPrivate)).status).toBe(400);
    expect((await file(files.token, "document", "1")).status).toBe(400);
    expect(signed.calls).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("E. notes through a link", () => {
  const writable = { sections: ["vet_notes"], allowNotes: true };

  it("signed out: stored with no name, and never read as the owner's", async () => {
    const { id, token } = await link(writable);
    const res = await addNote(token, "  Looks healthy  ");
    expect(res.status).toBe(201);
    expect((await res.json()).note).toMatchObject({ author_name: null });
    const [row] = await noteRows();
    expect(row).toMatchObject({
      pet_id: PET, owner_user_id: OWNER.profileId, note: "Looks healthy",
      vet_name: "Cambios de alguien externo (enlace compartido)",
      created_by_user_id: null, created_by_role: null, external_author_name: null, record_link_id: id,
    });
    const [shown] = (await ownerNotes()).filter((n) => n.via_record_link);
    // App versions released before links show vet_name and created_by_name: both say where the note came from.
    expect(shown).toMatchObject({
      vet_name: "Cambios de alguien externo (enlace compartido)",
      created_by_name: "Cambios de alguien externo (enlace compartido)",
      created_by_role: "editor", external_author_name: null,
    });
    expect(shown).not.toHaveProperty("created_by_user_id");
    expect(shown).not.toHaveProperty("record_link_id");
    const { record } = await (await view(token)).json();
    expect(record.vet_notes.find((n: any) => n.note === "Looks healthy")).toMatchObject({ via_link: true, external_author_name: null });
  });

  it("labels an anonymous note in the owner's language", async () => {
    await raw`update user_profiles set preferred_locale = 'en' where id = ${OWNER.profileId}`;
    const { token } = await link(writable);
    expect((await addNote(token, "x")).status).toBe(201);
    expect((await noteRows())[0].vet_name).toBe("Anonymous (shared link)");
    expect((await addNote(token, "y", VET)).status).toBe(201);
    expect((await noteRows())[1]).toMatchObject({ vet_name: "Dr. Paula Gómez (shared link)", external_author_name: "Dr. Paula Gómez" });
  });

  it("signed in: the account's name, taken from the session and never from the body", async () => {
    const { token } = await link(writable);
    const res = await addNote(token, "Vaccine due", VET, {
      author_name: "Mallory", vet_name: "Mallory", external_author_name: "Mallory", userId: OWNER.profileId, note_date: "2000-01-01",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).note.author_name).toBe("Dr. Paula Gómez");
    const [row] = await noteRows();
    expect(row).toMatchObject({
      vet_name: "Dr. Paula Gómez (enlace compartido)", external_author_name: "Dr. Paula Gómez", created_by_user_id: VET.profileId,
    });
    expect(JSON.stringify(row)).not.toContain("Mallory");
    expect(row.note_date.toISOString().slice(0, 4)).not.toBe("2000");
    const [shown] = (await ownerNotes()).filter((n) => n.via_record_link);
    expect(shown).toMatchObject({
      created_by_name: "Dr. Paula Gómez (enlace compartido)", vet_name: "Dr. Paula Gómez (enlace compartido)",
    });
  });

  it("signed in without a public name: the account name; an e-mail address is never shown", async () => {
    const { token } = await link(writable);
    expect((await (await addNote(token, "a", NAMELESS)).json()).note.author_name).toBe("nameless");
    await raw`update auth_users set name = 'someone@example.com' where id = ${NAMELESS.authUserId}`;
    expect((await (await addNote(token, "b", NAMELESS)).json()).note.author_name).toBeNull();
    const rows = await noteRows();
    expect(rows[1]).toMatchObject({ vet_name: "Cambios de alguien externo (enlace compartido)", created_by_user_id: NAMELESS.profileId });
  });

  it("a display name that matches the owner's vet still reads as coming from a shared link", async () => {
    await raw`update pet_medical_profiles set primary_vet_name = 'Dr. Paula Gómez' where pet_id = ${PET}`;
    const { token } = await link(writable);
    await addNote(token, "x", VET);
    const [shown] = (await ownerNotes()).filter((n) => n.via_record_link);
    expect(shown.vet_name).toBe("Dr. Paula Gómez (enlace compartido)");
    expect(shown.created_by_name).toBe(shown.vet_name);
  });

  it("signed in before ever using the app: gets the account's name", async () => {
    await raw`insert into auth_users (id, name, email) values (50, 'New Vet', 'newvet@example.com')`;
    const { token } = await link(writable);
    const res = await addNote(token, "first", { authUserId: 50 });
    expect(res.status).toBe(201);
    expect((await res.json()).note.author_name).toBe("New Vet");
    expect((await noteRows())[0].created_by_user_id).not.toBeNull();
  });

  it("the owner using their own link is named, and the note is still marked as added through it", async () => {
    const { token } = await link(writable);
    expect((await addNote(token, "mine", OWNER)).status).toBe(201);
    expect((await noteRows())[0]).toMatchObject({ vet_name: "Olivia Owner (enlace compartido)", via_record_link: true });
  });

  it("is refused when the link does not allow notes, whoever asks", async () => {
    const { token } = await link({ sections: ["vet_notes"], allowNotes: false });
    for (const user of [null, VET, OWNER]) {
      const res = await addNote(token, "no", user);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("notes_not_allowed");
    }
    expect(await noteRows()).toHaveLength(0);
  });

  it("works for a link that shares other sections, without showing the notes", async () => {
    const { token } = await link({ sections: ["vaccines"], allowNotes: true });
    expect((await addNote(token, "added blind")).status).toBe(201);
    expect(JSON.stringify(await (await view(token)).json())).not.toContain("added blind");
  });

  it("refuses an empty or oversized note", async () => {
    const { token } = await link(writable);
    for (const note of ["", "   ", "x".repeat(2001), 7, undefined]) {
      expect((await addNote(token, note)).status).toBe(400);
      await unlimited();
    }
    expect((await addNote(token, "x".repeat(2000))).status).toBe(201);
    expect(await noteRows()).toHaveLength(1);
  });

  it("takes at most 10 notes per link in 24 hours, also when they arrive together", async () => {
    const first = await link(writable);
    for (let i = 0; i < 8; i++) {
      await unlimited();
      expect((await addNote(first.token, `n${i}`)).status).toBe(201);
    }
    await unlimited();
    as(null);
    const together = await Promise.all([1, 2, 3, 4].map(() => req("/public/record-link/notes", "POST", { token: first.token, note: "t" })));
    expect(together.map((r) => r.status).sort()).toEqual([201, 201, 429, 429]);
    expect((await together.find((r) => r.status === 429)!.json()).code).toBe("note_limit");
    expect(await noteRows()).toHaveLength(10);
    await unlimited();
    expect((await addNote((await link(writable)).token, "another link")).status).toBe(201);
    await raw`update vet_notes set created_at = now() - interval '25 hours' where record_link_id = ${first.id}`;
    await unlimited();
    expect((await addNote(first.token, "next day")).status).toBe(201);
  });

  it("changes and deletes nothing: only adds", async () => {
    const before = await raw`select * from vet_notes order by id`;
    const { token } = await link(writable);
    as(null);
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((await req("/public/record-link/notes", method, { token, id: before[0].id, note: "changed" })).status).toBe(404);
    }
    await addNote(token, "added", null, { id: before[0].id });
    const after = await raw`select * from vet_notes where not via_record_link order by id`;
    expect(after).toEqual(before);
  });

  it("when its author deletes their account, their name leaves the note", async () => {
    const { token } = await link(writable);
    await addNote(token, "from a vet", VET);
    await addNote(token, "from family", FAMILY);
    await asApp(FAMILY.profileId, (tx) => tx`select app_delete_my_account(false)`);
    await asApp(VET.profileId, (tx) => tx`select app_delete_my_account(false)`);
    const rows = await noteRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.external_author_name).toBe("Former member");
      expect(row.vet_name).toBe("Ex integrante (enlace compartido)");
    }
    expect(JSON.stringify(rows)).not.toContain("Paula");
  });

  it("the owner can delete a note added through a link", async () => {
    const { token } = await link(writable);
    await addNote(token, "bye");
    const [row] = await noteRows();
    as(OWNER);
    expect((await req(`/vet-record/notes?id=${row.id}`, "DELETE")).status).toBe(200);
    expect(await noteRows()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("F. a note added through a link", () => {
  const relationship = async () => (await raw`select app_pet_has_vet_relationship(${PET}) as ok`)[0].ok;

  it("does not count as a vet relationship; a note written in the record still does", async () => {
    await raw`delete from vet_notes`;
    const { token } = await link({ sections: ["vet_notes"], allowNotes: true });
    expect((await addNote(token, "anonymous")).status).toBe(201);
    expect((await addNote(token, "named", VET)).status).toBe(201);
    expect(await relationship()).toBe(false);
    await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note) values (${PET}, ${OWNER.profileId}, '2026-03-01', 'by hand')`;
    expect(await relationship()).toBe(true);
  });

  it("is labelled for a provider and in the vet summary", async () => {
    const { token } = await link({ sections: ["vet_notes"], allowNotes: true });
    await addNote(token, "named", VET);
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by, granted_at)
              values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read"]}, 'active', 'owner', now())`;
    as(VET);
    const record = await (await req(`/providers/${P1}/pets/${PET}/record`)).json();
    const shown = record.notes.find((n: any) => n.note === "named");
    expect(shown).toMatchObject({ via_record_link: true, external_author_name: "Dr. Paula Gómez" });
    expect(shown).not.toHaveProperty("created_by_user_id");
    expect(record.notes.find((n: any) => n.note === "OWNER-NOTE").via_record_link).toBe(false);

    as(OWNER);
    const today = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const summary = await (await req(`/vet-record/full-summary?petId=${PET}&from=2026-01-01&to=${today}`)).json();
    const authors = Object.fromEntries(summary.summary.vetNotes.map((n: any) => [n.note, n.vet_name]));
    expect(authors).toEqual({ named: "Dr. Paula Gómez (enlace compartido)", "OWNER-NOTE": null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("G. limits", () => {
  const from = (ip: string) => ({ "x-real-ip": ip });

  it("limits opening per sender, signed in or not", async () => {
    const { token } = await link();
    for (let i = 0; i < 30; i++) expect((await view(token, i % 2 ? VET : null, from("10.9.0.1"))).status).toBe(200);
    expect((await view(token, null, from("10.9.0.1"))).status).toBe(429);
    expect((await view(token, VET, from("10.9.0.1"))).status).toBe(429);
    expect((await view(token, null, from("10.9.0.2"))).status).toBe(200);
    const subjects = await raw`select subject from rate_limit_hits where bucket = 'record_link_open'`;
    expect(JSON.stringify(subjects)).not.toContain("10.9.0");
  });

  it("limits files and notes per sender", async () => {
    const { token } = await link({ sections: ["files"], allowNotes: true });
    for (let i = 0; i < 60; i++) expect((await file(token, "document", ids.docPrivate, from("10.9.0.3"))).status).toBe(200);
    expect((await file(token, "document", ids.docPrivate, from("10.9.0.3"))).status).toBe(429);
    const note = () => { as(null); return req("/public/record-link/notes", "POST", { token, note: "n" }, from("10.9.0.4")); };
    for (let i = 0; i < 5; i++) expect((await note()).status).toBe(201);
    expect((await note()).status).toBe(429);
    expect(await noteRows()).toHaveLength(5);
  });

  it("limits creating, per owner", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await create();
      if (res.status === 201) await remove((await res.json()).link.id);
    }
    expect((await create()).status).toBe(429);
  });

  it("ages the sender counters out after 90 days", async () => {
    await raw`insert into rate_limit_hits (bucket, subject, window_start, hits) values
      ('record_link_open', 'ip:old', now() - interval '91 days', 1),
      ('record_link_note', 'ip:old', now() - interval '91 days', 1),
      ('record_link_file', 'ip:young', now() - interval '1 day', 1),
      ('post_create', 'u:1', now() - interval '91 days', 1)`;
    await asApp(null, (tx) => tx`select app_purge_finder_details()`);
    expect((await raw`select bucket from rate_limit_hits order by bucket`).map((r) => r.bucket)).toEqual(["post_create", "record_link_file"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("H. the database rules, and invites stay invites", () => {
  it("only the owner reads, creates or removes a link row; nobody deletes one", async () => {
    const { id } = await link();
    for (const user of [OTHER.profileId, FAMILY.profileId, VET.profileId, null]) {
      expect(await asApp(user, (tx) => tx`select * from care_record_links`)).toHaveLength(0);
      expect((await asApp(user, (tx) => tx`update care_record_links set revoked_at = now() where id = ${id}`)).count).toBe(0);
    }
    expect((await asApp(OWNER.profileId, (tx) => tx`delete from care_record_links where id = ${id}`)).count).toBe(0);
    const insert = (user: number, owner: number) =>
      asApp(user, (tx) => tx`
        insert into care_record_links (pet_id, owner_user_id, token_hash, sections, expires_at)
        values (${PET}, ${owner}, ${sha(`t${user}`)}, ${["vaccines"]}, now() + interval '1 day')`);
    await expect(insert(OTHER.profileId, OTHER.profileId)).rejects.toThrow(/row-level security/);
    await expect(insert(OTHER.profileId, OWNER.profileId)).rejects.toThrow(/row-level security/);
    await asApp(OWNER.profileId, (tx) => tx`update care_record_links set revoked_at = now() where id = ${id}`);
    await expect(
      asApp(OWNER.profileId, (tx) => tx`update care_record_links set revoked_at = null where id = ${id}`),
    ).rejects.toThrow(/row-level security/);
  });

  it("the application role cannot set or change the record link columns of a note", async () => {
    const { id, token } = await link({ sections: ["vet_notes"], allowNotes: true });
    expect((await addNote(token, "through the link", VET)).status).toBe(201);
    const [linked] = await noteRows();
    const [plain] = await raw`select * from vet_notes where not via_record_link`;
    const refused = /written by the database only/;
    const insert = (user: number, columns: Record<string, unknown>) =>
      asApp(user, (tx) => tx`insert into vet_notes ${tx({
        pet_id: PET, owner_user_id: OWNER.profileId, note_date: "2026-03-01", note: "x", ...columns,
      })}`);
    for (const user of [OWNER.profileId, FAMILY.profileId]) {
      await expect(insert(user, { via_record_link: true })).rejects.toThrow(refused);
      await expect(insert(user, { via_record_link: true, record_link_id: id })).rejects.toThrow(refused);
      await expect(insert(user, { via_record_link: true, external_author_name: "Someone" })).rejects.toThrow(refused);
      for (const change of [
        { via_record_link: false, record_link_id: null, external_author_name: null },
        { record_link_id: null },
        { external_author_name: "Someone else" },
      ]) {
        await expect(
          asApp(user, (tx) => tx`update vet_notes set ${tx(change)} where id = ${linked.id}`),
        ).rejects.toThrow(refused);
      }
      await expect(
        asApp(user, (tx) => tx`update vet_notes set via_record_link = true where id = ${plain.id}`),
      ).rejects.toThrow(refused);
    }
    // Changing whose it is would rename the note: refused the same way.
    await expect(
      asApp(OWNER.profileId, (tx) => tx`update vet_notes set created_by_user_id = null where id = ${linked.id}`),
    ).rejects.toThrow(refused);
    expect(await noteRows()).toEqual([linked]);

    // Everything else about a note works as before.
    await insert(OWNER.profileId, {});
    expect((await asApp(OWNER.profileId, (tx) => tx`update vet_notes set note = 'edited' where id = ${linked.id}`)).count).toBe(1);
    expect((await asApp(OWNER.profileId, (tx) => tx`delete from vet_notes where id = ${linked.id}`)).count).toBe(1);
  });

  it("removing a link or its author still updates its notes", async () => {
    const { id, token } = await link({ sections: ["vet_notes"], allowNotes: true });
    await addNote(token, "x", VET);
    await raw`delete from care_record_links where id = ${id}`;
    expect((await noteRows())[0]).toMatchObject({ via_record_link: true, record_link_id: null });
    // The foreign key's own update, started by the application role.
    await asApp(VET.profileId, (tx) => tx`select app_delete_my_account(false)`);
    expect((await noteRows())[0]).toMatchObject({ external_author_name: "Former member", created_by_user_id: null });
    // The foreign key's own updates also work when the application role's statement starts them.
    await addNote((await link({ sections: ["vet_notes"], allowNotes: true })).token, "y");
    expect((await asApp(OWNER.profileId, (tx) => tx`delete from pets where id = ${PET}`)).count).toBe(1);
    expect(await noteRows()).toHaveLength(0);
  });

  it("cannot store a link that outlives a year, has no section or an unknown one", async () => {
    const insert = (sections: string[], length: string) => raw`
      insert into care_record_links (pet_id, owner_user_id, token_hash, sections, expires_at)
      values (${PET}, ${OWNER.profileId}, ${sha(sections.join() + length)}, ${sections}, now() + ${length}::interval)`;
    await expect(insert(["vaccines"], "367 days")).rejects.toThrow(/expiry_check/);
    await expect(insert([], "1 day")).rejects.toThrow(/sections_check/);
    await expect(insert(["allergies"], "1 day")).rejects.toThrow(/sections_check/);
  });

  it("an invite link, old or new, shows nothing through the record link routes; a record link is not an invite", async () => {
    as(OWNER);
    const invite = await (await req("/care-access/invites", "POST", { petId: PET })).json();
    const inviteToken = invite.link.split("#")[1];
    expect((await view(inviteToken)).status).toBe(403);
    expect((await addNote(inviteToken, "no")).status).toBe(403);
    expect((await file(inviteToken, "document", ids.docPrivate)).status).toBe(403);

    // An app that predates record links keeps creating invites, whatever else it sends.
    as(OWNER);
    const again = await (await req("/care-access/invites", "POST", { petId: PET, sections: ["files"], expiry: "1y", allowNotes: true })).json();
    expect(again.link).toContain("/vet-invite#");
    expect(await linkRows()).toHaveLength(0);
    expect((await view(again.link.split("#")[1])).status).toBe(403);

    const { token } = await link({ sections: ALL });
    as(VET);
    expect((await req("/care-access/invites/preview", "POST", { token })).status).toBe(404);
    expect((await req("/care-access/invites/accept", "POST", { token, providerId: P1 })).status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("I. a database without 0153", () => {
  const strip = async () => {
    await raw.unsafe(`
      drop trigger if exists vet_notes_record_link_author_gone on vet_notes;
      drop function if exists app_record_link_note_author_gone();
      drop trigger if exists vet_notes_record_link_guard on vet_notes;
      drop function if exists app_vet_note_link_fields_guard();
      drop function if exists app_record_link_view(text);
      drop function if exists app_record_link_file(text, text, integer);
      drop function if exists app_record_link_add_note(text, text);
      alter table vet_notes drop constraint if exists vet_notes_record_link_check;
      alter table vet_notes drop column if exists via_record_link, drop column if exists record_link_id,
        drop column if exists external_author_name;
      drop table if exists care_record_links;
      create or replace function app_pet_has_vet_relationship(p_pet_id integer) returns boolean
        language sql stable security definer set search_path = public, pg_temp
        as $$ select exists (select 1 from vet_notes vn where vn.pet_id = p_pet_id) $$;
    `);
  };
  beforeAll(strip);
  afterAll(async () => {
    await raw.unsafe(migration("0153_vet_record_links.sql"));
  });

  it("reports links as not available, and creates nothing of another kind", async () => {
    const listed = await list();
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ available: false, links: [] });
    const res = await create(choice({ allowNotes: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("share_links_unavailable");
    expect((await remove(1)).status).toBe(404);
    expect(await raw`select * from care_access_invites`).toHaveLength(0);
    expect(await raw`select * from care_access_grants`).toHaveLength(0);
  });

  it("answers the public routes as for any unusable link", async () => {
    const token = "B".repeat(43);
    for (const res of [await view(token), await file(token, "document", ids.docPrivate), await addNote(token, "x"), await addNote(token, "x", VET)]) {
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("link_not_valid");
    }
  });

  it("leaves the existing record routes and invites working", async () => {
    expect((await ownerNotes()).map((n) => n.note)).toEqual(["OWNER-NOTE"]);
    as(OWNER);
    const summary = await req(`/vet-record/full-summary?petId=${PET}&from=2026-01-01&to=2026-12-31`);
    expect(summary.status).toBe(200);
    expect((await summary.json()).summary.vetNotes).toHaveLength(1);
    expect((await req("/care-access/invites", "POST", { petId: PET })).status).toBe(201);
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by, granted_at)
              values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read"]}, 'active', 'owner', now())`;
    as(VET);
    const record = await req(`/providers/${P1}/pets/${PET}/record`);
    expect(record.status).toBe(200);
    expect((await record.json()).notes).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("J. verify_0153.sql", () => {
  // verify_0153 describes the database right after 0153: a later function that also reads the links (0157) is left out
  // while it runs.
  beforeAll(async () => {
    await raw.unsafe("drop function if exists app_record_link_update_note(text, integer, text)");
  });
  afterAll(async () => {
    await raw.unsafe(migration("0157_record_link_note_edit.sql"));
  });
  const failing = async () =>
    ((await raw.unsafe(verify0153())) as any[]).filter((r) => r.status !== "PASS").map((r) => r.ord);

  it("reads PASS on every row of the migrated database, also after re-applying", async () => {
    await raw.unsafe(migration("0153_vet_record_links.sql"));
    await raw.unsafe(migration("0153_vet_record_links.sql"));
    const rows = (await raw.unsafe(verify0153())) as any[];
    expect(rows).toHaveLength(20);
    for (const r of rows) expect(r.status, `${r.ord} ${r.check_name} :: ${r.detail}`).toBe("PASS");
  });

  it("can fail: an exposed function, a looser policy, a counted link note and missing triggers are flagged", async () => {
    try {
      await raw.unsafe(`
        grant execute on function app_record_link_view(text) to public;
        create policy care_record_links_anyone on care_record_links for select using (true);
        drop trigger vet_notes_record_link_author_gone on vet_notes;
        drop trigger vet_notes_record_link_guard on vet_notes;
        create or replace function app_pet_has_vet_relationship(p_pet_id integer) returns boolean
          language sql stable security definer set search_path = public, pg_temp
          as $$ select exists (select 1 from vet_notes vn where vn.pet_id = p_pet_id) $$;
      `);
      expect(await failing()).toEqual([3, 12, 17, 18, 20]);
    } finally {
      await raw.unsafe("drop policy if exists care_record_links_anyone on care_record_links");
      await raw.unsafe(migration("0153_vet_record_links.sql"));
    }
    // A public grant is only removed by the revoke in the migration, which just ran.
    expect(await failing()).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("K. request bodies, signing and the characters the database cannot hold", () => {
  const post = (path: string, body: string, headers: Record<string, string> = {}) => {
    as(null);
    return req(`/public/record-link/${path}`, "POST", body, headers);
  };

  it.each([["open", 1024], ["file", 1024], ["notes", 16 * 1024]])(
    "%s refuses a body over %i bytes before counting it",
    async (path, cap) => {
      const { token } = await link({ sections: ["files"], allowNotes: true });
      const big = JSON.stringify({ token, note: "x", kind: "document", id: ids.docPrivate, pad: "p".repeat(cap) });
      for (const headers of [{}, { "content-length": String(big.length) }] as Record<string, string>[]) {
        const res = await post(path, big, { "x-real-ip": "10.9.1.1", ...headers });
        expect(res.status).toBe(413);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect((await res.json()).code).toBe("too_large");
      }
      expect(await raw`select * from rate_limit_hits where bucket like 'record_link_%' and bucket <> 'record_link_create'`).toHaveLength(0);
      expect(await noteRows()).toHaveLength(0);
      expect(signed.calls).toEqual([]);
    },
  );

  it("accepts the longest note however it is escaped, and reads a broken body as an empty one", async () => {
    const { token } = await link({ sections: ["vet_notes"], allowNotes: true });
    // Every character written as a six-character JSON escape: the longest a note of that length can arrive.
    const escaped = `{"token":"${token}","note":"${"\\u0041".repeat(2000)}"}`;
    expect((await post("notes", escaped)).status).toBe(201);
    expect((await noteRows())[0].note).toBe("A".repeat(2000));
    for (const path of ["open", "file", "notes"]) expect((await post(path, "not json")).status).toBe(403);
  });

  it("signs a file only after the request's transaction has ended", async () => {
    const { token } = await link({ sections: ["files"] });
    let counted: number | undefined;
    // Seen from another connection, the attempt is already counted: the transaction is committed.
    signed.whileSigning = async () => {
      counted = (await raw`select coalesce(sum(hits), 0)::int as n from rate_limit_hits where bucket = 'record_link_file'`)[0].n;
    };
    expect((await file(token, "document", ids.docPrivate, { "x-real-ip": "10.9.1.2" })).status).toBe(200);
    expect(counted).toBe(1);
  });

  it("answers 502 when the storage service cannot sign", async () => {
    const { token } = await link({ sections: ["files"] });
    signed.whileSigning = async () => { throw new Error("timed out"); };
    const res = await file(token, "document", ids.docPrivate);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("timed out");
  });

  it("leaves a NUL character out of a note and of a name", async () => {
    const nul = String.fromCharCode(0);
    const { token } = await link({ sections: ["vet_notes"], allowNotes: true });
    expect((await addNote(token, `before${nul}after`)).status).toBe(201);
    expect((await noteRows())[0].note).toBe("beforeafter");
    const empty = await addNote(token, `${nul} ${nul}`);
    expect(empty.status).toBe(400);
    expect((await empty.json()).code).toBe("bad_note");

    await raw`insert into auth_users (id, name, email) values (60, 'Nul Vet', 'nul@example.test')`;
    authState.session = { user: { id: 60, name: `Nul${nul} Vet` } };
    const res = await req("/public/record-link/notes", "POST", { token, note: "signed in" });
    expect(res.status).toBe(201);
    expect((await res.json()).note.author_name).toBe("Nul Vet");
  });
});

