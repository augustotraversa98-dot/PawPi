// A vet adding to the owner's record (migration 0160), through the real Hono router + real Postgres as pawpi_app:
// exactly the parts the owner allows, attributed, never deletable by the vet, and nothing for a view-only share.

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
const store = vi.hoisted(() => ({ saved: [] as string[], removed: [] as string[], fail: false }));
vi.mock("@/app/api/utils/vetFile", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  storeVetFile: async (petId: number, file: { ext: string }) => {
    if (store.fail) throw new Error("storage down");
    const key = `pets/${petId}/stored-${store.saved.length + 1}.${file.ext}`;
    store.saved.push(key);
    return key;
  },
  discardVetFile: async (key: string) => { store.removed.push(key); },
}));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Olivia Owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "vet", fullName: "Dr. Paula" };
const VET2 = { authUserId: 4, profileId: 4, username: "vet2", fullName: "Dr. Second" };
const PET = OWNER.petId;
// The address uploads come from, so the per-sender limit has someone to count.
const SENDER = "203.0.113.5";
const P1 = 1;
const P2 = 2;
const ALL = ["vet_notes", "vaccines", "files", "lab_results"];

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
const send = async (path: string, method: string, body: unknown, user: Person | null) => {
  as(user);
  const res = await req(path, method, body);
  return { status: res.status, body: await res.json() };
};
const multipart = async (path: string, fields: Record<string, string>, file: File | null, user: Person | null) => {
  as(user);
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append("file", file);
  const encoded = new Request("http://localhost/x", { method: "POST", body: form });
  const bytes = await encoded.arrayBuffer();
  const res = await api.request(path, {
    method: "POST",
    headers: {
      "content-type": encoded.headers.get("content-type")!, "content-length": String(bytes.byteLength),
      "x-real-ip": SENDER,
    },
    body: bytes,
  });
  return { status: res.status, body: await res.json() };
};
const pdf = (name = "blood.pdf", content = "%PDF-1.4 test") => new File([content], name, { type: "application/pdf" });

const share = async (editSections: string[], over: Record<string, unknown> = {}) => {
  const res = await send("/care-access/grants", "POST", {
    petId: PET, providerId: P1, sections: ALL, editSections, expiry: "7d", ...over,
  }, OWNER);
  expect([200, 201]).toContain(res.status);
  return res.body.grant;
};
const base = `/providers/${P1}/pets/${PET}`;
const writes: Record<string, (user?: Person) => Promise<{ status: number; body: any }>> = {
  vet_notes: (user = VET) => send(`${base}/notes`, "POST", { note: "VET-NOTE" }, user),
  vaccines: (user = VET) => send(`${base}/vaccinations`, "POST", { name: "Rabies", date_given: "2026-11-01", lot: "L1" }, user),
  lab_results: (user = VET) => send(`${base}/lab-results`, "POST", { test_name: "Urine", test_date: "2026-11-02" }, user),
  files: (user = VET) => multipart(`${base}/documents`, { name: "Blood", category: "lab" }, pdf(), user),
};
const TABLE: Record<string, string> = {
  vet_notes: "vet_notes", vaccines: "pet_vaccinations", lab_results: "pet_lab_results", files: "vet_documents",
};
const count = async (section: string) =>
  (await raw`select count(*)::int as n from ${raw(TABLE[section])}`)[0].n as number;
const ownerList = async (path: string, key: string) => {
  as(OWNER);
  const res = await req(`${path}?petId=${PET}`);
  expect(res.status).toBe(200);
  return (await res.json())[key] as any[];
};
const link = async (over: Record<string, unknown> = {}) => {
  const res = await send("/care-access/links", "POST", {
    petId: PET, sections: ["vaccines", "files", "lab_results"], expiry: "7d", allowNotes: false, ...over,
  }, OWNER);
  expect(res.status).toBe(201);
  return { id: res.body.link.id as number, token: res.body.url.split("#")[1] as string };
};
const linkAdd = (token: string, section: string, data: unknown, user: Person | null = null) =>
  send("/public/record-link/records", "POST", { token, section, data }, user);
const linkUpload = (token: string, user: Person | null = null, file: File | null = pdf(), fields = {}) =>
  multipart("/public/record-link/documents", { token, name: "Scan", ...fields }, file, user);
