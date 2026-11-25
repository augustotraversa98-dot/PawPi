// Pet invite codes (migration 0143, docs/pr6-invite-code-design.md): single use, expiring, revocable, one pet, never
// stored or logged in clear text. Real Hono router on real Postgres as pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";
import { MIGRATIONS_DIR } from "./migrate";
import { hashInviteCode, normalizeInviteCode } from "../../src/app/api/utils/inviteCodes";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const PARTNER = { authUserId: 2, profileId: 2, username: "partner" };
const OTHER = { authUserId: 3, profileId: 3, username: "other", petId: 2, petName: "Duke" };
const THIRD = { authUserId: 4, profileId: 4, username: "third" };
const PET = OWNER.petId;

let raw: Sql;
let app: Sql;
let appOptions: any;
let api: any;
let logged: string[];

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
const create = async (role: "family" | "caregiver" = "family", petId = PET) => {
  as(OWNER);
  const res = await req("/pet-invite-codes", "POST", { petId, role });
  return { status: res.status, ...(await res.json()) };
};
const redeem = async (u: { authUserId: number }, code: string) => {
  as(u);
  const res = await req("/pet-invite-codes/redeem", "POST", { code });
  return { status: res.status, ...(await res.json()) };
};
const grants = () => raw`select pet_id, grantee_user_id, role, status from pet_caregivers order by id`;

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  appOptions = { host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""), username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {} };
  app = postgres(appOptions);
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => {
  vi.restoreAllMocks();
  await resetDb(raw);
  authState.session = null;
});
beforeEach(async () => {
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(" ")); });
  }
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  for (const u of [PARTNER, THIRD]) await seedUser(raw, u);
  await raw.unsafe(`select setval(pg_get_serial_sequence('pet_caregivers', 'id'), 10000)`);
});

describe("creating", () => {
  it("returns the code once; only its hash is stored; it expires in three days", async () => {
    const made = await create("family");
    expect(made.status).toBe(201);
    expect(made.code).toMatch(/^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
    const [row] = await raw`select *, extract(epoch from (expires_at - created_at))::int ttl from pet_invite_codes`;
    expect(row.code_hash).toBe(hashInviteCode(normalizeInviteCode(made.code)!));
    expect(JSON.stringify(row)).not.toContain(made.code);
    expect(JSON.stringify(row)).not.toContain(normalizeInviteCode(made.code)!);
    expect(row.ttl).toBe(72 * 3600);
    as(OWNER);
    const list = await (await req(`/pet-invite-codes?petId=${PET}`)).json();
    expect(list.invites).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(row.code_hash);
    expect(JSON.stringify(list)).not.toContain(normalizeInviteCode(made.code)!);
  });

  it("only the pet's owner: not a family member, not a stranger, not for another pet", async () => {
    await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: PARTNER.profileId, role: "family" });
    for (const u of [PARTNER, OTHER]) {
      as(u);
      expect((await req("/pet-invite-codes", "POST", { petId: PET, role: "family" })).status).toBe(403);
      expect((await req(`/pet-invite-codes?petId=${PET}`)).status).toBe(403);
    }
    expect((await create("family", OTHER.petId)).status).toBe(403);
  });

  it("at most five live codes per pet", async () => {
    for (let i = 0; i < 5; i += 1) expect((await create()).status).toBe(201);
    const sixth = await create();
    expect([sixth.status, sixth.code]).toEqual([409, "too_many_codes"]);
  });
});

