// Sharing LIFECYCLE — PR 4 of the Family & caregivers series. Real Hono router + real Postgres as pawpi_app, with an OWNER, a FAMILY member, a
// CAREGIVER, an OUTSIDER and a REVOKED / EXPIRED / PENDING member.
//
//   A. invite notifies the invitee (once)         B. respond: savepoint fix (B9), idempotent double tap, wrong account, expiry
//   C. revoke: instant denial, notification, idempotent   D. leave: soft state, history kept, owner told
//   E. resend: rate-limited, atomic               F. notifications are scoped to exactly one recipient, never duplicated
//   G. account deletion: member -> anonymised ("Former member"), owner -> pet goes after members are told
//   H. old builds: shapes unchanged, plain-text bodies   I. migration 0142 absent: friendly, never a 500

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";
import { MIGRATIONS_DIR } from "./migrate";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const FAMILY = { authUserId: 2, profileId: 2, username: "family" };
const CARE = { authUserId: 3, profileId: 3, username: "care" };
const OUTSIDER = { authUserId: 4, profileId: 4, username: "outsider", petId: 2, petName: "Duke" };
const REVOKED = { authUserId: 5, profileId: 5, username: "revoked" };
const EXPIRED = { authUserId: 6, profileId: 6, username: "expired" };
const PENDING = { authUserId: 7, profileId: 7, username: "pending" };
const FAM2 = { authUserId: 8, profileId: 8, username: "fam2" };
const PET = OWNER.petId;
const PAST = "2000-01-01T00:00:00Z";

let raw: Sql;
let app: Sql;
let api: any;

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId, name: u.authUserId === 1 ? "Olivia Owner" : undefined } }; };
function req(path: string, method = "GET", body?: unknown) {
  return api.request(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
}
const json = async (r: Response) => r.json();
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}
const grant = (id: number, u: { profileId: number }, role: "family" | "caregiver", extra: object = {}) =>
  seedPetCaregiver(raw, { id, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: u.profileId, role, ...extra });
const notifs = (type?: string) =>
  type
    ? raw`select recipient_user_id as r, actor_user_id as a, type, subject_ref, body from notifications where type = ${type} order by id`
    : raw`select recipient_user_id as r, actor_user_id as a, type, subject_ref, body from notifications order by id`;
