// Telling the vet that access to a dog's record was given or ended (care_access_granted / care_access_revoked),
// through the real Hono router + real Postgres as pawpi_app. Only the Expo push client is replaced.
//   A. who gets what, in which language, with which date        B. nothing on every other path
//   C. the phone push follows the booking switches              D. a failing notification never fails the share/revoke

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedProviderWithStaff, seedStaff, seedUser } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));
const pushed = vi.hoisted(() => [] as any[]);
vi.mock("expo-server-sdk", () => ({
  Expo: class {
    static isExpoPushToken() { return true; }
    chunkPushNotifications(messages: any[]) { return [messages]; }
    async sendPushNotificationsAsync(chunk: any[]) { pushed.push(...chunk); return chunk.map(() => ({ status: "ok" })); }
  },
}));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Ana Gomez", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "vet" };
const VET2 = { authUserId: 4, profileId: 4, username: "vet2" };
const NURSE = { authUserId: 5, profileId: 5, username: "nurse" }; // staff of both providers
const FORMER = { authUserId: 6, profileId: 6, username: "former" };
const P1 = 1;
const P2 = 2;
const PET = OWNER.petId;

const GRANTED = "care_access_granted";
const REVOKED = "care_access_revoked";

let raw: Sql;
let api: any;

const as = (u: { authUserId: number }) => { authState.session = { user: { id: u.authUserId } }; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
const post = (body: object, user = OWNER) => { as(user); return req("/care-access/grants", "POST", body); };
const byScope = (extra: object = {}) => post({ petId: PET, providerId: P1, ...extra });
const bySection = (expiry = "until_revoked", sections = ["vaccines"]) =>
  post({ petId: PET, providerId: P1, sections, expiry });
const patch = (grantId: number, action: string, user = OWNER, extra: object = {}) => {
  as(user);
  return req(`/care-access/grants/${grantId}`, "PATCH", { action, ...extra });
};
const ask = async () => {
  as(VET);
  const res = await req(`/providers/${P1}/access-requests`, "POST", { petId: PET, scopes: ["medical_read"] });
  expect(res.status).toBe(201);
  return (await res.json()).grant;
};
const grantOf = async (res: Response, status = 201) => {
  expect(res.status).toBe(status);
  return (await res.json()).grant;
};
const bells = async () => [
  ...(await raw`
    select recipient_user_id as to, actor_user_id as actor, type, subject_ref, body
    from notifications where type in (${GRANTED}, ${REVOKED}) order by id`),
];
const summary = async () => (await bells()).map((n) => [n.to, n.type]);
const clear = async () => { await raw`delete from notifications`; pushed.length = 0; };
const team = (type: string) => [[VET.profileId, type], [NURSE.profileId, type]];
const day = (value: string | Date, timeZone = "America/Buenos_Aires") =>
  new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(value));

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
afterEach(async () => { await resetDb(raw); authState.session = null; pushed.length = 0; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  for (const u of [VET, VET2, NURSE, FORMER]) await seedUser(raw, u);
  await seedProviderWithStaff(raw, {
    providerId: P1, ownerUserProfileId: VET.profileId, staffUserProfileId: VET.profileId,
    staffRole: "owner", slug: "vet-1", providerStatus: "published",
  });
  await seedProviderWithStaff(raw, {
    providerId: P2, ownerUserProfileId: VET2.profileId, staffUserProfileId: VET2.profileId,
    staffRole: "owner", slug: "vet-2", providerStatus: "published",
  });
  await seedStaff(raw, { providerId: P1, userProfileId: NURSE.profileId });
  await seedStaff(raw, { providerId: P2, userProfileId: NURSE.profileId });
  await seedStaff(raw, { providerId: P1, userProfileId: FORMER.profileId, status: "removed" });
  // The owner also works at this vet: the person acting is never notified.
  await seedStaff(raw, { providerId: P1, userProfileId: OWNER.profileId });
  await raw`update user_profiles set preferred_locale = 'en' where id = ${VET.profileId}`;
  await raw`insert into pet_medical_profiles (pet_id, owner_user_id, microchip_id, medical_notes)
            values (${PET}, ${OWNER.profileId}, 'SECRET-chip', 'SECRET-notes')`;
});