const unlimited = () => raw`delete from rate_limit_hits`;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

const migration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");
const latest = async () => {
  for (const name of ["0157_record_link_note_edit.sql", "0158_share_edit_permission.sql", "0159_edit_share.sql",
    "0160_vet_record_writes.sql"]) {
    await raw.unsafe(migration(name));
  }
};
const forgetSupport = async () =>
  ((await import("@/app/api/utils/editAccess")) as any).resetEditAccessSupport();

beforeAll(async () => {
  raw = makeTestSql();
  // Other files re-apply older migrations on the shared database, which restores older functions.
  await latest();
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
afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
  store.saved = [];
  store.removed = [];
  store.fail = false;
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  await seedUser(raw, VET);
  await seedUser(raw, VET2);
  await raw`select setval(pg_get_serial_sequence('auth_users', 'id'), 100), setval(pg_get_serial_sequence('user_profiles', 'id'), 100)`;
  for (const [providerId, vet, name] of [[P1, VET, "biz-1"], [P2, VET2, "biz-2"]] as const) {
    await seedProviderWithStaff(raw, {
      providerId, ownerUserProfileId: vet.profileId, staffUserProfileId: vet.profileId, staffRole: "owner",
      slug: name, providerStatus: "published",
    });
    await seedCapability(raw, { providerId, capability: "vet" });
  }
  await raw`update providers set name = 'Clinica Uno' where id = ${P1}`;
});

describe("a view-only share", () => {
  it("lets the vet write nothing at all", async () => {
    await share([]);
    for (const section of ALL) {
      const res = await writes[section]();
      expect(res.status, section).toBe(403);
      expect(await count(section), section).toBe(0);
    }
    expect(store.saved).toEqual([]);
  });

  it("and the database refuses a direct write too", async () => {
    await share([]);
    await expect(asApp(VET.profileId, (tx) => tx`insert into pet_vaccinations (pet_id, owner_user_id, name)
      values (${PET}, ${OWNER.profileId}, 'x')`)).rejects.toMatchObject({ code: "42501" });
    await expect(asApp(VET.profileId, (tx) => tx`insert into pet_lab_results (pet_id, owner_user_id, test_name, test_date)
      values (${PET}, ${OWNER.profileId}, 'x', '2026-01-01')`)).rejects.toMatchObject({ code: "42501" });
    const [res] = await asApp(VET.profileId, (tx) => tx`select outcome from app_provider_add_record(
      ${PET}, ${P1}, 'vaccines', '{"name":"x"}'::jsonb)`);
    expect(res.outcome).toBe("not_allowed");
  });
});

