// Duplicate-pet guard on POST /api/pets (family-sharing audit gap B8) — proven through the REAL Hono router (api.request) on
// real Postgres as pawpi_app. Builds 30-32 send no idempotency key, so the guard must work with the body alone:
//   same owner + same normalised name inside the retry window -> the EXISTING pet (200, same shape), never a second row;
//   a same-named dog created long afterwards, a different name, or another owner's dog -> a new row as before.
// Plus the optional Idempotency-Key header (migration 0138) and concurrency (two simultaneous requests -> ONE row).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Zed" }; // seeded dog is NOT called Rex/Luna/Milo
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Pip" };
const PARTNER = { authUserId: 3, profileId: 3, username: "partner" }; // family grantee on OWNER's dog, owns none

let raw: Sql;
let api: any;

const as = (u: { authUserId: number }) => {
  authState.session = { user: { id: u.authUserId } };
};
function post(body: unknown, headers: Record<string, string> = {}) {
  return api.request("/pets", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const rowsNamed = async (ownerId: number, name: string) =>
  raw`select id, name, created_at from pets where owner_user_id = ${ownerId} and lower(btrim(name)) = lower(btrim(${name})) order by id`;
const ago = (minutes: number) => `now() - interval '${minutes} minutes'`;
const backdate = async (petId: number, minutes: number) =>
  raw.unsafe(`update pets set created_at = ${ago(minutes)} where id = ${petId}`);

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
  await seedUser(raw, PARTNER);
  // The seed helpers insert EXPLICIT ids (identity sequence stays at 1) — move past them so a route insert cannot collide.
  await raw.unsafe(`select setval(pg_get_serial_sequence('pets', 'id'), 10000)`);
  await raw.unsafe(`select setval(pg_get_serial_sequence('user_profiles', 'id'), 10000)`);
  await raw.unsafe(`select setval(pg_get_serial_sequence('pet_caregivers', 'id'), 10000)`);
});