describe("A. who gets what", () => {
  it("a share by scope tells each active staff member once, in their own language, and nobody else", async () => {
    await grantOf(await byScope());
    expect(await bells()).toEqual([
      {
        to: VET.profileId, actor: OWNER.profileId, type: GRANTED, subject_ref: String(PET),
        body: "Ana Gomez gave your team access to Rex's records until revoked.",
      },
      {
        to: NURSE.profileId, actor: OWNER.profileId, type: GRANTED, subject_ref: String(PET),
        body: "Ana Gomez le dio a tu equipo acceso a la ficha de Rex hasta que lo revoque.",
      },
    ]);
  });

  it("a share by section says until when, on the recipient's local day, and nothing from the record", async () => {
    await raw`update user_profiles set timezone = 'Pacific/Kiritimati' where id = ${VET.profileId}`;
    const grant = await grantOf(await bySection("30d", ["profile", "vaccines"]));
    expect((await bells()).map((n) => n.body)).toEqual([
      `Ana Gomez gave your team access to Rex's records until ${day(grant.expires_at, "Pacific/Kiritimati")}.`,
      `Ana Gomez le dio a tu equipo acceso a la ficha de Rex hasta el ${day(grant.expires_at)}.`,
    ]);
  });

  it("an owner with no public name is a neutral word, never the username or e-mail", async () => {
    await raw`update user_profiles set full_name = null where id = ${OWNER.profileId}`;
    await grantOf(await byScope());
    expect((await bells()).map((n) => n.body)).toEqual([
      "A pet owner gave your team access to Rex's records until revoked.",
      "Un dueño le dio a tu equipo acceso a la ficha de Rex hasta que lo revoque.",
    ]);
  });

  it("revoking tells the team once", async () => {
    const grant = await grantOf(await byScope());
    await clear();
    expect((await patch(grant.id, "revoke")).status).toBe(200);
    expect((await bells()).map((n) => [n.to, n.type, n.subject_ref, n.body])).toEqual([
      [VET.profileId, REVOKED, String(PET), "Ana Gomez ended your team's access to Rex's records."],
      [NURSE.profileId, REVOKED, String(PET), "Ana Gomez revocó el acceso de tu equipo a la ficha de Rex."],
    ]);
  });

  it("revoking a grant by section tells the team too", async () => {
    const grant = await grantOf(await bySection("7d"));
    await clear();
    expect((await patch(grant.id, "revoke")).status).toBe(200);
    expect(await summary()).toEqual(team(REVOKED));
  });

  it.each([
    ["by scope", () => byScope()],
    ["by section", () => bySection("1y")],
  ])("approving the vet's pending request with a share %s tells the team", async (_name, shareIt) => {
    await ask();
    expect(await bells()).toEqual([]);
    expect((await shareIt()).status).toBe(200);
    expect(await summary()).toEqual(team(GRANTED));
  });

  it("PATCH approve tells the team, with the date it was given", async () => {
    const pending = await ask();
    const expiresAt = "2099-03-04T15:00:00.000Z";
    expect((await patch(pending.id, "approve", OWNER, { expiresAt })).status).toBe(200);
    expect(await summary()).toEqual(team(GRANTED));
    expect((await bells())[0].body).toBe("Ana Gomez gave your team access to Rex's records until 04/03/2099.");
  });

  it("replacing an active grant says only that access was given", async () => {
    await grantOf(await byScope());
    await clear();
    await grantOf(await bySection("7d"));
    expect(await summary()).toEqual(team(GRANTED));
    await clear();
    await grantOf(await bySection("30d", ["files"]));
    expect(await summary()).toEqual(team(GRANTED));
  });

  it("the vet reads it in GET /api/notifications", async () => {
    await grantOf(await byScope());
    as(VET);
    const res = await req("/notifications");
    expect(res.status).toBe(200);
    expect((await res.json()).notifications).toMatchObject([
      { type: GRANTED, subject_ref: String(PET), actor_username: "Ana Gomez" },
    ]);
  });
});

describe("B. nothing on any other path", () => {
  it("the vet's request, a repeated share, a 409 and refused bodies say nothing", async () => {
    await ask();
    expect(await bells()).toEqual([]);
    await raw`delete from care_access_grants`;

    await grantOf(await byScope());
    await clear();
    const again = await byScope();
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ deduped: true });
    expect((await post({ petId: PET })).status).toBe(400);
    expect((await byScope({ scopes: ["nonsense"] })).status).toBe(400);
    expect((await post({ petId: PET, providerId: P1, sections: [], expiry: "7d" })).status).toBe(400);
    expect((await post({ petId: OTHER.petId, providerId: P1 })).status).toBe(404);
    expect((await post({ petId: PET, providerId: 999 })).status).toBe(404);
    expect(await bells()).toEqual([]);

    await grantOf(await bySection("7d"));
    await clear();
    expect((await byScope()).status).toBe(409);
    expect(await bells()).toEqual([]);
    expect(pushed).toEqual([]);
  });

  it("PATCH deny and every refused PATCH say nothing", async () => {
    const pending = await ask();
    expect((await patch(pending.id, "revoke")).status).toBe(409);
    expect((await patch(pending.id, "approve", OTHER)).status).toBe(404);
    expect((await patch(pending.id, "nonsense")).status).toBe(400);
    expect((await patch(pending.id, "deny")).status).toBe(200);
    expect((await patch(pending.id, "approve")).status).toBe(409);
    expect((await patch(pending.id, "deny")).status).toBe(409);
    expect((await patch(pending.id, "revoke")).status).toBe(409);
    expect(await bells()).toEqual([]);

    const active = await grantOf(await byScope());
    await clear();
    expect((await patch(active.id, "approve")).status).toBe(409);
    expect((await patch(active.id, "revoke", OTHER)).status).toBe(404);
    expect(await bells()).toEqual([]);
    expect(pushed).toEqual([]);
  });

  it("expiry says nothing, and a share after it says only that access was given", async () => {
    const old = await grantOf(await bySection("7d"));
    await clear();
    await raw`update care_access_grants set expires_at = now() - interval '1 minute' where id = ${old.id}`;
    as(OWNER);
    expect((await req("/care-access/grants")).status).toBe(200);
    as(VET);
    expect((await req(`/providers/${P1}/pets/${PET}/record`)).status).toBe(403);
    expect(await bells()).toEqual([]);
    await grantOf(await bySection("7d"));
    expect(await summary()).toEqual(team(GRANTED));
  });
});