const shareNotifs = () => raw`select recipient_user_id as r, actor_user_id as a, type, subject_ref, body from notifications where type like 'pet_share_%' order by id`;
const MIG_0142 = () => readFileSync(join(MIGRATIONS_DIR, "0142_sharing_lifecycle.sql"), "utf8");
const food = () => req("/health/food-logs", "POST", { petId: PET, mealType: "dinner", foodName: "kibble" });

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  app = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""), username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {} });
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OUTSIDER);
  for (const u of [FAMILY, CARE, REVOKED, EXPIRED, PENDING, FAM2]) await seedUser(raw, u);
  await raw`update user_profiles set full_name = 'Olivia Owner' where id = ${OWNER.profileId}`;
  await raw`update user_profiles set full_name = 'Fran Family' where id = ${FAMILY.profileId}`;
  for (const t of ["pets", "pet_caregivers", "health_food_logs", "posts", "user_profiles", "auth_users", "notifications", "pet_allergies"]) {
    await raw.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), 10000)`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A. invite", () => {
  it("notifies the INVITEE once (bell row: type, pet id as subject_ref, plain-sentence body); nobody else", async () => {
    as(OWNER);
    const r = await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: FAMILY.username });
    expect(r.status).toBe(201);
    const rows = await shareNotifs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ r: FAMILY.profileId, a: OWNER.profileId, type: "pet_share_invite", subject_ref: String(PET) });
    expect(rows[0].body).toBe("Olivia Owner te invitó a ayudar a cuidar a Rex."); // recipient default locale es-AR (voseo)
    expect(rows[0].body).not.toMatch(/@|owner@example|\{|\}/); // no e-mail, no username, not JSON (old builds print the body)
  });

  it("renders in the RECIPIENT's language", async () => {
    await raw`update user_profiles set preferred_locale = 'en' where id = ${FAMILY.profileId}`;
    as(OWNER);
    await req("/pet-caregivers", "POST", { petId: PET, role: "caregiver", granteeUsername: FAMILY.username });
    expect((await shareNotifs())[0].body).toBe("Olivia Owner invited you to help care for Rex.");
  });

  it("stamps last_notified_at (the resend limiter's clock) and sends nothing to the OWNER", async () => {
    as(OWNER);
    const id = (await json(await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: FAMILY.username }))).grant.id;
    expect((await raw`select last_notified_at, resend_count from pet_caregivers where id = ${id}`)[0].last_notified_at).not.toBeNull();
    expect((await shareNotifs()).filter((n: any) => n.r === OWNER.profileId)).toHaveLength(0);
  });

  it("a duplicate / refused invite sends NO notification", async () => {
    await grant(1, FAMILY, "family");
    as(OWNER);
    expect((await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: FAMILY.username })).status).toBe(409);
    expect((await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: "nobody" })).status).toBe(404);
    as(OUTSIDER);
    expect((await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: CARE.username })).status).toBe(403);
    expect(await shareNotifs()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("B. respond — the savepoint fix (audit B9), idempotency, expiry", () => {
  beforeEach(async () => { await grant(1, FAMILY, "family", { status: "pending" }); });

  it("accept: 200 active, the OWNER is told once, double tap = 200 `already` with ONE change and ONE notification", async () => {
    as(FAMILY);
    const first = await req("/pet-caregivers/1/respond", "POST", { accept: true });
    expect([first.status, (await json(first)).status]).toEqual([200, "active"]);
    const again = await req("/pet-caregivers/1/respond", "POST", { accept: true });
    expect(again.status).toBe(200);
    expect((await json(again)).already).toBe(true);
    const rows = await shareNotifs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ r: OWNER.profileId, a: FAMILY.profileId, type: "pet_share_accepted", subject_ref: String(PET) });
    expect(rows[0].body).toBe("Fran Family aceptó tu invitación para cuidar a Rex.");
    expect(await raw`select id from pet_caregiver_audit where grant_id = 1 and action = 'accept'`).toHaveLength(1);
  });

  it("decline: 200 declined, owner told once; accepting afterwards is a friendly 404, not a 500", async () => {
    as(FAMILY);
    expect((await json(await req("/pet-caregivers/1/respond", "POST", { accept: false }))).status).toBe("declined");
    expect((await shareNotifs()).map((n: any) => n.type)).toEqual(["pet_share_declined"]);
    const late = await req("/pet-caregivers/1/respond", "POST", { accept: true });
    expect(late.status).toBe(404);
    expect((await json(late)).code).toBe("invite_not_pending");
  });

  it("FLIPPED (was it.fails [B9]): a WRONG ACCOUNT answering gets the intended 404 (not a 500), the grant stays pending, nobody is notified", async () => {
    for (const u of [OUTSIDER, CARE, REVOKED]) {
      as(u);
      const r = await req("/pet-caregivers/1/respond", "POST", { accept: true });
      expect(r.status, u.username).toBe(404);
      expect((await json(r)).code).toBe("invite_not_found");
    }
    expect((await raw`select status from pet_caregivers where id = 1`)[0].status).toBe("pending");
    expect(await shareNotifs()).toHaveLength(0);
  });

  it("a revoked / left invite and an expired pending invite answer friendly codes (404 / 410), never 500", async () => {
    await raw`update pet_caregivers set status = 'revoked' where id = 1`;
    as(FAMILY);
    expect((await req("/pet-caregivers/1/respond", "POST", { accept: true })).status).toBe(404);
    await raw`update pet_caregivers set status = 'pending', expires_at = ${PAST}::timestamptz where id = 1`;
    const gone = await req("/pet-caregivers/1/respond", "POST", { accept: true });
    expect(gone.status).toBe(410);
    expect((await json(gone)).code).toBe("invite_expired");
    expect(await shareNotifs()).toHaveLength(0);
  });

  it("many simultaneous accepts: ONE state change, ONE notification, no 500s", async () => {
    as(FAMILY);
    const results = await Promise.all(Array.from({ length: 6 }, () => req("/pet-caregivers/1/respond", "POST", { accept: true })));
    expect(results.every((r: Response) => r.status === 200 || r.status === 404)).toBe(true);
    expect(results.some((r: Response) => r.status >= 500)).toBe(false);
    expect((await raw`select status from pet_caregivers where id = 1`)[0].status).toBe("active");
    expect((await shareNotifs()).filter((n: any) => n.type === "pet_share_accepted")).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("C. revoke — instant, idempotent, the member is told", () => {
  beforeEach(async () => {
    await grant(1, FAMILY, "family");
    await grant(2, CARE, "caregiver");
    await grant(5, PENDING, "family", { status: "pending" });
  });

  it("the member's VERY NEXT request is denied (with `pet_access_revoked`), their opt-in list and ?mine empty, access_version changes", async () => {
    as(FAMILY);
    expect((await food()).status).toBe(201);
    const before = await json(await req("/pets?include_shared=1"));
    const mineBefore = await json(await req("/pet-caregivers?mine=true"));
    expect(before.pets.some((p: any) => p.is_shared)).toBe(true);
    expect(before.access_version).toBe(mineBefore.access_version); // the two reads agree

    as(OWNER);
    expect((await req("/pet-caregivers/1", "DELETE")).status).toBe(200);

    as(FAMILY);
    const denied = await food();
    expect(denied.status).toBe(403);
    expect((await json(denied)).code).toBe("pet_access_revoked");
    const after = await json(await req("/pets?include_shared=1"));
    expect(after.pets.filter((p: any) => p.is_shared)).toEqual([]);
    expect(after.access_version).not.toBe(before.access_version);
    const mineAfter = await json(await req("/pet-caregivers?mine=true"));
    expect(mineAfter.grants).toEqual([]);
    expect(mineAfter.access_version).toBe(after.access_version);
    expect((await req(`/routines?petId=${PET}`)).status).toBe(403);
  });

  it("an ACTIVE member is told once (revoked); revoking again is 200 `already` and sends nothing more; cancelling a PENDING invite is silent", async () => {
    as(OWNER);
    await req("/pet-caregivers/1", "DELETE");
    const again = await req("/pet-caregivers/1", "DELETE");
    expect(again.status).toBe(200);
    expect((await json(again)).already).toBe(true);
    await req("/pet-caregivers/5", "DELETE"); // pending
    const rows = await shareNotifs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ r: FAMILY.profileId, a: OWNER.profileId, type: "pet_share_revoked", subject_ref: String(PET) });
    expect(rows[0].body).toBe("Ya no tenés acceso a Rex.");
    expect(await raw`select id from pet_caregiver_audit where grant_id = 1 and action = 'revoke'`).toHaveLength(1);
  });

  it("FLIPPED (was TODAY [C6]): revoking an already-revoked grant is a friendly 200, not a 404 error alert", async () => {
    as(OWNER);
    await req("/pet-caregivers/1", "DELETE");
    expect((await req("/pet-caregivers/1", "DELETE")).status).toBe(200);
  });

  it("only the OWNER can revoke: family, caregiver, outsider and the member themself get 404; nothing changes, nobody is told", async () => {
    for (const u of [FAMILY, CARE, OUTSIDER, REVOKED]) {
      as(u);
      expect((await req("/pet-caregivers/2", "DELETE")).status, u.username).toBe(404);
    }
    expect((await raw`select status from pet_caregivers where id = 2`)[0].status).toBe("active");
    expect(await shareNotifs()).toHaveLength(0);
  });

  it("history is preserved: the revoked grant row, its audit trail and what the member logged all stay", async () => {
    as(FAMILY);
    await food();
    as(OWNER);
    await req("/pet-caregivers/1", "DELETE");
    expect((await raw`select status, revoked_at from pet_caregivers where id = 1`)[0].status).toBe("revoked");
    expect(Number((await raw`select count(*)::int n from health_food_logs where pet_id = ${PET}`)[0].n)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("D. leave — soft state, history kept, the owner is told", () => {
  beforeEach(async () => {
    await grant(1, FAMILY, "family");
    await grant(2, CARE, "caregiver");
    await grant(5, PENDING, "family", { status: "pending" });
  });

  it("a member leaves: status 'left' + left_at + audit row; next request denied; owner told ONCE; the member's logs stay", async () => {
    as(FAMILY);
    await food();
    const r = await req("/pet-caregivers/1/leave", "POST");
    expect([r.status, (await json(r)).status]).toEqual([200, "left"]);
    const [g] = await raw`select status, left_at, grantee_user_id from pet_caregivers where id = 1`;
    expect([g.status, g.grantee_user_id]).toEqual(["left", FAMILY.profileId]);
    expect(g.left_at).not.toBeNull();
    expect(await raw`select id from pet_caregiver_audit where grant_id = 1 and action = 'leave'`).toHaveLength(1);
    const denied = await food();
    expect(denied.status).toBe(403);
    expect((await json(denied)).code).toBe("pet_access_revoked");
    expect((await json(await req("/pets?include_shared=1"))).pets.filter((p: any) => p.is_shared)).toEqual([]);
    expect(Number((await raw`select count(*)::int n from health_food_logs where pet_id = ${PET}`)[0].n)).toBe(1);
    const rows = await shareNotifs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ r: OWNER.profileId, a: FAMILY.profileId, type: "pet_share_left", subject_ref: String(PET) });
    expect(rows[0].body).toBe("Fran Family dejó de ayudar a cuidar a Rex.");
  });

  it("leaving twice is 200 `already` (no second change, no second notification); a caregiver can leave too", async () => {
    as(FAMILY);
    await req("/pet-caregivers/1/leave", "POST");
    const again = await req("/pet-caregivers/1/leave", "POST");
    expect(again.status).toBe(200);
    expect((await json(again)).already).toBe(true);
    as(CARE);
    expect((await json(await req("/pet-caregivers/2/leave", "POST"))).status).toBe("left");
    expect((await shareNotifs()).map((n: any) => [n.r, n.type])).toEqual([[OWNER.profileId, "pet_share_left"], [OWNER.profileId, "pet_share_left"]]);
  });

  it("leaving a still-PENDING invite is a decline (owner told 'declined')", async () => {
    as(PENDING);
    const r = await req("/pet-caregivers/5/leave", "POST");
    expect([r.status, (await json(r)).status]).toEqual([200, "declined"]);
    expect((await shareNotifs()).map((n: any) => n.type)).toEqual(["pet_share_declined"]);
  });

  it("only the member can leave THEIR grant: owner, outsider, other members and ended members get 404, nothing changes", async () => {
    for (const u of [OWNER, OUTSIDER, CARE, REVOKED]) {
      as(u);
      expect((await req("/pet-caregivers/1/leave", "POST")).status, u.username).toBe(404);
    }
    expect((await raw`select status from pet_caregivers where id = 1`)[0].status).toBe("active");
    expect(await shareNotifs()).toHaveLength(0);
  });

  it("after a member LEAVES the owner can invite the same person again (a new live grant; the history row stays)", async () => {
    as(FAMILY);
    await req("/pet-caregivers/1/leave", "POST");
    as(OWNER);
    expect((await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: FAMILY.username })).status).toBe(201);
    expect(await raw`select id from pet_caregivers where grantee_user_id = ${FAMILY.profileId}`).toHaveLength(2);
  });

  it("FLIPPED (was TODAY [B4]): leaving now works, while direct SQL by a grantee on pet_caregivers is still refused", async () => {
    await asApp(CARE.profileId, async (tx) => {
      expect(await tx`update pet_caregivers set status = 'left' where id = 2 returning id`).toHaveLength(0);
      expect(await tx`delete from pet_caregivers where id = 2 returning id`).toHaveLength(0);
    });
    as(CARE);
    expect((await req("/pet-caregivers/2/leave", "POST")).status).toBe(200);
  });

  it("the OWNER's list shows the ended grant as 'left' (history), `?mine=true` of the member does not", async () => {
    as(FAMILY);
    await req("/pet-caregivers/1/leave", "POST");
    expect((await json(await req("/pet-caregivers?mine=true"))).grants).toEqual([]);
    as(OWNER);
    const list = (await json(await req(`/pet-caregivers?petId=${PET}`))).grants;
    expect(list.find((g: any) => g.id === 1).status).toBe("left");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("E. resend", () => {
  let grantId: number;
  beforeEach(async () => {
    as(OWNER);
    grantId = (await json(await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: PENDING.username }))).grant.id;
  });
  const back = (hours: number) => raw.unsafe(`update pet_caregivers set last_notified_at = now() - interval '${hours} hours' where id = ${grantId}`);

  it("right after the invite it is rate-limited: 429 resend_too_soon with retry_after_seconds, nothing sent", async () => {
    const r = await req(`/pet-caregivers/${grantId}/resend`, "POST", {});
    expect(r.status).toBe(429);
    const body = await json(r);
    expect(body.code).toBe("resend_too_soon");
    expect(body.retry_after_seconds).toBeGreaterThan(0);
    expect((await shareNotifs()).filter((n: any) => n.type === "pet_share_invite")).toHaveLength(1); // only the original invite
  });

  it("after the interval it resends: bell row again to the INVITEE only, resend_count +1, audit 'resend'", async () => {
    await back(2);
    const r = await req(`/pet-caregivers/${grantId}/resend`, "POST", {});
    expect(r.status).toBe(200);
    expect((await json(r)).resend_count).toBe(1);
    const rows = (await shareNotifs()).filter((n: any) => n.type === "pet_share_invite");
    expect(rows.map((n: any) => n.r)).toEqual([PENDING.profileId, PENDING.profileId]);
    expect(await raw`select id from pet_caregiver_audit where grant_id = ${grantId} and action = 'resend'`).toHaveLength(1);
  });

  it("it can extend the access window (future date only) and the limit stops at 5", async () => {
    await back(2);
    const bad = await req(`/pet-caregivers/${grantId}/resend`, "POST", { expiresAt: PAST });
    expect([bad.status, (await json(bad)).code]).toEqual([400, "invalid_expiry"]);
    const ok = await req(`/pet-caregivers/${grantId}/resend`, "POST", { expiresAt: "2999-01-01T00:00:00Z" });
    expect(ok.status).toBe(200);
    expect(new Date((await raw`select expires_at from pet_caregivers where id = ${grantId}`)[0].expires_at).getUTCFullYear()).toBe(2999);
    await raw.unsafe(`update pet_caregivers set resend_count = 5, last_notified_at = now() - interval '5 hours' where id = ${grantId}`);
    const limit = await req(`/pet-caregivers/${grantId}/resend`, "POST", {});
    expect([limit.status, (await json(limit)).code]).toEqual([429, "resend_limit"]);
  });

  it("two parallel resends: exactly ONE goes through (the limiter is atomic)", async () => {
    await back(2);
    const [a, b] = await Promise.all([req(`/pet-caregivers/${grantId}/resend`, "POST", {}), req(`/pet-caregivers/${grantId}/resend`, "POST", {})]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    expect((await raw`select resend_count from pet_caregivers where id = ${grantId}`)[0].resend_count).toBe(1);
  });

  it("only the OWNER can resend, only a PENDING invite can be resent", async () => {
    await back(2);
    for (const u of [FAMILY, CARE, OUTSIDER, PENDING]) { as(u); expect((await req(`/pet-caregivers/${grantId}/resend`, "POST", {})).status, u.username).toBe(404); }
    as(PENDING);
    await req(`/pet-caregivers/${grantId}/respond`, "POST", { accept: true });
    as(OWNER);
    const r = await req(`/pet-caregivers/${grantId}/resend`, "POST", {});
    expect([r.status, (await json(r)).code]).toEqual([409, "invite_not_pending"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("F. notifications: exactly one recipient, never yourself, never duplicated", () => {
  it("a full cycle produces exactly the expected rows, each to the right user_profiles.id", async () => {
    as(OWNER);
    const g = (await json(await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: FAMILY.username }))).grant.id;
    as(FAMILY);
    await req(`/pet-caregivers/${g}/respond`, "POST", { accept: true });
    await req(`/pet-caregivers/${g}/respond`, "POST", { accept: true }); // double tap
    await req(`/pet-caregivers/${g}/leave`, "POST");
    await req(`/pet-caregivers/${g}/leave`, "POST"); // double tap
    as(OWNER);
    const g2 = (await json(await req("/pet-caregivers", "POST", { petId: PET, role: "caregiver", granteeUsername: FAMILY.username }))).grant.id;
    as(FAMILY);
    await req(`/pet-caregivers/${g2}/respond`, "POST", { accept: true });
    as(OWNER);
    await req(`/pet-caregivers/${g2}`, "DELETE");
    await req(`/pet-caregivers/${g2}`, "DELETE");
    expect((await shareNotifs()).map((n: any) => [n.r, n.a, n.type])).toEqual([
      [FAMILY.profileId, OWNER.profileId, "pet_share_invite"],
      [OWNER.profileId, FAMILY.profileId, "pet_share_accepted"],
      [OWNER.profileId, FAMILY.profileId, "pet_share_left"],
      [FAMILY.profileId, OWNER.profileId, "pet_share_invite"],
      [OWNER.profileId, FAMILY.profileId, "pet_share_accepted"],
      [FAMILY.profileId, OWNER.profileId, "pet_share_revoked"],
    ]);
    expect((await shareNotifs()).every((n: any) => n.r !== n.a && n.subject_ref === String(PET))).toBe(true);
    // nobody else (outsider, caregiver, revoked…) ever received anything
    expect((await shareNotifs()).filter((n: any) => ![OWNER.profileId, FAMILY.profileId].includes(n.r))).toHaveLength(0);
  });

  it("a recipient reads the row through GET /api/notifications (an unknown type to old builds is just a bell row with a text body)", async () => {
    as(OWNER);
    await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: FAMILY.username });
    as(FAMILY);
    const res = await req("/notifications");
    expect(res.status).toBe(200);
    const list = (await json(res)).notifications ?? (await res.json?.()) ?? [];
    const row = list.find((n: any) => n.type === "pet_share_invite");
    expect(row).toBeTruthy();
    expect(row.body).toMatch(/Rex/);
    // an outsider never sees it
    as(OUTSIDER);
    expect(((await json(await req("/notifications"))).notifications ?? []).filter((n: any) => n.type === "pet_share_invite")).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("G. account deletion — decision 1", () => {
  const dailyMoment = (userId: number, day: string, caption: string) =>
    raw`insert into posts (user_id, pet_id, caption, is_daily_update, post_date) values (${userId}, ${PET}, ${caption}, true, ${day})`;
  const former = () => raw`select up.id, up.username, up.full_name, up.is_demo, a.email from user_profiles up join auth_users a on a.id = up.auth_user_id where up.username like 'former_member_%'`;

  async function memberWithContributions() {
    await grant(1, FAMILY, "family");
    await grant(2, CARE, "caregiver");
    await dailyMoment(FAMILY.profileId, "2026-11-10", "family slide");
    await dailyMoment(OWNER.profileId, "2026-11-10", "owner slide");
    await raw`insert into posts (id, user_id, pet_id, caption) values (500, ${OWNER.profileId}, ${PET}, 'owner post')`;
    await raw`insert into post_paws (post_id, user_id) values (500, ${FAMILY.profileId})`; // a reaction by the member
    as(FAMILY);
    expect((await req("/vet-record/allergies", "POST", { petId: PET, allergen: "chicken" })).status).toBe(200);
    expect((await food()).status).toBe(201);
    await raw`insert into device_push_tokens (user_id, token, platform) values (${FAMILY.profileId}, 'ExponentPushToken[family]', 'ios')`;
  }

  it("MEMBER deletes their account: posts on the owner's dog are KEPT under an anonymous 'Former member'; logs stay; vet attribution reads 'Former member'", async () => {
    await memberWithContributions();
    as(FAMILY);
    const del = await req("/account", "DELETE");
    expect(del.status).toBe(200);

    // the account is gone…
    expect(await raw`select id from user_profiles where id = ${FAMILY.profileId}`).toHaveLength(0);
    expect(await raw`select id from auth_users where id = ${FAMILY.authUserId}`).toHaveLength(0);
    // …a fresh anonymous profile exists (random username, no e-mail, no avatar, cannot sign in)…
    const anon = await former();
    expect(anon).toHaveLength(1);
    expect(anon[0]).toMatchObject({ full_name: "Former member", email: null });
    expect(anon[0].username).toMatch(/^former_member_[0-9a-f]{10}$/);
    expect(await raw`select id from auth_accounts where "userId" = (select auth_user_id from user_profiles where id = ${anon[0].id})`).toHaveLength(0);
    // …their post on the dog survived, re-attributed; the owner's own posts are untouched
    expect((await raw`select user_id, caption from posts where caption = 'family slide'`).map((p) => p.user_id)).toEqual([anon[0].id]);
    expect(await raw`select id from posts where caption in ('owner slide', 'owner post')`).toHaveLength(2);
    // the log they wrote (anchored to the owner) stays; their reaction and push token (personal) are gone
    expect(Number((await raw`select count(*)::int n from health_food_logs where pet_id = ${PET}`)[0].n)).toBe(1);
    expect(await raw`select 1 from post_paws where user_id = ${FAMILY.profileId}`).toHaveLength(0);
    expect(await raw`select 1 from device_push_tokens where token = 'ExponentPushToken[family]'`).toHaveLength(0);
    // vet-record attribution: "Former member", role still 'editor' — never "Editor · Editor"
    as(OWNER);
    const allergies = (await json(await req(`/vet-record/allergies?petId=${PET}`))).allergies;
    expect(allergies).toHaveLength(1);
    expect([allergies[0].created_by_name, allergies[0].created_by_role, allergies[0].created_by_user_id]).toEqual(["Former member", "editor", anon[0].id]);
    // the grant + its audit trail are kept as history ('left'), re-pointed at the anonymous profile
    const [g] = await raw`select status, grantee_user_id, left_at from pet_caregivers where id = 1`;
    expect([g.status, g.grantee_user_id]).toEqual(["left", anon[0].id]);
    expect(g.left_at).not.toBeNull();
    expect((await raw`select actor_user_id from pet_caregiver_audit where grant_id = 1 and action = 'leave'`).map((r) => r.actor_user_id)).toEqual([anon[0].id]);
    // the owner was told (before the data changed), once
    const told = (await shareNotifs()).filter((n: any) => n.type === "pet_share_left");
    expect(told.map((n: any) => [n.r, n.subject_ref])).toEqual([[OWNER.profileId, String(PET)]]);
    // the other member is untouched
    expect((await raw`select status from pet_caregivers where id = 2`)[0].status).toBe("active");
  });

  it("the day card / feed show the preserved post with the anonymous author's name 'Former member'", async () => {
    await memberWithContributions();
    as(FAMILY);
    await req("/account", "DELETE");
    as(OWNER);
    const card = await json(await req(`/pets/${PET}/day-card?day=2026-11-10`));
    const text = JSON.stringify(card);
    expect(text).toContain("Former member");
    expect(text).not.toContain("Fran Family");
  });

  it("?delete_contributions=1: the member's POSTS on others' pets are deleted instead (vet attribution still anonymised)", async () => {
    await memberWithContributions();
    as(FAMILY);
    expect((await req("/account?delete_contributions=1", "DELETE")).status).toBe(200);
    expect(await raw`select id from posts where caption = 'family slide'`).toHaveLength(0);
    expect(await raw`select id from posts where caption in ('owner slide', 'owner post')`).toHaveLength(2);
    const anon = await former();
    expect(anon).toHaveLength(1);
    expect((await raw`select created_by_user_id from pet_allergies where pet_id = ${PET}`)[0].created_by_user_id).toBe(anon[0].id);
  });

  it("two members who posted the SAME day on the same dog are BOTH preserved (a separate anonymous profile each, no unique-index clash)", async () => {
    await grant(1, FAMILY, "family");
    await grant(2, FAM2, "family");
    await dailyMoment(FAMILY.profileId, "2026-11-11", "one");
    await dailyMoment(FAM2.profileId, "2026-11-11", "two");
    as(FAMILY);
    expect((await req("/account", "DELETE")).status).toBe(200);
    as(FAM2);
    expect((await req("/account", "DELETE")).status).toBe(200);
    expect((await raw`select caption from posts where is_daily_update order by caption`).map((p) => p.caption)).toEqual(["one", "two"]);
    expect(await former()).toHaveLength(2);
  });

  it("a user who held NO grant leaves no anonymous profile behind; nothing changes for ordinary owners", async () => {
    as(OUTSIDER);
    expect((await req("/account", "DELETE")).status).toBe(200);
    expect(await former()).toHaveLength(0);
    expect(await raw`select id from pets where id = ${OUTSIDER.petId}`).toHaveLength(0); // their own dog goes with them
    expect(await raw`select id from pets where id = ${PET}`).toHaveLength(1);
  });

  it("OWNER deletes their account: the pet and its content go, members are told FIRST (active + pending only, once each)", async () => {
    await grant(1, FAMILY, "family");
    await grant(2, CARE, "caregiver");
    await grant(3, REVOKED, "family", { status: "revoked" });
    await grant(5, PENDING, "family", { status: "pending" });
    await dailyMoment(FAMILY.profileId, "2026-11-12", "family slide");
    as(OWNER);
    expect((await req("/account", "DELETE")).status).toBe(200);
    // pet, grants, posts on it: gone
    expect(await raw`select id from pets where id = ${PET}`).toHaveLength(0);
    expect(await raw`select id from pet_caregivers`).toHaveLength(0);
    expect(await raw`select id from posts where pet_id = ${PET}`).toHaveLength(0);
    // the members' own accounts are intact and each active/pending member has exactly one notice; the revoked one has none
    expect(await raw`select id from user_profiles where id in (${FAMILY.profileId}, ${CARE.profileId}, ${PENDING.profileId})`).toHaveLength(3);
    const rows = await shareNotifs();
    expect(rows.every((n: any) => n.type === "pet_share_owner_deleted")).toBe(true);
    expect(rows.map((n: any) => n.r).sort()).toEqual([FAMILY.profileId, CARE.profileId, PENDING.profileId].sort());
    expect(rows[0].body).toBe("Rex ya no está compartido con vos: el dueño borró su cuenta.");
    expect(await former()).toHaveLength(0); // an owner deletion creates no anonymous profile
  });

  it("a user who is BOTH an owner and a member: their dog goes (members told), their contributions elsewhere are anonymised", async () => {
    await grant(1, OUTSIDER, "family"); // OUTSIDER owns Duke AND is family on Rex
    await raw`insert into pet_caregivers (pet_id, owner_user_id, grantee_user_id, role, status) values (${OUTSIDER.petId}, ${OUTSIDER.profileId}, ${CARE.profileId}, 'caregiver', 'active')`;
    await dailyMoment(OUTSIDER.profileId, "2026-11-13", "outsider slide on Rex");
    as(OUTSIDER);
    expect((await req("/account", "DELETE")).status).toBe(200);
    expect(await raw`select id from pets where id = ${OUTSIDER.petId}`).toHaveLength(0);
    expect((await raw`select count(*)::int n from posts where caption = 'outsider slide on Rex'`)[0].n).toBe(1);
    expect((await shareNotifs()).map((n: any) => [n.r, n.type]).sort()).toEqual(
      [[CARE.profileId, "pet_share_owner_deleted"], [OWNER.profileId, "pet_share_left"]].sort(),
    );
  });

  it("LEGACY rows whose author was nulled by an earlier deletion read 'Former member', not 'Editor · Editor'", async () => {
    await raw`insert into pet_allergies (pet_id, owner_user_id, allergen, created_by_user_id, created_by_role) values (${PET}, ${OWNER.profileId}, 'old', null, 'editor')`;
    as(OWNER);
    const a = (await json(await req(`/vet-record/allergies?petId=${PET}`))).allergies[0];
    expect([a.created_by_name, a.created_by_role]).toEqual(["Former member", "editor"]);
  });

  it("the anonymous profile is not discoverable: not in people search, cannot be invited", async () => {
    await memberWithContributions();
    as(FAMILY);
    await req("/account", "DELETE");
    as(OWNER);
    expect((await json(await req("/search?q=former"))).owners).toEqual([]);
    expect((await json(await req("/search?q=Former%20member"))).owners).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("H. old builds (30-32): shapes unchanged", () => {
  it("invite / respond / revoke keep their success shapes and statuses; ?mine=true and the owner list keep their fields (access_version is additive)", async () => {
    as(OWNER);
    const inv = await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: FAMILY.username });
    expect(inv.status).toBe(201);
    const id = (await json(inv)).grant.id;
    as(FAMILY);
    const mine = await json(await req("/pet-caregivers?mine=true"));
    expect(Object.keys(mine.grants[0]).sort()).toEqual(["created_at", "expires_at", "id", "owner_username", "pet_avatar", "pet_id", "pet_name", "role", "scopes", "status"]);
    const acc = await req(`/pet-caregivers/${id}/respond`, "POST", { accept: true });
    expect(Object.keys(await json(acc))).toEqual(["status"]);
    as(OWNER);
    const rev = await req(`/pet-caregivers/${id}`, "DELETE");
    expect(Object.keys(await json(rev)).sort()).toEqual(["id", "ok"]);
    const list = (await json(await req(`/pet-caregivers?petId=${PET}`))).grants;
    expect(Object.keys(list[0]).sort()).toEqual(["created_at", "expires_at", "grantee_avatar", "grantee_username", "id", "is_expired", "pet_id", "role", "scopes", "status"]);
  });

  it("the default GET /api/pets is still byte-identical for a user holding grants (PR3 invariant, after the lifecycle changes)", async () => {
    as(OUTSIDER);
    const before = await (await req("/pets")).text();
    await grant(10, OUTSIDER, "caregiver");
    expect(await (await req("/pets")).text()).toBe(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("I. migration 0142 not applied: friendly, never a 500", () => {
  // 0142 rewrites the notification type list, so the later migration that widens it goes back on top.
  const restoreSchema = async () => {
    await raw.unsafe(MIG_0142());
    await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "0147_vet_sharing_sections.sql"), "utf8"));
  };

  it("no leave function -> 503 sharing_lifecycle_unavailable (nothing changes); the member can still be revoked by the owner", async () => {
    await grant(1, FAMILY, "family");
    await raw`alter function leave_pet_caregiver(integer) rename to leave_pet_caregiver_hidden`;
    try {
      as(FAMILY);
      const r = await req("/pet-caregivers/1/leave", "POST");
      expect([r.status, (await json(r)).code]).toEqual([503, "sharing_lifecycle_unavailable"]);
      expect((await raw`select status from pet_caregivers where id = 1`)[0].status).toBe("active");
    } finally {
      await raw`alter function leave_pet_caregiver_hidden(integer) rename to leave_pet_caregiver`;
    }
  });

  it("no lifecycle columns -> invite still 201 (the timestamp is best-effort), resend answers 503, revoke / respond still work", async () => {
    await raw`alter table pet_caregivers rename column last_notified_at to last_notified_at_hidden`;
    try {
      as(OWNER);
      const inv = await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: PENDING.username });
      expect(inv.status).toBe(201);
      const id = (await json(inv)).grant.id;
      const rs = await req(`/pet-caregivers/${id}/resend`, "POST", {});
      expect([rs.status, (await json(rs)).code]).toEqual([503, "sharing_lifecycle_unavailable"]);
      as(PENDING);
      expect((await req(`/pet-caregivers/${id}/respond`, "POST", { accept: true })).status).toBe(200);
      as(OWNER);
      expect((await req(`/pet-caregivers/${id}`, "DELETE")).status).toBe(200);
    } finally {
      await raw`alter table pet_caregivers rename column last_notified_at_hidden to last_notified_at`;
    }
  });

  it("an OLD notification type CHECK (new types refused by the DB): invite / accept / revoke / leave still succeed, no notification, no 500", async () => {
    await raw.unsafe(`alter table notifications drop constraint notifications_type_check;
      alter table notifications add constraint notifications_type_check check (type = any (array['paw','bark','follow','biz_follow']::text[]))`);
    try {
      as(OWNER);
      const inv = await req("/pet-caregivers", "POST", { petId: PET, role: "family", granteeUsername: FAMILY.username });
      expect(inv.status).toBe(201);
      const id = (await json(inv)).grant.id;
      as(FAMILY);
      expect((await req(`/pet-caregivers/${id}/respond`, "POST", { accept: true })).status).toBe(200);
      as(OWNER);
      expect((await req(`/pet-caregivers/${id}`, "DELETE")).status).toBe(200);
      expect(await shareNotifs()).toHaveLength(0);
    } finally {
      await restoreSchema();
    }
  });

  it("account deletion without app_delete_my_account: ?delete_contributions=1 falls back to the previous delete (still 200)", async () => {
    await grant(1, FAMILY, "family");
    // "0142 not applied" == the rollback script's state (old delete_my_account body, no app_delete_my_account)
    await raw.unsafe(readFileSync(join(MIGRATIONS_DIR, "..", "rollback_0142.sql"), "utf8"));
    try {
      as(FAMILY);
      expect((await req("/account?delete_contributions=1", "DELETE")).status).toBe(200);
      expect(await raw`select id from user_profiles where id = ${FAMILY.profileId}`).toHaveLength(0);
    } finally {
      await restoreSchema();
    }
  });

  it("the schema really is back to normal after those cases (the whole run shares ONE cluster)", async () => {
    await grant(1, FAMILY, "family");
    as(FAMILY);
    expect((await req("/pet-caregivers/1/leave", "POST")).status).toBe(200);
    as(OWNER);
    const inv = await req("/pet-caregivers", "POST", { petId: PET, role: "caregiver", granteeUsername: CARE.username });
    expect(inv.status).toBe(201);
    expect((await shareNotifs()).some((n: any) => n.type === "pet_share_invite")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("J. leave_pet_caregiver() and the account functions as pawpi_app", () => {
  it("only the grantee can leave, only an ACTIVE grant; a stranger / owner / no identity is refused", async () => {
    await grant(1, FAMILY, "family");
    await grant(2, REVOKED, "family", { status: "revoked" });
    for (const [uid, id] of [[OWNER.profileId, 1], [OUTSIDER.profileId, 1], [FAMILY.profileId, 2], [REVOKED.profileId, 2]] as const) {
      await expect(asApp(uid, (tx) => tx`select leave_pet_caregiver(${id})`), `user ${uid} grant ${id}`).rejects.toThrow(/no active grant for caller/i);
    }
    await expect(asApp(null, (tx) => tx`select leave_pet_caregiver(1)`)).rejects.toThrow(/no identity/i);
    await asApp(FAMILY.profileId, async (tx) => {
      expect((await tx`select leave_pet_caregiver(1) as s`)[0].s).toBe("left");
    });
    expect((await raw`select status from pet_caregivers where id = 1`)[0].status).toBe("left");
  });

  it("delete_my_account() keeps its signature (boolean, no args) and still returns true; no identity -> false", async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect((await tx`select delete_my_account() as ok`)[0].ok).toBe(true);
    });
    expect((await asApp(null, (tx) => tx`select delete_my_account() as ok`))[0].ok).toBe(false);
  });
});
