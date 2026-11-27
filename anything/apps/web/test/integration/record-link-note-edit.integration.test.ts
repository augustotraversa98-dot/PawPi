// Correcting notes added through a record link (migration 0157), through the real Hono router + real Postgres as
// pawpi_app: whoever wrote a note finds it again, even when the link does not share the notes, and only the right
// person changes it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedOwnerWithPet, seedUser } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Olivia Owner", petId: 1, petName: "Rex" };
const VET = { authUserId: 3, profileId: 3, username: "vet", fullName: "Dr. Paula Gómez" };
const OTHER = { authUserId: 4, profileId: 4, username: "other", fullName: "Dr. Other" };
const PET = OWNER.petId;

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

async function link(over: Record<string, unknown> = {}) {
  as(OWNER);
  const res = await req("/care-access/links", "POST", {
    petId: PET, sections: ["vaccines"], expiry: "7d", allowNotes: true, ...over,
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  return { id: body.link.id as number, token: body.url.split("#")[1] as string };
}
const view = async (token: string, user: Person | null = null) => {
  as(user);
  const res = await req("/public/record-link/open", "POST", { token });
  expect(res.status).toBe(200);
  return (await res.json()).record;
};
const add = async (token: string, note: string, user: Person | null = null) => {
  as(user);
  expect((await req("/public/record-link/notes", "POST", { token, note })).status).toBe(201);
  return (await raw`select id from vet_notes where note = ${note}`)[0].id as number;
};
const edit = async (token: string, noteId: unknown, note: unknown, user: Person | null = null) => {
  as(user);
  const res = await req("/public/record-link/notes", "PATCH", { token, noteId, note });
  return { status: res.status, body: await res.json() };
};
const row = async (id: number) => (await raw`select * from vet_notes where id = ${id}`)[0];

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

const migration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");

beforeAll(async () => {
  raw = makeTestSql();
  // Other files re-apply older migrations on the shared database, which restores older functions.
  await raw.unsafe(migration("0157_record_link_note_edit.sql"));
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  app = postgres(url.toString(), { max: 1, onnotice: () => {} });
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); await app.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; vi.restoreAllMocks(); });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedUser(raw, VET);
  await seedUser(raw, OTHER);
  await raw`select setval(pg_get_serial_sequence('auth_users', 'id'), 100), setval(pg_get_serial_sequence('user_profiles', 'id'), 100)`;
  await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note, created_by_user_id, created_by_role)
            values (${PET}, ${OWNER.profileId}, '2026-01-02', 'OWNER-NOTE', ${OWNER.profileId}, 'owner')`;
});

describe("reading back", () => {
  it("a link that only allows notes shows the notes added through it, and nothing of the other notes", async () => {
    const { token } = await link();
    const id = await add(token, "Looks healthy");
    const record = await view(token);
    expect(record.vet_notes).toBeNull();
    expect(record.link_notes).toEqual([
      expect.objectContaining({ id, note: "Looks healthy", editable: true, needs_sign_in: false, edited_at: null }),
    ]);
    expect(JSON.stringify(record)).not.toContain("OWNER-NOTE");
  });

  it("newest first, and each link only its own", async () => {
    const a = await link();
    const b = await link();
    await add(a.token, "first");
    await add(a.token, "second");
    await add(b.token, "from the other link");
    expect((await view(a.token)).link_notes.map((n: any) => n.note)).toEqual(["second", "first"]);
    expect((await view(b.token)).link_notes.map((n: any) => n.note)).toEqual(["from the other link"]);
  });

  it("with the notes shared, marks which entry belongs to this link", async () => {
    const { token } = await link({ sections: ["vet_notes"] });
    const id = await add(token, "mine");
    const record = await view(token);
    expect(record.vet_notes.find((n: any) => n.note === "mine").link_note_id).toBe(id);
    expect(record.vet_notes.find((n: any) => n.note === "OWNER-NOTE").link_note_id).toBeNull();
  });

  it("a link that neither shares nor allows notes lists none", async () => {
    const { token } = await link({ allowNotes: false });
    expect((await view(token)).link_notes).toBeNull();
  });
});

describe("correcting", () => {
  it("changes the text, marks it edited and shows the owner the new text", async () => {
    const { token } = await link();
    const id = await add(token, "Draft");
    const res = await edit(token, id, "  Corrected  ");
    expect(res.status).toBe(200);
    expect(res.body.note.edited_at).toBeTruthy();
    expect(await row(id)).toMatchObject({ note: "Corrected", via_record_link: true });
    expect((await row(id)).vet_edited_at).not.toBeNull();
    expect((await view(token)).link_notes[0]).toMatchObject({ note: "Corrected" });
    as(OWNER);
    const owner = (await (await req(`/vet-record/notes?petId=${PET}`)).json()).notes;
    expect(owner.find((n: any) => n.id === id)).toMatchObject({ note: "Corrected" });
    expect(owner.find((n: any) => n.id === id).vet_edited_at).toBeTruthy();
  });

  it("saving the same text does not mark it edited", async () => {
    const { token } = await link();
    const id = await add(token, "Same");
    expect((await edit(token, id, "Same")).status).toBe(200);
    expect((await row(id)).vet_edited_at).toBeNull();
  });

  it("never reaches the owner's notes or another link's", async () => {
    const a = await link({ sections: ["vet_notes"] });
    const b = await link();
    const foreign = await add(b.token, "B note");
    const ownerNote = (await raw`select id from vet_notes where note = 'OWNER-NOTE'`)[0].id;
    for (const id of [foreign, ownerNote, 999999, "1", -1]) {
      const res = await edit(a.token, id, "Overwritten");
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("note_not_found");
    }
    expect((await row(ownerNote)).note).toBe("OWNER-NOTE");
    expect((await row(foreign)).note).toBe("B note");
  });

  it("only the signed-in author changes a note written signed in", async () => {
    const { token } = await link();
    const id = await add(token, "Signed", VET);
    expect((await view(token)).link_notes[0]).toMatchObject({ editable: false, needs_sign_in: true });
    expect((await view(token, OTHER)).link_notes[0]).toMatchObject({ editable: false, needs_sign_in: false });
    expect((await view(token, VET)).link_notes[0]).toMatchObject({ editable: true, needs_sign_in: false });
    for (const who of [null, OTHER, OWNER]) {
      const res = await edit(token, id, "Not mine", who);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("not_author");
    }
    expect((await edit(token, id, "Mine again", VET)).status).toBe(200);
    expect(await row(id)).toMatchObject({ note: "Mine again", external_author_name: "Dr. Paula Gómez" });
  });

  it("once the author's account is gone, nobody changes their note", async () => {
    const { token } = await link();
    const id = await add(token, "Signed", VET);
    await raw`delete from auth_users where id = ${VET.authUserId}`;
    expect(await row(id)).toMatchObject({ created_by_user_id: null, external_author_name: "Former member" });
    expect((await view(token)).link_notes[0]).toMatchObject({ editable: false, needs_sign_in: false });
    expect((await edit(token, id, "Taken over")).body.code).toBe("not_author");
  });

  it("refuses an empty or too long note", async () => {
    const { token } = await link();
    const id = await add(token, "x");
    for (const note of ["", "   ", "a".repeat(2001), 5, null]) {
      expect((await edit(token, id, note)).body.code).toBe("bad_note");
    }
    expect((await row(id)).note).toBe("x");
  });

  it("stops with the link: notes switched off, removed or expired", async () => {
    const { id: linkId, token } = await link({ sections: ["vet_notes"] });
    const id = await add(token, "x");
    await raw`update care_record_links set allow_notes = false where id = ${linkId}`;
    expect((await edit(token, id, "y")).body.code).toBe("notes_not_allowed");
    expect((await view(token)).link_notes[0]).toMatchObject({ editable: false });
    await raw`update care_record_links set allow_notes = true, revoked_at = now() where id = ${linkId}`;
    const gone = await edit(token, id, "y");
    expect([gone.status, gone.body.code]).toEqual([403, "link_not_valid"]);
    expect((await row(id)).note).toBe("x");
  });
});

describe("the database on its own", () => {
  it("the application role cannot write vet_edited_at", async () => {
    await expect(
      asApp(OWNER.profileId, (tx) => tx`update vet_notes set vet_edited_at = now() where note = 'OWNER-NOTE'`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asApp(OWNER.profileId, (tx) => tx`insert into vet_notes (pet_id, owner_user_id, note_date, note, vet_edited_at)
        values (${PET}, ${OWNER.profileId}, '2026-01-01', 'x', now())`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("verify_0157.sql reads PASS on every row, also after re-applying", async () => {
    await raw.unsafe(migration("0157_record_link_note_edit.sql"));
    const rows = (await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0157.sql"), "utf8"))) as any[];
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r.status, `${r.ord} ${r.check_name} :: ${r.detail}`).toBe("PASS");
  });

  it("before 0157 is applied: editing says it is not available and the record still opens", async () => {
    const { token } = await link();
    const id = await add(token, "x");
    try {
      await raw.unsafe("drop function app_record_link_update_note(text, integer, text)");
      const res = await edit(token, id, "y");
      expect([res.status, res.body.code]).toEqual([409, "note_edit_unavailable"]);
      await view(token);
    } finally {
      await raw.unsafe(migration("0157_record_link_note_edit.sql"));
    }
  });
});