describe("redeeming", () => {
  it("gives the person ACTIVE access to that one pet with that role, burns the code, audits and tells the owner", async () => {
    const { code } = await create("caregiver");
    const res = await redeem(PARTNER, ` ${code.toLowerCase()} `);
    expect(res).toMatchObject({ status: 200, ok: true, pet_id: PET, pet_name: "Rex", role: "caregiver" });
    expect(await grants()).toEqual([{ pet_id: PET, grantee_user_id: PARTNER.profileId, role: "caregiver", status: "active" }]);
    const [row] = await raw`select used_at, used_by_user_id, grant_id from pet_invite_codes`;
    expect(row.used_at).toBeTruthy();
    expect(row.used_by_user_id).toBe(PARTNER.profileId);
    expect((await raw`select action from pet_caregiver_audit order by id`).map((a) => a.action)).toEqual(["grant", "accept"]);
    expect((await raw`select count(*)::int n from notifications where type = 'pet_share_accepted'`)[0].n).toBe(1);
    as(PARTNER);
    const pets = await (await req("/pets?include_shared=1")).json();
    expect(pets.pets.map((p: any) => p.id)).toEqual([PET]); // not Duke
  });

  it("works for a brand-new account with no profile (Apple Hide My Email)", async () => {
    const { code } = await create();
    await raw`insert into auth_users (id, name, email) values (50, null, 'x@privaterelay.appleid.com')`;
    const res = await redeem({ authUserId: 50 }, code);
    expect(res.status).toBe(200);
    expect(await grants()).toHaveLength(1);
  });

  it("is single use", async () => {
    const { code } = await create();
    expect((await redeem(PARTNER, code)).status).toBe(200);
    expect(await redeem(THIRD, code)).toMatchObject({ status: 409, code: "invite_used" });
    expect(await redeem(PARTNER, code)).toMatchObject({ status: 409, code: "invite_already_member" });
    expect(await grants()).toHaveLength(1);
  });

  it("two people at the same moment: exactly one gets in", async () => {
    const { code } = await create();
    const hash = hashInviteCode(normalizeInviteCode(code)!);
    const second = postgres(appOptions);
    const run = (sql: Sql, userId: number) =>
      sql.begin(async (tx) => {
        await tx`select set_config('app.current_user_id', ${String(userId)}, true)`;
        return (await tx`select app_redeem_pet_invite(${hash}) as o`)[0].o as any;
      });
    const results = await Promise.all([run(app, PARTNER.profileId), run(second as any, THIRD.profileId)]);
    await second.end();
    expect(results.map((r) => r.result).sort()).toEqual(["ok", "used"]);
    expect(await grants()).toHaveLength(1);
  });

  it.each([
    ["expired", async () => raw`update pet_invite_codes set created_at = now() - interval '4 days', expires_at = now() - interval '1 day'`, 410],
    ["revoked", async () => raw`update pet_invite_codes set revoked_at = now()`, 410],
  ])("a code that is %s does nothing", async (result, spoil, status) => {
    const { code } = await create();
    await spoil();
    expect(await redeem(PARTNER, code)).toMatchObject({ status, code: `invite_${result}` });
    expect(await grants()).toEqual([]);
  });

  it("the owner revoking through the API kills the code", async () => {
    const { code, invite } = await create();
    as(OTHER);
    expect((await req(`/pet-invite-codes/${invite.id}`, "DELETE")).status).toBe(404);
    as(OWNER);
    expect((await req(`/pet-invite-codes/${invite.id}`, "DELETE")).status).toBe(200);
    expect(await redeem(PARTNER, code)).toMatchObject({ status: 410, code: "invite_revoked" });
  });

  it("refuses the owner, a blocked pair, a wrong or garbled code", async () => {
    const { code } = await create();
    expect(await redeem(OWNER, code)).toMatchObject({ status: 409, code: "invite_own_pet" });
    await raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${OWNER.profileId}, ${THIRD.profileId})`;
    expect(await redeem(THIRD, code)).toMatchObject({ status: 404, code: "invite_invalid" });
    expect(await redeem(PARTNER, "2222-2222-2222")).toMatchObject({ status: 404, code: "invite_invalid" });
    expect(await redeem(PARTNER, "hello")).toMatchObject({ status: 404, code: "invite_invalid" });
    expect(await grants()).toEqual([]);
  });

  it("a pending invite becomes active; an active member does not burn the code", async () => {
    await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: PARTNER.profileId, role: "caregiver", status: "pending" });
    const first = await create("family");
    expect((await redeem(PARTNER, first.code)).status).toBe(200);
    expect(await grants()).toEqual([{ pet_id: PET, grantee_user_id: PARTNER.profileId, role: "family", status: "active" }]);
    const second = await create("caregiver");
    expect(await redeem(PARTNER, second.code)).toMatchObject({ code: "invite_already_member" });
    expect((await grants())[0].role).toBe("family");
    expect((await redeem(THIRD, second.code)).status).toBe(200);
  });

  it("is rate limited", async () => {
    let last = 0;
    for (let i = 0; i < 12; i += 1) last = (await redeem(PARTNER, "2222-2222-2222")).status;
    expect(last).toBe(429);
  });
});

describe("privacy", () => {
  it("the code is never logged, whatever happens", async () => {
    const { code } = await create();
    await redeem(OWNER, code);
    await redeem(PARTNER, code);
    await redeem(THIRD, code);
    for (let i = 0; i < 12; i += 1) await redeem(THIRD, code);
    const bare = normalizeInviteCode(code)!;
    const all = logged.join("\n").toUpperCase();
    expect(all).not.toContain(code);
    expect(all).not.toContain(bare);
  });

  it("nobody but the owner can see the table, and there is no delete", async () => {
    await create();
    const asApp = (userId: number, fn: (tx: Sql) => Promise<unknown>) =>
      app.begin(async (tx) => {
        await tx`select set_config('app.current_user_id', ${String(userId)}, true)`;
        return fn(tx);
      });
    await asApp(PARTNER.profileId, async (tx) => {
      expect(await tx`select id from pet_invite_codes`).toHaveLength(0);
      expect(await tx`update pet_invite_codes set revoked_at = now() returning id`).toHaveLength(0);
    });
    await asApp(OWNER.profileId, async (tx) => {
      expect(await tx`delete from pet_invite_codes returning id`).toHaveLength(0);
    });
  });
});

describe("migration", () => {
  const file = () => readFileSync(join(MIGRATIONS_DIR, "0143_pet_invite_codes.sql"), "utf8");

  it("is idempotent and verify_0143.sql reads PASS on every row", async () => {
    await raw.unsafe(file());
    const rows = await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "verify_0143.sql"), "utf8"));
    expect(rows.length).toBe(9);
    expect(rows.filter((r: any) => r.status !== "PASS")).toEqual([]);
  });

  it("without it the API answers a friendly 503 and nothing else breaks", async () => {
    await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "rollback_0143.sql"), "utf8"));
    try {
      as(OWNER);
      for (const res of [
        await req(`/pet-invite-codes?petId=${PET}`),
        await req("/pet-invite-codes", "POST", { petId: PET, role: "family" }),
        await req("/pet-invite-codes/redeem", "POST", { code: "2222-2222-2222" }),
      ]) {
        expect([res.status, (await res.json()).code]).toEqual([503, "invite_codes_unavailable"]);
      }
      expect((await req("/pets?include_shared=1")).status).toBe(200);
    } finally {
      await raw.unsafe(file());
    }
  });
});