describe("a share that allows adding", () => {
  it.each(ALL)("to %s allows that part and no other", async (allowed) => {
    await share([allowed]);
    for (const section of ALL) {
      const res = await writes[section]();
      expect(res.status, section).toBe(section === allowed ? 201 : 403);
      expect(await count(section), section).toBe(section === allowed ? 1 : 0);
    }
    const [audit] = await raw`select * from care_access_audit where action = 'write'`;
    expect(audit.staff_user_id).toBe(VET.profileId);
  });

  it("puts each addition in the owner's record, saying which clinic added it and when", async () => {
    await share(ALL);
    for (const section of ALL) expect((await writes[section]()).status).toBe(201);
    const rows = [
      (await ownerList("/pet-vaccinations", "vaccinations"))[0],
      (await ownerList("/vet-record/lab-results", "labResults"))[0],
      (await ownerList("/vet-record/documents", "documents"))[0],
      (await ownerList("/vet-record/notes", "notes"))[0],
    ];
    for (const row of rows) {
      expect(row).toMatchObject({
        owner_user_id: OWNER.profileId, created_by_user_id: VET.profileId, created_by_role: "editor",
        added_by_provider_id: P1, added_by_provider_name: "Clinica Uno", created_by_name: "Clinica Uno",
      });
      expect(row.created_at).toBeTruthy();
    }
    expect(rows[0]).toMatchObject({ name: "Rabies", lot: "L1", clinic_name: "Clinica Uno", administered_by_provider_id: P1 });
    expect(rows[2]).toMatchObject({ name: "Blood", category: "lab", file_url: store.saved[0] });
  });

  it("only the owner removes it", async () => {
    await share(ALL);
    for (const section of ALL) await writes[section]();
    const [lab] = await raw`select id from pet_lab_results`;
    const [doc] = await raw`select id from vet_documents`;
    for (const path of [`/vet-record/lab-results?id=${lab.id}`, `/vet-record/documents?id=${doc.id}`]) {
      await send(path, "DELETE", undefined, VET);
    }
    await asApp(VET.profileId, (tx) => tx`delete from pet_vaccinations`);
    await asApp(VET.profileId, (tx) => tx`delete from vet_notes`);
    for (const section of ALL) expect(await count(section), section).toBe(1);
    await send(`/vet-record/lab-results?id=${lab.id}`, "DELETE", undefined, OWNER);
    expect(await count("lab_results")).toBe(0);
  });

  it("stops as soon as the permission is removed, the access ends or it expires", async () => {
    const grant = await share(ALL);
    await send(`/care-access/grants/${grant.id}`, "PATCH",
      { action: "update", sections: ALL, editSections: ["vaccines"], expiry: "keep" }, OWNER);
    expect((await writes.lab_results()).status).toBe(403);
    expect((await writes.vaccines()).status).toBe(201);
    await raw`update care_access_grants set expires_at = now() - interval '1 second'`;
    expect((await writes.vaccines()).status).toBe(403);
    await raw`update care_access_grants set expires_at = null, status = 'revoked', revoked_at = now()`;
    expect((await writes.vaccines()).status).toBe(403);
  });

  it("is only this business's: another one, or a person who is not its staff, writes nothing", async () => {
    await share(ALL);
    expect((await writes.vaccines(VET2)).status).toBe(403);
    expect((await send(`/providers/${P2}/pets/${PET}/vaccinations`, "POST", { name: "x" }, VET2)).status).toBe(403);
    expect((await send(`/providers/${P1}/pets/${OTHER.petId}/lab-results`, "POST",
      { test_name: "x", test_date: "2026-01-01" }, VET)).status).toBe(403);
    expect(await count("vaccines")).toBe(0);
  });

  it("does not survive the dog changing owner", async () => {
    await share(ALL);
    await raw.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${String(OWNER.profileId)}, true)`;
      await tx`update pets set owner_user_id = ${OTHER.profileId} where id = ${PET}`;
    });
    expect((await writes.vaccines()).status).toBe(403);
  });

  it("refuses invalid entries and unreadable files, storing nothing", async () => {
    await share(ALL);
    expect((await send(`${base}/lab-results`, "POST", { test_name: "x", test_date: "tomorrow" }, VET)).status).toBe(400);
    expect((await send(`${base}/vaccinations`, "POST", { name: "x", date_given: "2026-13-45" }, VET)).status).toBe(400);
    const fake = await multipart(`${base}/documents`, { name: "x" }, pdf("evil.pdf", "<html>"), VET);
    expect([fake.status, fake.body.code]).toEqual([400, "file_type"]);
    store.fail = true;
    expect((await writes.files()).status).toBe(502);
    for (const section of ALL) expect(await count(section), section).toBe(0);
  });

  it("removes the stored file when the row cannot be saved", async () => {
    await share(ALL);
    const res = await multipart(`${base}/documents`, { name: "x", document_date: "not-a-date" }, pdf(), VET);
    expect(res.status).toBe(400);
    expect(store.removed).toEqual(store.saved);
  });

  it("lets a business correct its own note, and no other", async () => {
    await share(["vet_notes"]);
    const added = (await writes.vet_notes()).body.note;
    await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note) values (${PET}, ${OWNER.profileId}, '2026-01-01', 'OWNER')`;
    const [own] = await raw`select id from vet_notes where note = 'OWNER'`;
    as(VET);
    const shown = (await (await req(`${base}/record`)).json());
    expect(shown.editSections).toEqual(["vet_notes"]);
    expect(Object.fromEntries(shown.notes.map((n: any) => [n.note, n.editable]))).toEqual({ "VET-NOTE": true, OWNER: false });
    const edited = await send(`${base}/notes/${added.id}`, "PATCH", { note: "Corrected" }, VET);
    expect(edited.status).toBe(200);
    expect(edited.body.note).toMatchObject({ note: "Corrected" });
    expect(edited.body.note.vet_edited_at).toBeTruthy();
    expect((await send(`${base}/notes/${own.id}`, "PATCH", { note: "x" }, VET)).status).toBe(404);
    expect((await send(`${base}/notes/${added.id}`, "PATCH", { note: "x" }, VET2)).status).toBe(403);
    await raw`update care_access_grants set edit_sections = '{}'`;
    expect((await send(`${base}/notes/${added.id}`, "PATCH", { note: "x" }, VET)).status).toBe(403);
    expect((await raw`select note from vet_notes where id = ${own.id}`)[0].note).toBe("OWNER");
  });

  it("an id written another way reaches no write at all, also with the older scopes", async () => {
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by, granted_at)
      values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read", "medical_write", "vaccinations_write"]},
              'active', 'owner', now())`;
    await raw.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${String(OWNER.profileId)}, true)`;
      await tx`update pets set owner_user_id = ${OTHER.profileId} where id = ${PET}`;
    });
    for (const petId of ["01", "%201", "1.0", "1"]) {
      for (const [path, body] of [["notes", { note: "x" }], ["vaccinations", { name: "x" }]] as const) {
        const res = await send(`/providers/${P1}/pets/${petId}/${path}`, "POST", body, VET);
        expect(res.status, `${petId}/${path}`).toBe(403);
      }
    }
    expect(await count("vet_notes")).toBe(0);
    expect(await count("vaccines")).toBe(0);
    // A refused write is not recorded as one.
    expect(await raw`select * from care_access_audit where action = 'write'`).toHaveLength(0);
  });

  it("removing access waits for a row being written, and nothing is written after it", async () => {
    const grant = await share(["vaccines"]);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let added!: () => void;
    const writing = new Promise<void>((resolve) => (added = resolve));
    const write = asApp(VET.profileId, async (tx) => {
      const [res] = await tx`select outcome from app_provider_add_record(${PET}, ${P1}, 'vaccines', '{"name":"x"}'::jsonb)`;
      added();
      await held;
      return res.outcome;
    });
    await writing;
    let removed = false;
    const removal = raw`update care_access_grants set status = 'revoked', revoked_at = now() where id = ${grant.id}`
      .then(() => { removed = true; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(removed).toBe(false);
    release();
    expect(await write).toBe("added");
    await removal;
    expect((await writes.vaccines()).status).toBe(403);
  });

  it("a business never learns which account added something through a link", async () => {
    const { token } = await link({ editSections: ["vaccines", "lab_results"] });
    await linkAdd(token, "vaccines", { name: "Rabies\u0000 \ud800" }, VET2);
    await linkAdd(token, "lab_results", { test_name: "x", test_date: "2026-01-01" });
    await share([]);
    as(VET);
    const body = await (await req(`${base}/record`)).json();
    for (const row of [body.vaccinations[0], body.lab_results[0]]) {
      expect(row.via_record_link).toBe(true);
      expect(row).not.toHaveProperty("created_by_user_id");
      expect(row).not.toHaveProperty("record_link_id");
    }
    const view = await send("/public/record-link/open", "POST", { token }, null);
    expect(view.body.record.vaccines[0]).toMatchObject({ via_link: true, external_author_name: "Dr. Second" });
  });

  it("a note added this way unlocks nothing", async () => {
    await share(["vet_notes"]);
    await writes.vet_notes();
    expect((await raw`select app_pet_has_vet_relationship(${PET}) as ok`)[0].ok).toBe(false);
  });
});