describe("C. the phone push", () => {
  beforeEach(async () => {
    for (const u of [VET, NURSE, VET2, FORMER, OWNER]) {
      await raw`insert into device_push_tokens (user_id, token) values (${u.profileId}, ${`token-${u.username}`})`;
    }
  });
  const banners = () => pushed.map((m) => [m.to, m.title, m.body, m.data]);

  it("rings the team in their language with the same sentence", async () => {
    const grant = await grantOf(await byScope());
    const data = { type: GRANTED, subjectRef: String(PET) };
    expect(banners()).toEqual([
      ["token-vet", "Record access given", "Ana Gomez gave your team access to Rex's records until revoked.", data],
      ["token-nurse", "Te dieron acceso a una ficha",
        "Ana Gomez le dio a tu equipo acceso a la ficha de Rex hasta que lo revoque.", data],
    ]);
    pushed.length = 0;
    expect((await patch(grant.id, "revoke")).status).toBe(200);
    expect(pushed.map((m) => [m.to, m.title])).toEqual([
      ["token-vet", "Record access ended"],
      ["token-nurse", "Terminó el acceso a una ficha"],
    ]);
  });

  it.each([
    ["biz_booking", GRANTED],
    ["biz_booking_change", REVOKED],
  ])("switching %s off silences %s for that person and keeps the bell row", async (category, silenced) => {
    await raw`insert into notification_prefs (user_id, category, enabled) values (${NURSE.profileId}, ${category}, false)`;
    const grant = await grantOf(await byScope());
    expect((await patch(grant.id, "revoke")).status).toBe(200);
    expect(await summary()).toEqual([...team(GRANTED), ...team(REVOKED)]);
    const rang = pushed.filter((m) => m.to === "token-nurse").map((m) => m.data.type);
    expect(rang).toEqual([GRANTED, REVOKED].filter((t) => t !== silenced));
    expect(pushed.filter((m) => m.to === "token-vet")).toHaveLength(2);
  });
});

describe("D. a failing notification never fails the share or the revoke", () => {
  // Each function is made unavailable to the app role, so the statement using it fails inside the request.
  const BROKEN: [string, string, boolean][] = [
    ["finding the team", "app_provider_active_staff_ids(integer[])", false],
    ["writing the bell row", "app_notify(integer, integer, text, text, text)", false],
    ["reading the push switch", "app_notification_pref_enabled(integer, text)", true],
    ["reading the push tokens", "app_recipient_push_tokens(integer)", true],
  ];

  it.each(BROKEN)("%s", async (_name, signature, keepsBell) => {
    await raw`insert into device_push_tokens (user_id, token) values (${VET.profileId}, 'token-vet')`;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await raw.unsafe(`revoke execute on function ${signature} from pawpi_app`);
    try {
      const pending = await ask();
      expect((await patch(pending.id, "approve")).status).toBe(200);
      expect((await patch(pending.id, "revoke")).status).toBe(200);
      const scoped = await grantOf(await byScope());
      const sectioned = await grantOf(await bySection("7d"));
      expect((await patch(sectioned.id, "revoke")).status).toBe(200);
      await ask();
      expect((await bySection("30d")).status).toBe(200);

      const rows = await raw`select id, status from care_access_grants order by id`;
      expect(rows.map((r) => r.status)).toEqual(["revoked", "revoked", "revoked", "active"]);
      expect(rows[1].id).toBe(scoped.id);
      expect(await summary()).toEqual(
        keepsBell
          ? [GRANTED, REVOKED, GRANTED, GRANTED, REVOKED, GRANTED].flatMap(team)
          : [],
      );
      expect(pushed).toEqual([]);
    } finally {
      await raw.unsafe(`grant execute on function ${signature} to pawpi_app`);
      vi.restoreAllMocks();
    }
  });
});