describe("retry window — no client cooperation (builds 30-32)", () => {
  it("a retried identical POST returns the EXISTING pet: 200, same shape, no second row", async () => {
    as(OWNER);
    const first = await post({ name: "Rex", breed: "Labrador", species: "dog" });
    expect(first.status).toBe(201);
    const created = (await first.json()).pet;

    const retry = await post({ name: "Rex", breed: "Labrador", species: "dog" });
    expect(retry.status).toBe(200);
    expect(retry.headers.get("Idempotent-Replay")).toBe("true");
    const replayed = (await retry.json()).pet;

    expect(replayed.id).toBe(created.id);
    expect(Object.keys(replayed).sort()).toEqual(Object.keys(created).sort()); // identical response shape
    expect(replayed.handle).toBe(created.handle);
    expect(await rowsNamed(OWNER.profileId, "Rex")).toHaveLength(1);
  });

  it("a retry that carries an EXPLICIT handle is a replay, not a confusing 409 on its own first pet's handle", async () => {
    as(OWNER);
    const body = { name: "Luna", handle: "luna_the_dog", breed: "Beagle" };
    const first = await post(body);
    expect(first.status).toBe(201);
    const retry = await post(body);
    expect(retry.status).toBe(200);
    expect((await retry.json()).pet.id).toBe((await first.json()).pet.id);
    expect(await rowsNamed(OWNER.profileId, "Luna")).toHaveLength(1);
  });

  it("names compare case- and whitespace-insensitively", async () => {
    as(OWNER);
    const first = await post({ name: "Milo" });
    expect(first.status).toBe(201);
    for (const variant of ["milo", "  MILO ", "Milo\t", " mIlO"]) {
      const r = await post({ name: variant });
      expect(r.status, `variant ${JSON.stringify(variant)}`).toBe(200);
    }
    expect(await raw`select id from pets where owner_user_id = ${OWNER.profileId} and lower(btrim(name)) = 'milo'`).toHaveLength(1);
    // inner whitespace runs collapse too: "Bella Rose" == "Bella   Rose"
    await post({ name: "Bella Rose" });
    expect((await post({ name: "Bella   Rose" })).status).toBe(200);
  });

  it("names containing the letter 's' are matched exactly (regression: \\s in a JS template literal is just 's')", async () => {
    as(OWNER);
    expect((await post({ name: "Bessie" })).status).toBe(201);
    expect((await post({ name: "Besie" })).status).toBe(201); // one 's' fewer is a different name
    expect((await post({ name: "Bessie" })).status).toBe(200);
    expect((await post({ name: "Suss" })).status).toBe(201);
    expect((await post({ name: "Su s" })).status).toBe(201); // a real space is not the letter 's'
  });

  it("the replay returns the existing row UNCHANGED — a retry never edits it", async () => {
    as(OWNER);
    const first = (await (await post({ name: "Rex", breed: "Labrador", notes: "first" })).json()).pet;
    const retry = (await (await post({ name: "Rex", breed: "Poodle", notes: "second" })).json()).pet;
    expect(retry.id).toBe(first.id);
    expect(retry.breed).toBe("Labrador");
    expect(retry.notes).toBe("first");
  });

  it("a DIFFERENT name is a new dog (two rows)", async () => {
    as(OWNER);
    expect((await post({ name: "Rex" })).status).toBe(201);
    expect((await post({ name: "Rexy" })).status).toBe(201);
    expect(await raw`select id from pets where owner_user_id = ${OWNER.profileId} and name in ('Rex','Rexy')`).toHaveLength(2);
  });

  it("the SAME name after the window is allowed — two real dogs can share a name", async () => {
    as(OWNER);
    const first = (await (await post({ name: "Rex" })).json()).pet;
    await backdate(first.id, 10); // outside the 5-minute window
    const second = await post({ name: "Rex" });
    expect(second.status).toBe(201);
    expect((await second.json()).pet.id).not.toBe(first.id);
    expect(await rowsNamed(OWNER.profileId, "Rex")).toHaveLength(2);
  });

  it("the window boundary: a pet created 4 minutes ago is still a replay, one created 6 minutes ago is not", async () => {
    as(OWNER);
    const a = (await (await post({ name: "Nova" })).json()).pet;
    await backdate(a.id, 4);
    expect((await post({ name: "Nova" })).status).toBe(200);
    await backdate(a.id, 6);
    expect((await post({ name: "Nova" })).status).toBe(201);
  });

  it("the newest match wins when an owner already has two same-named dogs", async () => {
    as(OWNER);
    const old = (await (await post({ name: "Rex" })).json()).pet;
    await backdate(old.id, 30);
    const newer = (await (await post({ name: "Rex" })).json()).pet;
    expect((await (await post({ name: "Rex" })).json()).pet.id).toBe(newer.id);
  });

  it("two DIFFERENT owners with a same-named dog are unaffected (guard is per owner_user_id)", async () => {
    as(OWNER);
    const a = await post({ name: "Rex" });
    as(OTHER);
    const b = await post({ name: "Rex" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((await a.json()).pet.owner_user_id).toBe(OWNER.profileId);
    expect((await b.json()).pet.owner_user_id).toBe(OTHER.profileId);
    expect(await rowsNamed(OWNER.profileId, "Rex")).toHaveLength(1);
    expect(await rowsNamed(OTHER.profileId, "Rex")).toHaveLength(1);
  });

  it("an owner's seeded same-named dog is matched only while it is recent (not a stale one)", async () => {
    as(OWNER);
    await backdate(OWNER.petId, 60);
    expect((await post({ name: OWNER.petName })).status).toBe(201); // 2nd "Zed", the first is an hour old
  });
});

describe("double tap / race — ONE row", () => {
  it("N simultaneous identical requests create exactly one pet; the rest replay it", async () => {
    as(OWNER);
    const results = await Promise.all(Array.from({ length: 6 }, () => post({ name: "Rex", breed: "Labrador" })));
    const statuses = results.map((r: Response) => r.status).sort();
    expect(statuses.filter((s: number) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s: number) => s === 200)).toHaveLength(5);
    const ids = new Set((await Promise.all(results.map((r: Response) => r.json()))).map((b: any) => b.pet.id));
    expect(ids.size).toBe(1);
    expect(await rowsNamed(OWNER.profileId, "Rex")).toHaveLength(1);
  });

  it("simultaneous requests for DIFFERENT names are not serialised into one", async () => {
    as(OWNER);
    const results = await Promise.all(["Aster", "Basil", "Cleo"].map((name) => post({ name })));
    expect(results.map((r: Response) => r.status)).toEqual([201, 201, 201]);
  });
});

describe("Idempotency-Key header (optional, future clients) — needs migration 0138", () => {
  const KEY = "client-attempt-0001-abcdef";

  it("same owner + same key = the same pet, even long after the retry window", async () => {
    as(OWNER);
    const first = await post({ name: "Rex" }, { "Idempotency-Key": KEY });
    expect(first.status).toBe(201);
    const pet = (await first.json()).pet;
    await backdate(pet.id, 60); // far outside the name window: only the key can match now
    const again = await post({ name: "Rex" }, { "Idempotency-Key": KEY });
    expect(again.status).toBe(200);
    expect(again.headers.get("Idempotent-Replay")).toBe("true");
    expect((await again.json()).pet.id).toBe(pet.id);
    expect(await rowsNamed(OWNER.profileId, "Rex")).toHaveLength(1);
  });

  it("a NEW key means a new attempt: created even if the name matches a pet from a minute ago", async () => {
    as(OWNER);
    expect((await post({ name: "Rex" }, { "Idempotency-Key": "client-attempt-0001-abcdef" })).status).toBe(201);
    expect((await post({ name: "Rex" }, { "Idempotency-Key": "client-attempt-0002-abcdef" })).status).toBe(201);
    expect(await rowsNamed(OWNER.profileId, "Rex")).toHaveLength(2);
  });

  it("the same key from a DIFFERENT owner is a different request", async () => {
    as(OWNER);
    const a = await post({ name: "Rex" }, { "Idempotency-Key": KEY });
    as(OTHER);
    const b = await post({ name: "Rex" }, { "Idempotency-Key": KEY });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((await a.json()).pet.id).not.toBe((await b.json()).pet.id);
  });

  it("the same key reused for a DIFFERENT dog is refused (422), nothing created", async () => {
    as(OWNER);
    await post({ name: "Rex" }, { "Idempotency-Key": KEY });
    const before = Number((await raw`select count(*)::int n from pets`)[0].n);
    const r = await post({ name: "Fido" }, { "Idempotency-Key": KEY });
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe("idempotency_key_reused");
    expect(Number((await raw`select count(*)::int n from pets`)[0].n)).toBe(before);
  });

  it("two simultaneous requests with the same key create ONE pet", async () => {
    as(OWNER);
    const results = await Promise.all(Array.from({ length: 10 }, () => post({ name: "Rex" }, { "Idempotency-Key": KEY })));
    expect(results.map((r: Response) => r.status).filter((s: number) => s === 201)).toHaveLength(1);
    expect(await rowsNamed(OWNER.profileId, "Rex")).toHaveLength(1);
  });

  it("an invalid key is a friendly 400 and creates nothing", async () => {
    as(OWNER);
    for (const bad of ["short", "has spaces in it!!", "x".repeat(129), "semi;colon-key-1"]) {
      const r = await post({ name: "Rex" }, { "Idempotency-Key": bad });
      expect(r.status, bad).toBe(400);
      expect((await r.json()).code).toBe("idempotency_key_invalid");
    }
    expect(await rowsNamed(OWNER.profileId, "Rex")).toHaveLength(0);
  });

  it("a blank header is treated as absent (name window applies)", async () => {
    as(OWNER);
    expect((await post({ name: "Rex" }, { "Idempotency-Key": "  " })).status).toBe(201);
    expect((await post({ name: "Rex" })).status).toBe(200);
  });

  it("a key row is owner-scoped under RLS: another owner cannot read it", async () => {
    as(OWNER);
    await post({ name: "Rex" }, { "Idempotency-Key": KEY });
    expect(await raw`select owner_user_id from request_idempotency_keys`).toHaveLength(1);
    const url = new URL(inject("TEST_DATABASE_URL"));
    const postgres = (await import("postgres")).default;
    const app = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""), username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {} });
    try {
      const seen = async (uid: number | null) =>
        app.begin(async (tx) => {
          await tx`select set_config('app.current_user_id', ${uid === null ? "" : String(uid)}, true)`;
          return tx`select owner_user_id from request_idempotency_keys`;
        });
      expect(await seen(OWNER.profileId)).toHaveLength(1);
      expect(await seen(OTHER.profileId)).toHaveLength(0);
      expect(await seen(null)).toHaveLength(0);
    } finally {
      await app.end();
    }
  });

  it("DEGRADES CLEANLY before 0138 is applied: the key is ignored, the name-window guard still protects (no 500)", async () => {
    await raw`alter table request_idempotency_keys rename to request_idempotency_keys_hidden`;
    try {
      as(OWNER);
      const first = await post({ name: "Rex" }, { "Idempotency-Key": KEY });
      expect(first.status).toBe(201);
      const retry = await post({ name: "Rex" }, { "Idempotency-Key": KEY });
      // with no key table a "new key" can't be recognised, so the key path creates again — the point is: no 500, no crash.
      expect([200, 201]).toContain(retry.status);
      // and without the header the name-window guard is intact
      expect((await post({ name: "Milo" })).status).toBe(201);
      expect((await post({ name: "Milo" })).status).toBe(200);
    } finally {
      await raw`alter table request_idempotency_keys_hidden rename to request_idempotency_keys`;
    }
  });
});

