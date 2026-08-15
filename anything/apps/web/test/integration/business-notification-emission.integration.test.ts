// BN2 PR2 — business notification EMISSION, proven through the REAL Hono router (api.request) on
// real Postgres as pawpi_app.
//
// Proves that provider-facing events write a `notifications` bell row to the provider's OWNER +
// active STAFF (via app_provider_active_staff_ids, 0093), with the right type, the actor set to the
// client (never self-notify), and never leaking across businesses:
//   • adoption application submit → biz_adoption_application (owner + staff)
//   • client cancels a booking     → biz_booking_change      (owner + staff)
//   • chat message (client→biz)    → biz_message             (owner + staff); staff→client emits none
//   • new follower                 → biz_follow              (OWNER ONLY)
//   • paw on a business post        → biz_post_engagement    (owner + staff), IN_APP_ONLY (a bell)

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
  seedAdoptableListing,
  seedThread,
  seedGeneralBooking,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

// The business team: OWNER (also enrolled as active staff) + one extra active STAFF.
const OWN = { authUserId: 1, profileId: 1, username: "bizowner" };
const STAFF = { authUserId: 2, profileId: 2, username: "bizstaff" };
// The client (an outsider owner with a pet) who triggers the events.
const CLIENT = { authUserId: 3, profileId: 3, username: "client", petId: 30, petName: "Rex" };
// A second, unrelated business (cross-leak control).
const OTHEROWN = { authUserId: 4, profileId: 4, username: "otherbiz" };

const PROVIDER = 10;
const OTHER_PROVIDER = 20;
const LISTING = 100;
const POST = 200;
const THREAD = 300;
const APPT = 400;

let raw: Sql;
let app: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// The bell rows a given event produced, newest first — read as superuser (RLS-free) so we can
// assert the FULL recipient set regardless of whose identity created them.
async function notifsOfType(type: string) {
  return raw`
    SELECT recipient_user_id, actor_user_id, type, subject_ref
    FROM notifications WHERE type = ${type}
    ORDER BY recipient_user_id
  `;
}
const recipientsOf = (rows: any[]) => rows.map((r) => r.recipient_user_id).sort((a, b) => a - b);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ""),
    username: "pawpi_app",
    password: "pawpi_app",
    max: 1,
    onnotice: () => {},
  });
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedUser(raw, OWN);
  await seedUser(raw, STAFF);
  await seedOwnerWithPet(raw, CLIENT);
  await seedUser(raw, OTHEROWN);

  // The business: published, owner enrolled as active staff + one extra active staff.
  await seedProvider(raw, { providerId: PROVIDER, ownerUserProfileId: OWN.profileId, slug: "biz", status: "published" });
  await seedStaff(raw, { providerId: PROVIDER, userProfileId: OWN.profileId, role: "owner", status: "active" });
  await seedStaff(raw, { providerId: PROVIDER, userProfileId: STAFF.profileId, role: "vet", status: "active" });
  await seedCapability(raw, { providerId: PROVIDER, capability: "adoption" });

  // A second, unrelated published business (its owner must NEVER receive our events).
  await seedProvider(raw, { providerId: OTHER_PROVIDER, ownerUserProfileId: OTHEROWN.profileId, slug: "otherbiz", status: "published" });
  await seedStaff(raw, { providerId: OTHER_PROVIDER, userProfileId: OTHEROWN.profileId, role: "owner", status: "active" });
});

describe("adoption application submit → biz_adoption_application (owner + staff)", () => {
  it("notifies the shelter's owner + staff, actor = the applicant, not the other business", async () => {
    await seedAdoptableListing(raw, { listingId: LISTING, providerId: PROVIDER, status: "available" });
    authState.session = sessionFor(CLIENT.authUserId);
    const res = await apiReq(`/adoption/applications`, "POST", { listing_id: LISTING });
    expect(res.status).toBe(201);

    const rows = await notifsOfType("biz_adoption_application");
    expect(recipientsOf(rows)).toEqual([OWN.profileId, STAFF.profileId]);
    expect(rows.every((r: any) => r.actor_user_id === CLIENT.profileId)).toBe(true);
    // The unrelated business's owner got nothing.
    expect(recipientsOf(rows)).not.toContain(OTHEROWN.profileId);
  });
});