describe("the older write scopes", () => {
  beforeEach(async () => {
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by, granted_at)
      values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read", "medical_write", "vaccinations_write"]},
              'active', 'owner', now())`;
  });

  it("still add notes and vaccines, now saying who, and never documents or lab results", async () => {
    expect((await writes.vet_notes()).status).toBe(201);
    expect((await writes.vaccines()).status).toBe(201);
    expect((await writes.lab_results()).status).toBe(403);
    expect((await writes.files()).status).toBe(403);
    const [note] = await ownerList("/vet-record/notes", "notes");
    expect(note).toMatchObject({ added_by_provider_id: P1, via_vet_share: false, created_by_name: "Clinica Uno" });
    expect((await raw`select app_pet_has_vet_relationship(${PET}) as ok`)[0].ok).toBe(true);
    expect((await raw`select count(*)::int as n from care_access_audit where action = 'write'`)[0].n).toBe(2);
  });

  it("correct the notes they added", async () => {
    const note = (await writes.vet_notes()).body.note;
    expect((await send(`${base}/notes/${note.id}`, "PATCH", { note: "Fixed" }, VET)).status).toBe(200);
  });

  it("keep working on a database without 0160, which cannot add anything else", async () => {
    try {
      await raw.unsafe(`
        drop function app_provider_add_record(integer, integer, text, jsonb);
        drop function app_provider_update_vet_note(integer, integer, integer, text);
        drop function app_record_link_add_record(text, text, jsonb);
        drop function app_record_link_check_edit(text, text);
      `);
      await forgetSupport();
      expect((await writes.vet_notes()).status).toBe(201);
      expect((await writes.vaccines()).status).toBe(201);
      expect((await writes.lab_results()).status).toBe(403);
      const note = (await raw`select id from vet_notes`)[0];
      expect((await send(`${base}/notes/${note.id}`, "PATCH", { note: "x" }, VET)).body.code).toBe("note_edit_unavailable");
      const { token } = await link();
      expect((await linkAdd(token, "vaccines", { name: "x" })).body.code).toBe("add_unavailable");
      expect((await linkUpload(token)).body.code).toBe("add_unavailable");
      as(OWNER);
      expect((await (await req("/care-access/grants")).json()).editAccessAvailable).toBe(false);
    } finally {
      await latest();
      await forgetSupport();
    }
  });
});

describe("through a record link", () => {
  it("a view-only link adds nothing", async () => {
    const { token } = await link();
    for (const section of ["vaccines", "lab_results", "files", "vet_notes", "photos"]) {
      const res = await linkAdd(token, section, { name: "x", test_name: "x", test_date: "2026-01-01" });
      expect(res.body.code, section).toBe("add_not_allowed");
    }
    expect((await linkUpload(token)).body.code).toBe("add_not_allowed");
    expect(store.saved).toEqual([]);
    for (const section of ["vaccines", "lab_results", "files"]) expect(await count(section)).toBe(0);
  });

  it("adds exactly the allowed parts, and the owner sees where they came from", async () => {
    const { token, id } = await link({ editSections: ["vaccines", "files"] });
    expect((await linkAdd(token, "vaccines", { name: "Rabies", clinic_name: "Vet Sur" })).status).toBe(201);
    expect((await linkAdd(token, "lab_results", { test_name: "x", test_date: "2026-01-01" })).body.code).toBe("add_not_allowed");
    expect((await linkUpload(token, null, pdf(), { category: "lab" })).status).toBe(201);
    const [vaccine] = await ownerList("/pet-vaccinations", "vaccinations");
    expect(vaccine).toMatchObject({
      name: "Rabies", clinic_name: "Vet Sur", via_record_link: true, created_by_role: "editor",
      created_by_name: "Cambios de alguien externo (enlace compartido)", added_by_provider_id: null,
    });
    expect(vaccine).not.toHaveProperty("record_link_id");
    const [doc] = await ownerList("/vet-record/documents", "documents");
    expect(doc).toMatchObject({ name: "Scan", category: "lab", file_url: `pets/${PET}/stored-1.pdf`, via_record_link: true });
    expect((await raw`select record_link_id from vet_documents`)[0].record_link_id).toBe(id);
    const view = await send("/public/record-link/open", "POST", { token }, null);
    expect(view.body.record.edit_sections).toEqual(["vaccines", "files"]);
    expect(view.body.record.files[0]).toMatchObject({ name: "Scan", file_available: true });
    expect(JSON.stringify(view.body)).not.toContain("stored-1");
  });

  it("carries a signed-in author's name from the session only, until their account is gone", async () => {
    const { token } = await link({ editSections: ["lab_results"] });
    const res = await linkAdd(token, "lab_results",
      { test_name: "x", test_date: "2026-01-01", external_author_name: "Mallory", owner_user_id: 2 }, VET);
    expect(res.body.author_name).toBe("Dr. Paula");
    const [row] = await raw`select * from pet_lab_results`;
    expect(row).toMatchObject({ external_author_name: "Dr. Paula", created_by_user_id: VET.profileId, owner_user_id: OWNER.profileId });
    await raw`delete from auth_users where id = ${VET.authUserId}`;
    expect((await raw`select external_author_name from pet_lab_results`)[0].external_author_name).toBe("Former member");
  });

  it("counts a sender's upload limit before reading any of the upload", async () => {
    const { token } = await link({ editSections: ["files"] });
    for (let i = 0; i < 10; i += 1) expect((await linkUpload("A".repeat(43))).status).toBe(403);
    let reads = 0;
    const body = new ReadableStream({ pull(c) { reads += 1; c.close(); } }, { highWaterMark: 0 });
    as(null);
    const res = await api.request("/public/record-link/documents", {
      method: "POST", body, duplex: "half",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "9000000", "x-real-ip": SENDER },
    } as any);
    expect(res.status).toBe(429);
    expect(reads).toBe(0);
    expect((await linkUpload(token)).status).toBe(429);
    expect(store.saved).toEqual([]);
  });

  it("validates, limits a day's additions and stops with the link", async () => {
    const { token, id } = await link({ editSections: ["vaccines", "files"] });
    expect((await linkAdd(token, "vaccines", { name: "  " })).body.code).toBe("bad_data");
    expect((await linkAdd(token, "vaccines", { name: "a", date_given: "soon" })).body.code).toBe("bad_data");
    const bad = await linkUpload(token, null, pdf("a.pdf", "plain text"));
    expect(bad.body.code).toBe("file_type");
    const big = await linkUpload(token, null, new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }));
    expect(big.status).toBe(413);
    await unlimited();
    for (let i = 0; i < 20; i += 1) {
      if (i % 5 === 0) await unlimited();
      expect((await linkAdd(token, "vaccines", { name: `v${i}` })).status).toBe(201);
    }
    await unlimited();
    expect((await linkAdd(token, "vaccines", { name: "one too many" })).body.code).toBe("record_limit");
    expect((await linkUpload(token)).body.code).toBe("record_limit");
    expect(store.saved).toEqual([]);
    await raw`update care_record_links set revoked_at = now() where id = ${id}`;
    expect((await linkAdd(token, "vaccines", { name: "late" })).body.code).toBe("link_not_valid");
    expect((await linkUpload(token)).body.code).toBe("link_not_valid");
  });
});

describe("the database on its own", () => {
  it("the application role cannot forge or change who added a row", async () => {
    for (const statement of [
      (tx: Sql) => tx`insert into pet_vaccinations (pet_id, owner_user_id, name, added_by_provider_id)
        values (${PET}, ${OWNER.profileId}, 'x', ${P1})`,
      (tx: Sql) => tx`insert into pet_lab_results (pet_id, owner_user_id, test_name, test_date, via_record_link)
        values (${PET}, ${OWNER.profileId}, 'x', '2026-01-01', true)`,
      (tx: Sql) => tx`insert into vet_notes (pet_id, owner_user_id, note_date, note, via_vet_share)
        values (${PET}, ${OWNER.profileId}, '2026-01-01', 'x', true)`,
      (tx: Sql) => tx`select app_insert_shared_record('vaccines', ${PET}, ${OWNER.profileId}, '{"name":"x"}'::jsonb,
        ${OWNER.profileId}, 'owner', ${P1}, null, null, null)`,
    ]) {
      await expect(asApp(OWNER.profileId, statement)).rejects.toMatchObject({ code: "42501" });
    }
    await expect(asApp(OTHER.profileId, (tx) => tx`select app_insert_shared_record('vaccines', ${PET},
      ${OWNER.profileId}, '{"name":"x"}'::jsonb, ${OTHER.profileId}, 'editor', null, null, null, null)`))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("verify_0160.sql reads PASS on every row, also after re-applying", async () => {
    await raw.unsafe(migration("0160_vet_record_writes.sql"));
    await raw.unsafe(migration("0160_vet_record_writes.sql"));
    const rows = (await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0160.sql"), "utf8"))) as any[];
    expect(rows).toHaveLength(8);
    for (const r of rows) expect(r.status, `${r.ord} ${r.check_name} :: ${r.detail}`).toBe("PASS");
  });
});