describe("unchanged behaviour", () => {
  it("validation still wins: a missing name is a 400 and takes no lock-visible action", async () => {
    as(OWNER);
    expect((await post({ breed: "Labrador" })).status).toBe(400);
  });

  it("a family grantee on someone else's dog can still add their OWN dog with the same name (guard scopes by owner, not grants)", async () => {
    await seedPetCaregiver(raw, { id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId, granteeUserId: PARTNER.profileId, role: "family" });
    as(PARTNER);
    const r = await post({ name: OWNER.petName }); // same name as the shared dog
    expect(r.status).toBe(201);
    expect((await r.json()).pet.owner_user_id).toBe(PARTNER.profileId);
    expect(await rowsNamed(PARTNER.profileId, OWNER.petName)).toHaveLength(1);
    expect(await rowsNamed(OWNER.profileId, OWNER.petName)).toHaveLength(1); // the owner's dog is untouched
  });

  it("a brand-new account (no profile yet) can create its first dog; an immediate retry replays it", async () => {
    await raw`insert into auth_users (id, name, email) values (50, 'newbie', 'newbie@example.com')`;
    authState.session = { user: { id: 50, name: "Newbie" } };
    const first = await post({ name: "Rex" });
    expect(first.status).toBe(201);
    const retry = await post({ name: "Rex" });
    expect(retry.status).toBe(200);
    expect((await retry.json()).pet.id).toBe((await first.json()).pet.id);
  });

  it("unauthenticated is still 401", async () => {
    authState.session = null;
    expect((await post({ name: "Rex" })).status).toBe(401);
  });
});