describe("client cancels a booking → biz_booking_change (owner + staff)", () => {
  it("DELETE of the client's provider appointment notifies the provider team", async () => {
    await seedGeneralBooking(raw, {
      apptId: APPT,
      petId: CLIENT.petId,
      ownerUserId: CLIENT.profileId,
      providerId: PROVIDER,
      bookingStatus: "confirmed",
    });
    authState.session = sessionFor(CLIENT.authUserId);
    const res = await apiReq(`/vet-appointments?id=${APPT}`, "DELETE");
    expect(res.status).toBe(200);

    const rows = await notifsOfType("biz_booking_change");
    expect(recipientsOf(rows)).toEqual([OWN.profileId, STAFF.profileId]);
    expect(rows.every((r: any) => r.actor_user_id === CLIENT.profileId)).toBe(true);
  });
});

describe("chat message → biz_message (client→business only)", () => {
  it("a CLIENT message notifies the provider team; a STAFF reply notifies no one (out of scope)", async () => {
    await seedThread(raw, { threadId: THREAD, ownerUserId: CLIENT.profileId, providerId: PROVIDER });

    // Client (thread owner) messages the business → biz_message to owner + staff.
    authState.session = sessionFor(CLIENT.authUserId);
    let res = await apiReq(`/threads/${THREAD}/messages`, "POST", { body: "Hi, is my pup ready?" });
    expect(res.status).toBe(201);
    let rows = await notifsOfType("biz_message");
    expect(recipientsOf(rows)).toEqual([OWN.profileId, STAFF.profileId]);
    expect(rows.every((r: any) => r.actor_user_id === CLIENT.profileId)).toBe(true);

    // Staff replies → the reverse direction emits NO biz_message (owner-facing, out of BN2 scope).
    authState.session = sessionFor(STAFF.authUserId);
    res = await apiReq(`/threads/${THREAD}/messages`, "POST", { body: "Almost!" });
    expect(res.status).toBe(201);
    rows = await notifsOfType("biz_message");
    expect(rows.length).toBe(2); // unchanged — still just the two from the client's message
  });
});

describe("new follower → biz_follow (OWNER ONLY)", () => {
  it("notifies only the provider owner, not the staff, on a genuinely new follow", async () => {
    authState.session = sessionFor(CLIENT.authUserId);
    const res = await apiReq(`/providers/${PROVIDER}/follow`, "POST");
    expect(res.status).toBe(200);

    const rows = await notifsOfType("biz_follow");
    expect(recipientsOf(rows)).toEqual([OWN.profileId]); // owner only — NOT the staff
    expect(rows[0].actor_user_id).toBe(CLIENT.profileId);

    // A repeat follow (idempotent) does NOT re-notify.
    await apiReq(`/providers/${PROVIDER}/follow`, "POST");
    expect((await notifsOfType("biz_follow")).length).toBe(1);
  });
});

describe("paw on a business post → biz_post_engagement (owner + staff, in-app-only)", () => {
  it("a client's paw writes a bell to the provider team; a repeat paw does not re-notify", async () => {
    await raw`
      insert into provider_posts (id, provider_id, author_user_id, body)
      values (${POST}, ${PROVIDER}, ${OWN.profileId}, 'New puppy pics!')
    `;
    authState.session = sessionFor(CLIENT.authUserId);
    let res = await apiReq(`/providers/${PROVIDER}/posts/${POST}/paw`, "POST");
    expect(res.status).toBe(200);

    const rows = await notifsOfType("biz_post_engagement");
    expect(recipientsOf(rows)).toEqual([OWN.profileId, STAFF.profileId]);
    expect(rows.every((r: any) => r.actor_user_id === CLIENT.profileId)).toBe(true);

    // Re-paw (idempotent, no new row) → no second notification.
    res = await apiReq(`/providers/${PROVIDER}/posts/${POST}/paw`, "POST");
    expect(res.status).toBe(200);
    expect((await notifsOfType("biz_post_engagement")).length).toBe(2);
  });
});
