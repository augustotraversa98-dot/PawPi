// Inviting a vet by link (migration 0148), through the real Hono router + real Postgres as pawpi_app.
//   A. the owner creates, lists and revokes invites            B. what an invited vet can see, and who sees nothing
//   C. one answer for every unusable link                       D. accepting files a pending request and opens nothing
//   E. only the owner's approval opens the record               F. limits on attempts
//   G. the database rules on their own                          H. verify_0148.sql passes, can fail, re-applies

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  MIGRATIONS_DIR, makeTestSql, resetDb, seedCapability, seedOwnerWithPet, seedPetCaregiver, seedProviderWithStaff,
  seedStaff, seedUser,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Olivia Owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "vet" };
const VET2 = { authUserId: 4, profileId: 4, username: "vet2" };
const BOTH = { authUserId: 5, profileId: 5, username: "both" };
const FORMER = { authUserId: 6, profileId: 6, username: "former" };
const FAMILY = { authUserId: 7, profileId: 7, username: "family" };
const GROOMER = { authUserId: 8, profileId: 8, username: "groomer" };
const DRAFT = { authUserId: 9, profileId: 9, username: "draftvet" };
const PLAIN = { authUserId: 10, profileId: 10, username: "plain" };
const P1 = 1;
const P2 = 2;
const P_GROOM = 3;
const P_DRAFT = 4;
const PET = OWNER.petId;

type Person = { authUserId: number; profileId: number };

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

const create = (petId: unknown = PET, user: Person | null = OWNER) => {
  as(user);
  return req("/care-access/invites", "POST", { petId });
};
async function invite(petId = PET, user: Person = OWNER) {
  const res = await create(petId, user);
  expect(res.status).toBe(201);
  const body = await res.json();
  return { id: body.invite.id as number, token: body.link.split("#")[1] as string, body };
}
const list = (user: Person | null = OWNER, query = "") => { as(user); return req(`/care-access/invites${query}`); };
const revoke = (id: number | string, user: Person | null = OWNER) => {
  as(user);
  return req(`/care-access/invites/${id}`, "PATCH", { action: "revoke" });
};
const preview = (token: unknown, user: Person | null = VET, headers: Record<string, string> = {}) => {
  as(user);
  return req("/care-access/invites/preview", "POST", { token }, headers);
};
const accept = (token: unknown, user: Person | null = VET, providerId: unknown = P1) => {
  as(user);
  return req("/care-access/invites/accept", "POST", { token, providerId });
};
const record = (user: Person = VET, providerId = P1) => { as(user); return req(`/providers/${providerId}/pets/${PET}/record`); };
const sharedPets = (user: Person | null = VET, providerId: number | string = P1) => {
  as(user);
  return req(`/providers/${providerId}/shared-pets`);
};
const grants = () => raw`select * from care_access_grants order by id`;
const invites = () => raw`select * from care_access_invites order by id`;
const notices = () => raw`select * from notifications where type = 'care_access_requested' order by id`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const expireInvite = (id: number) =>
  raw`update care_access_invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = ${id}`;
const unused = async (id: number) =>
  expect((await raw`select used_at, used_by_user_id, used_by_provider_id from care_access_invites where id = ${id}`)[0])
    .toEqual({ used_at: null, used_by_user_id: null, used_by_provider_id: null });

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

const migration0148 = readFileSync(join(MIGRATIONS_DIR, "0148_vet_invites.sql"), "utf8");
const verify0148 = readFileSync(join(MIGRATIONS_DIR, "..", "verify_0148.sql"), "utf8");

beforeAll(async () => {
  raw = makeTestSql();
  // Another file may have re-applied an older migration, which narrows the notification types.
  await raw.unsafe(migration0148);
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
  await seedOwnerWithPet(raw, OTHER);
  for (const u of [VET, VET2, BOTH, FORMER, FAMILY, GROOMER, DRAFT, PLAIN]) await seedUser(raw, u);
  const business = async (providerId: number, staff: Person, status: "published" | "draft", capability: string) => {
    await seedProviderWithStaff(raw, {
      providerId, ownerUserProfileId: staff.profileId, staffUserProfileId: staff.profileId,
      staffRole: "owner", slug: `biz-${providerId}`, providerStatus: status,
    });
    await seedCapability(raw, { providerId, capability });
  };
  await business(P1, VET, "published", "vet");
  await business(P2, VET2, "published", "vet");
  await business(P_GROOM, GROOMER, "published", "groomer");
  await business(P_DRAFT, DRAFT, "draft", "vet");
  await seedStaff(raw, { providerId: P1, userProfileId: BOTH.profileId });
  await seedStaff(raw, { providerId: P2, userProfileId: BOTH.profileId });
  await seedStaff(raw, { providerId: P1, userProfileId: FORMER.profileId, status: "removed" });
  await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await raw`
    insert into pet_medical_profiles (pet_id, owner_user_id, microchip_id, medical_notes, insurance_provider)
    values (${PET}, ${OWNER.profileId}, 'SECRET-chip', 'SECRET-notes', 'SECRET-insurer')`;
  await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note) values (${PET}, ${OWNER.profileId}, '2026-01-02', 'SECRET-note')`;
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A. the owner's invites", () => {
  it("creates a link whose token is stored only as a hash and lasts 7 days", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["invite", "link"]);
    expect(Object.keys(body.invite).sort()).toEqual(["created_at", "expires_at", "id", "pet_id", "status"]);
    expect(body.link).toMatch(/^https?:\/\/[^/]+\/vet-invite#[A-Za-z0-9_-]{43}$/);
    const token = body.link.split("#")[1];

    const [row] = await invites();
    expect(row).toMatchObject({
      pet_id: PET, owner_user_id: OWNER.profileId, token_hash: sha(token), used_at: null, revoked_at: null,
    });
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect((await invite()).token).not.toBe(token);
    expect(await grants()).toHaveLength(0);
  });

  it("only the pet's owner creates one", async () => {
    expect((await create(PET, null)).status).toBe(401);
    expect((await create(PET, FAMILY)).status).toBe(404);
    expect((await create(PET, OTHER)).status).toBe(404);
    expect((await create(PET, VET)).status).toBe(404);
    expect((await create(OTHER.petId)).status).toBe(404);
    for (const bad of [null, "abc", 0, -1, 1.5, 99999999999]) expect((await create(bad)).status).toBe(400);
    expect((await req("/care-access/invites", "POST", {})).status).toBe(400);
    expect(await invites()).toHaveLength(0);
  });

  it("allows 5 open invites per owner, across pets; revoked, used and expired ones do not count", async () => {
    await raw`insert into pets (id, owner_user_id, name, handle) values (3, ${OWNER.profileId}, 'Nina', 'owner-nina')`;
    const made = [];
    for (const petId of [PET, PET, PET, 3, 3]) made.push(await invite(petId));
    const refused = await create();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "invite_limit", limit: 5 });
    expect((await create(OTHER.petId, OTHER)).status).toBe(201);

    await revoke(made[0].id);
    await invite();
    expect((await create()).status).toBe(409);
    await expireInvite(made[1].id);
    await invite();
    expect((await accept(made[2].token)).status).toBe(200);
    await invite();
    expect((await create()).status).toBe(409);
  });

  it("holds the limit under concurrent requests", async () => {
    as(OWNER);
    const answers = await Promise.all(Array.from({ length: 9 }, () => req("/care-access/invites", "POST", { petId: PET })));
    expect(answers.map((r) => r.status).sort()).toEqual([201, 201, 201, 201, 201, 409, 409, 409, 409]);
    expect(await invites()).toHaveLength(5);
  });

  it("lists the owner's own invites with their state, never a token or hash", async () => {
    const open = await invite();
    const used = await invite();
    const gone = await invite();
    const old = await invite();
    await accept(used.token);
    await revoke(gone.id);
    await expireInvite(old.id);

    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = Object.fromEntries(body.invites.map((i: any) => [i.id, i]));
    expect([open, used, gone, old].map((i) => byId[i.id].status)).toEqual(["open", "used", "revoked", "expired"]);
    expect(byId[used.id].used_by_provider_name).toBe("biz-1");
    expect(byId[open.id]).toMatchObject({ pet_id: PET, pet_name: "Rex" });
    const text = JSON.stringify(body);
    for (const i of [open, used, gone, old]) {
      expect(text).not.toContain(i.token);
      expect(text).not.toContain(sha(i.token));
    }
    expect(text).not.toContain("token");

    expect((await (await list(OWNER, "?petId=2")).json()).invites).toEqual([]);
    for (const user of [OTHER, FAMILY, VET]) expect((await (await list(user)).json()).invites).toEqual([]);
    expect((await list(null)).status).toBe(401);
    expect((await list(OWNER, "?petId=x")).status).toBe(400);
  });

  it("revoke: only the owner, repeatable, refused once used", async () => {
    const a = await invite();
    for (const user of [OTHER, FAMILY, VET]) expect((await revoke(a.id, user)).status).toBe(404);
    expect((await revoke(a.id, null)).status).toBe(401);
    expect((await revoke("abc")).status).toBe(404);
    as(OWNER);
    expect((await req(`/care-access/invites/${a.id}`, "PATCH", { action: "reopen" })).status).toBe(400);
    const first = await revoke(a.id);
    expect(first.status).toBe(200);
    const revokedAt = (await first.json()).invite.revoked_at;
    expect((await (await revoke(a.id)).json()).invite).toEqual({ id: a.id, status: "revoked", revoked_at: revokedAt });

    const b = await invite();
    await accept(b.token);
    const refused = await revoke(b.id);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "invite_used" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("B. opening an invite", () => {
  it("shows the pet's name, the owner's display name, the expiry and the caller's vet businesses, nothing else", async () => {
    const { token } = await invite();
    const res = await preview(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      invite: { petName: "Rex", ownerName: "Olivia Owner", expiresAt: expect.any(String) },
      businesses: [{ id: P1, name: "biz-1" }],
    });
    expect((await (await preview(token, BOTH)).json()).businesses.map((b: any) => b.id)).toEqual([P1, P2]);
    expect(await grants()).toHaveLength(0);
    await unused(1);
  });

  it("shows no name rather than the username when the owner has none", async () => {
    const { token } = await invite(OTHER.petId, OTHER);
    expect((await (await preview(token)).json()).invite.ownerName).toBeNull();
  });

  it("signed out: 401 and nothing about the link", async () => {
    const { token } = await invite();
    for (const value of [token, "x".repeat(43)]) {
      const res = await preview(value, null);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
    expect((await accept(token, null)).status).toBe(401);
    await unused(1);
  });

  it("no eligible vet business: the same 403 whatever the link is", async () => {
    const { token } = await invite();
    for (const user of [PLAIN, OWNER, FAMILY, FORMER, GROOMER, DRAFT]) {
      for (const value of [token, "x".repeat(43)]) {
        for (const res of [await preview(value, user), await accept(value, user, P1)]) {
          expect(res.status).toBe(403);
          expect(await res.json()).toMatchObject({ code: "no_business" });
        }
      }
    }
    await unused(1);
    expect(await grants()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("C. one answer for every unusable link", () => {
  it("unknown, malformed, expired, used, revoked, no longer the owner's pet, or blocked", async () => {
    const expired = await invite();
    const used = await invite();
    const revoked = await invite();
    await expireInvite(expired.id);
    expect((await accept(used.token)).status).toBe(200);
    await revoke(revoked.id);
    const blocked = await invite(OTHER.petId, OTHER);
    await raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${OTHER.profileId}, ${VET2.profileId})`;
    const moved = await invite();
    // The pet changes hands (only its owner may do that).
    await raw.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${String(OWNER.profileId)}, true)`;
      await tx`update pets set owner_user_id = ${OTHER.profileId} where id = ${PET}`;
    });

    const answers: string[] = [];
    const cases = ["x".repeat(43), "short", "", null, 42, expired.token, used.token, revoked.token, moved.token, blocked.token];
    for (const value of cases) {
      for (const res of [await preview(value, VET2), await accept(value, VET2, P2)]) {
        answers.push(`${res.status} ${await res.text()}`);
      }
    }
    as(VET2);
    const notJson = await req("/care-access/invites/preview", "POST", "{");
    answers.push(`${notJson.status} ${await notJson.text()}`);
    expect(new Set(answers)).toEqual(
      new Set(['404 {"error":"This invite link is not valid","code":"invite_not_valid"}']),
    );
    expect(await grants()).toHaveLength(1);
    await unused(blocked.id);
    await unused(moved.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("D. accepting", () => {
  it("files one pending medical_read request, uses the link and tells the owner", async () => {
    await raw`update user_profiles set preferred_locale = 'en' where id = ${OWNER.profileId}`;
    const { token, id } = await invite();
    const res = await accept(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "requested", petName: "Rex" });

    const rows = await grants();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pet_id: PET, owner_user_id: OWNER.profileId, provider_id: P1, scopes: ["medical_read"], sections: null,
      status: "pending", requested_by: "provider", granted_at: null, expires_at: null,
    });
    const [row] = await invites();
    expect(row).toMatchObject({ id, used_by_user_id: VET.profileId, used_by_provider_id: P1 });
    expect(row.used_at).not.toBeNull();

    const sent = await notices();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      recipient_user_id: OWNER.profileId, actor_user_id: VET.profileId, subject_ref: null,
      body: "biz-1 asks to see Rex's vet record. Nothing is shared unless you approve it in Data access.",
    });
    expect(JSON.stringify(sent[0])).not.toContain(token);

    as(OWNER);
    const pending = (await (await req("/care-access/grants?status=pending")).json()).grants;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ provider_name: "biz-1", pet_name: "Rex", requested_by: "provider" });
  });

  it("writes to the owner in es-AR by default", async () => {
    const { token } = await invite();
    await accept(token);
    expect((await notices())[0].body).toBe(
      "biz-1 pide ver la ficha veterinaria de Rex. No se comparte nada si no lo aprobás en Acceso a datos.",
    );
  });

  it("opens nothing: no record, no file, not listed as shared, no access logged", async () => {
    const { token } = await invite();
    await accept(token);
    const denied = await record();
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("SECRET");
    as(VET);
    expect((await req(`/media?key=${encodeURIComponent(`pets/${PET}/doc.pdf`)}&providerId=${P1}`)).status).toBe(403);
    expect((await (await sharedPets()).json()).pets).toEqual([]);
    for (const table of ["pet_medical_profiles", "vet_notes"]) {
      expect(await asApp(VET.profileId, (tx) => tx.unsafe(`select * from ${table}`))).toHaveLength(0);
    }
    expect(await raw`select * from care_access_audit`).toHaveLength(0);
  });

  it("works once", async () => {
    const { token } = await invite();
    expect((await accept(token)).status).toBe(200);
    for (const [user, providerId] of [[VET, P1], [VET2, P2], [BOTH, P2]] as const) {
      expect((await accept(token, user, providerId)).status).toBe(404);
    }
    expect(await grants()).toHaveLength(1);
    expect(await notices()).toHaveLength(1);
  });

  it("two businesses at the same moment: exactly one request", async () => {
    const { token } = await invite();
    as(BOTH);
    const answers = await Promise.all(
      [P1, P2, P1, P2].map((providerId) => req("/care-access/invites/accept", "POST", { token, providerId })),
    );
    expect(answers.map((r) => r.status).sort()).toEqual([200, 404, 404, 404]);
    expect(await grants()).toHaveLength(1);
    expect(await notices()).toHaveLength(1);
  });

  it("only for the caller's own eligible business; the link stays usable otherwise", async () => {
    const { token, id } = await invite();
    for (const providerId of [P2, P_GROOM, P_DRAFT, 999, "abc", null]) {
      const res = await accept(token, VET, providerId);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: "not_allowed" });
    }
    expect((await req("/care-access/invites/accept", "POST", { token })).status).toBe(403);
    await unused(id);
    expect(await grants()).toHaveLength(0);
  });

  it("an existing request or access is left as it is and the link stays unused", async () => {
    for (const status of ["pending", "active"]) {
      await raw`delete from care_access_grants`;
      await raw`
        insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
        values (${PET}, ${OWNER.profileId}, ${P1}, ${["appointments"]}, ${status}, 'provider')`;
      const before = [...(await grants())];
      const { token, id } = await invite();
      const res = await accept(token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "already_open", petName: "Rex" });
      expect([...(await grants())]).toEqual(before);
      await unused(id);
      expect(await notices()).toHaveLength(0);
      expect((await accept(token, VET2, P2)).status).toBe(200);
      await raw`delete from notifications`;
    }
  });

  it("a grant past its date does not stand in the way", async () => {
    await raw`
      insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by, expires_at)
      values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read"]}, 'active', 'owner', now() - interval '1 minute')`;
    const { token } = await invite();
    expect((await (await accept(token)).json()).status).toBe("requested");
    expect((await grants()).map((g) => g.status)).toEqual(["expired", "pending"]);
  });

  it("never writes the token to a log line or a stored row", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
    }
    const { token } = await invite();
    await preview(token);
    await accept(token);
    for (let i = 0; i < 12; i++) await accept(token);
    expect(lines.join("\n")).not.toContain(token);
    const stored = await Promise.all(
      ["care_access_invites", "care_access_grants", "notifications", "rate_limit_hits"].map((t) =>
        raw.unsafe(`select * from ${t}`),
      ),
    );
    expect(JSON.stringify(stored)).not.toContain(token);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("E. the owner decides", () => {
  async function requested() {
    const { token } = await invite();
    expect((await accept(token)).status).toBe(200);
    return (await grants())[0].id as number;
  }

  it("approving with sections opens only those, and the pet is listed without any booking", async () => {
    const grantId = await requested();
    as(OWNER);
    const res = await req("/care-access/grants", "POST", {
      petId: PET, providerId: P1, sections: ["vet_notes"], expiry: "7d",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ approvedRequest: true, grant: { id: grantId, sections: ["vet_notes"] } });

    const body = await (await record()).json();
    expect(body.sharedSections).toEqual(["vet_notes"]);
    expect(body.notes).toHaveLength(1);
    expect(body.medical_profile).toBeNull();
    const listed = (await (await sharedPets()).json()).pets;
    expect(listed).toEqual([{ pet_id: PET, pet_name: "Rex", expires_at: expect.any(String) }]);
    expect((await (await sharedPets(VET2, P2)).json()).pets).toEqual([]);

    await raw`update care_access_grants set expires_at = now() - interval '1 second' where id = ${grantId}`;
    expect((await record()).status).toBe(403);
    expect((await (await sharedPets()).json()).pets).toEqual([]);
  });

  it("approving the request as asked gives medical_read; revoking removes it", async () => {
    const grantId = await requested();
    as(OWNER);
    expect((await req(`/care-access/grants/${grantId}`, "PATCH", { action: "approve" })).status).toBe(200);
    expect((await record()).status).toBe(200);
    expect((await (await sharedPets()).json()).pets).toHaveLength(1);
    as(OWNER);
    expect((await req(`/care-access/grants/${grantId}`, "PATCH", { action: "revoke" })).status).toBe(200);
    expect((await record()).status).toBe(403);
    expect((await (await sharedPets()).json()).pets).toEqual([]);
  });

  it("denying keeps everything closed", async () => {
    const grantId = await requested();
    as(OWNER);
    expect((await req(`/care-access/grants/${grantId}`, "PATCH", { action: "deny" })).status).toBe(200);
    expect((await record()).status).toBe(403);
    expect((await (await sharedPets()).json()).pets).toEqual([]);
  });

  it("shared pets: staff of that business only, and only grants that open the record", async () => {
    await raw`
      insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
      values (${PET}, ${OWNER.profileId}, ${P1}, ${["appointments"]}, 'active', 'owner')`;
    expect((await (await sharedPets()).json()).pets).toEqual([]);
    for (const user of [VET2, PLAIN, OWNER, FORMER]) expect((await sharedPets(user)).status).toBe(403);
    expect((await sharedPets(null)).status).toBe(401);
    expect((await sharedPets(VET, "abc")).status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("F. limits on attempts", () => {
  const bad = "x".repeat(43);

  it("opening: per account, and per sender when signed out", async () => {
    for (let i = 0; i < 30; i++) expect((await preview(bad)).status).toBe(404);
    const limited = await preview(bad);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await preview(bad, VET2)).status).toBe(404);

    const from = (ip: string) => preview(bad, null, { "x-real-ip": ip });
    for (let i = 0; i < 30; i++) expect((await from("203.0.113.7")).status).toBe(401);
    expect((await from("203.0.113.7")).status).toBe(429);
    expect((await from("203.0.113.8")).status).toBe(401);
  });

  it("accepting: 10 per window", async () => {
    for (let i = 0; i < 10; i++) expect((await accept(bad)).status).toBe(404);
    expect((await accept(bad)).status).toBe(429);
  });

  it("creating: 20 per hour", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await create();
      expect(res.status).toBe(201);
      await revoke((await res.json()).invite.id);
    }
    expect((await create()).status).toBe(429);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("G. the database on its own (as pawpi_app)", () => {
  const hash = "a".repeat(64);
  const insert = (userId: number, petId: number, ownerId: number, extra: object = {}) =>
    asApp(userId, (tx) => tx`
      insert into care_access_invites ${tx({
        pet_id: petId, owner_user_id: ownerId, token_hash: hash,
        expires_at: new Date(Date.now() + 3600_000), ...extra,
      } as any)}`);

  beforeEach(async () => {
    await insert(OWNER.profileId, PET, OWNER.profileId);
  });

  it("nobody but the owner reads, creates or changes an invite", async () => {
    for (const userId of [null, OTHER.profileId, VET.profileId, FAMILY.profileId]) {
      expect(await asApp(userId, (tx) => tx`select * from care_access_invites`)).toHaveLength(0);
      const changed = await asApp(userId, (tx) => tx`update care_access_invites set revoked_at = now() returning id`);
      expect(changed).toHaveLength(0);
    }
    await expect(insert(OTHER.profileId, PET, OTHER.profileId, { token_hash: "b".repeat(64) })).rejects.toThrow(/row-level security/);
    await expect(insert(VET.profileId, PET, OWNER.profileId, { token_hash: "b".repeat(64) })).rejects.toThrow(/row-level security/);
    await expect(insert(OWNER.profileId, OTHER.petId, OWNER.profileId, { token_hash: "b".repeat(64) })).rejects.toThrow(/row-level security/);
  });

  it("an invite cannot be created used, last over 7 days, hold a readable token, be reopened or deleted", async () => {
    const b = { token_hash: "b".repeat(64) };
    await expect(insert(OWNER.profileId, PET, OWNER.profileId, { ...b, used_at: new Date() })).rejects.toThrow(/row-level security/);
    await expect(
      insert(OWNER.profileId, PET, OWNER.profileId, { ...b, expires_at: new Date(Date.now() + 8 * 86400_000) }),
    ).rejects.toThrow(/care_access_invites_expiry_check/);
    await expect(insert(OWNER.profileId, PET, OWNER.profileId, { token_hash: "plain-token" })).rejects.toThrow(
      /care_access_invites_hash_check/,
    );
    await expect(
      asApp(OWNER.profileId, (tx) => tx`update care_access_invites set used_at = null`),
    ).rejects.toThrow(/row-level security/);
    await asApp(OWNER.profileId, (tx) => tx`delete from care_access_invites`);
    expect(await invites()).toHaveLength(1);
  });

  it("preview and claim answer only an eligible vet, and claim works once", async () => {
    const seen = (userId: number | null) => asApp(userId, (tx) => tx`select * from app_preview_vet_invite(${hash})`);
    const claim = (userId: number | null, providerId: number) =>
      asApp(userId, (tx) => tx`select * from app_claim_vet_invite(${hash}, ${providerId})`);
    for (const userId of [null, PLAIN.profileId, FORMER.profileId, GROOMER.profileId, DRAFT.profileId, OWNER.profileId]) {
      expect(await seen(userId)).toHaveLength(0);
    }
    for (const [userId, providerId] of [[null, P1], [PLAIN.profileId, P1], [VET.profileId, P2], [FORMER.profileId, P1], [GROOMER.profileId, P_GROOM], [DRAFT.profileId, P_DRAFT]] as const) {
      expect(await claim(userId, providerId)).toHaveLength(0);
    }
    await unused(1);
    expect(Object.keys((await seen(VET.profileId))[0])).toEqual(["pet_name", "owner_name", "expires_at"]);
    expect([...(await claim(VET.profileId, P1))]).toEqual([{ pet_id: PET, owner_user_id: OWNER.profileId, pet_name: "Rex" }]);
    expect(await claim(VET2.profileId, P2)).toHaveLength(0);
    expect(await seen(VET.profileId)).toHaveLength(0);
    expect(await grants()).toHaveLength(0);
  });

  it("goes with the pet", async () => {
    await raw`delete from pets where id = ${PET}`;
    expect(await invites()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("H. verify_0148.sql", () => {
  type Row = { ord: number; check_name: string; detail: string; status: string };
  const failing = async (sql: Sql) => (await sql.unsafe<Row[]>(verify0148)).filter((r) => r.status !== "PASS").map((r) => r.ord);

  it("every row reads PASS, also after applying 0148 twice more", async () => {
    await raw.unsafe(migration0148);
    await raw.unsafe(migration0148);
    expect(await raw.unsafe(verify0148)).toHaveLength(15);
    expect(await failing(raw)).toEqual([]);
  });

  const brokenBy = async (statements: string[]) => {
    const ROLLBACK = new Error("rollback");
    let rows: number[] = [];
    await raw
      .begin(async (tx) => {
        for (const statement of statements) await tx.unsafe(statement);
        rows = await failing(tx as unknown as Sql);
        throw ROLLBACK;
      })
      .catch((e) => { if (e !== ROLLBACK) throw e; });
    return rows;
  };

  const redefine = (name: string, from: string, to: string) => `
    do $do$
    declare d text;
    begin
      select pg_get_functiondef(oid) into d from pg_proc where proname = '${name}' and pronamespace = 'public'::regnamespace;
      if position($f$${from}$f$ in d) = 0 then raise exception 'text not found'; end if;
      execute replace(d, $f$${from}$f$, $t$${to}$t$);
    end $do$`;

  it.each<[string, number[], string[]]>([
    ["an extra column", [1], ["alter table care_access_invites add column token text"]],
    ["row security not forced", [2], ["alter table care_access_invites no force row level security"]],
    ["an extra policy", [3], ["create policy extra on care_access_invites for delete using (true)"]],
    ["a wider read", [4], ["alter policy care_access_invites_owner_select on care_access_invites using (true)"]],
    ["a wider insert", [5], ["alter policy care_access_invites_owner_insert on care_access_invites with check (true)"]],
    ["a wider update", [6], ["alter policy care_access_invites_owner_update on care_access_invites with check (owner_user_id = current_app_user_id())"]],
    ["no unique hash", [7], ["drop index idx_care_access_invites_hash"]],
    ["no expiry limit", [8], ["alter table care_access_invites drop constraint care_access_invites_expiry_check"]],
    ["a public grant", [9], ["grant select on care_access_invites to public"]],
    ["an executable by everyone", [10], ["grant execute on function app_can_accept_vet_invite(integer) to public"]],
    ["any capability", [10], [redefine("app_can_accept_vet_invite", "and pc.capability = 'vet'", "")]],
    ["expired previews", [11], [redefine("app_preview_vet_invite", "and i.expires_at > now()", "")]],
    ["a reusable claim", [12], [redefine("app_claim_vet_invite", "and i.used_at is null", "")]],
    ["an unpinned search path", [12], ["alter function app_claim_vet_invite(text, integer) reset search_path"]],
    ["another reader", [14], ["create function extra_reader() returns bigint language sql as 'select count(*) from care_access_invites'"]],
    ["a missing type", [15], [
      "alter table notifications drop constraint notifications_type_check",
      "alter table notifications add constraint notifications_type_check check (type = any (array['paw']::text[]))",
    ]],
  ])("fails on %s", async (_name, expected, statements) => {
    expect(await brokenBy(statements)).toEqual(expected);
  });
});
