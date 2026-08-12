// Adoption applications v2 (migration 0086) — proven through the REAL Hono router (api.request)
// against the embedded Postgres as pawpi_app (FORCE RLS like production). Covers the ticket's
// required integration surface:
//   1. per-listing QUESTIONS persist — create a listing with application_questions; the provider
//      list + the public single-listing GET + the owner browse all return them.
//   2. ANSWERS roundtrip — an owner submits an application with answers; the provider list returns
//      the answers + the applicant's name + email (the widened public-contact projection).
//   3. NOTIFY — a status change (under_review / approved / declined) inserts an applicant
//      notification of the matching adoption_* type, deep-linkable to the application.
//   4. RE-LIST — putting a listing back up flips it to available + re-opens the approved
//      application to under_review, under provider-admin gating (a cross-provider caller is 403).
//
// Mirrors provider-follows.integration (auth mock + api.request + asApp) — the same real-router
// pattern the ticket calls for. No static-vs-[param] shadowing: the new /relist and the existing
// segments are all exercised by URL here.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
  seedAdoptableListing,
  seedAdoptionApplication,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: 'adopter' }; // an applicant
const B = { authUserId: 2, profileId: 2, username: 'otheradopter' }; // another applicant
const SOWN = { authUserId: 3, profileId: 3, username: 'shelterown' }; // shelter owner/admin
const SQ = { authUserId: 4, profileId: 4, username: 'otherprov' }; // a different provider's admin

const SHELTER = 10; // published shelter, holds 'adoption'
const OTHER = 30; // a different published provider (cross-provider control)
const LISTING = 100;

let raw: Sql;
let app: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });

function apiReq(path: string, method = 'GET', body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
    max: 1,
    onnotice: () => {},
  });
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  ({ api } = (await import('../../__create/route-builder')) as any);
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
  await seedUser(raw, A);
  await seedUser(raw, B);
  await seedUser(raw, SOWN);
  await seedUser(raw, SQ);

  await seedProvider(raw, { providerId: SHELTER, ownerUserProfileId: SOWN.profileId, slug: 'shelter', status: 'published' });
  await seedStaff(raw, { providerId: SHELTER, userProfileId: SOWN.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: SHELTER, capability: 'adoption' });

  // A different published provider with an adoption capability + its own admin (cross control).
  await seedProvider(raw, { providerId: OTHER, ownerUserProfileId: SQ.profileId, slug: 'otherprov', status: 'published' });
  await seedStaff(raw, { providerId: OTHER, userProfileId: SQ.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: OTHER, capability: 'adoption' });

  await seedAdoptableListing(raw, { listingId: LISTING, providerId: SHELTER });
});

describe('adoption v2 — per-listing questions persist (real router)', () => {
  it('create with application_questions → provider list + public single GET + browse all return them', async () => {
    authState.session = sessionFor(SOWN.authUserId);
    // Create a fresh listing carrying questions.
    let res = await apiReq(`/providers/${SHELTER}/adoptable-listings`, 'POST', {
      name: 'Rex',
      application_questions: ['Best contact number', 'Do you have a yard?'],
    });
    expect(res.status).toBe(201);
    const created = (await res.json()).listing;
    expect(created.application_questions).toEqual(['Best contact number', 'Do you have a yard?']);

    // Provider management list returns them.
    res = await apiReq(`/providers/${SHELTER}/adoptable-listings`);
    const list = (await res.json()).listings;
    const row = list.find((l: any) => l.id === created.id);
    expect(row.application_questions).toEqual(['Best contact number', 'Do you have a yard?']);

    // Public single-listing GET (deep-link) returns them.
    res = await apiReq(`/providers/${SHELTER}/adoptable-listings/${created.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).listing.application_questions).toEqual([
      'Best contact number',
      'Do you have a yard?',
    ]);

    // Owner browse returns them for the apply form.
    authState.session = sessionFor(A.authUserId);
    res = await apiReq(`/adoption/listings?provider_id=${SHELTER}`);
    const browse = (await res.json()).listings;
    const dog = browse.find((l: any) => l.id === created.id);
    expect(dog.application_questions).toEqual(['Best contact number', 'Do you have a yard?']);
  });

  it('blank/malformed questions are dropped; a listing with none is unaffected', async () => {
    authState.session = sessionFor(SOWN.authUserId);
    const res = await apiReq(`/providers/${SHELTER}/adoptable-listings`, 'POST', {
      name: 'Bud',
      application_questions: ['  Keep me  ', '', '   ', 42, null],
    });
    expect(res.status).toBe(201);
    expect((await res.json()).listing.application_questions).toEqual(['Keep me']);
  });
});

describe('adoption v2 — answers roundtrip + applicant contact (real router)', () => {
  it('owner submits answers; provider list returns answers + applicant name + email', async () => {
    // Owner applies with structured answers.
    authState.session = sessionFor(A.authUserId);
    let res = await apiReq(`/adoption/applications`, 'POST', {
      listing_id: LISTING,
      answers: [
        { question: 'Best contact number', answer: '+54 11 5555 1234' },
        { question: 'Do you have a yard?', answer: 'Yes, fenced' },
      ],
    });
    expect(res.status).toBe(201);

    // Shelter staff review list returns the answers + the applicant's public contact fields.
    authState.session = sessionFor(SOWN.authUserId);
    res = await apiReq(`/providers/${SHELTER}/adoption-applications`);
    expect(res.status).toBe(200);
    const apps = (await res.json()).applications;
    expect(apps).toHaveLength(1);
    const appRow = apps[0];
    expect(appRow.applicant_email).toBe('adopter@example.com');
    expect(appRow.applicant_name).toBe('adopter');
    expect(appRow.answers).toEqual([
      { question: 'Best contact number', answer: '+54 11 5555 1234' },
      { question: 'Do you have a yard?', answer: 'Yes, fenced' },
    ]);
  });
});

describe('adoption v2 — one application per (applicant, listing), including after a decline (2.95)', () => {
  it('a first apply 201s, a duplicate 409s, and re-apply after a DECLINE still 409s', async () => {
    // First application → 201.
    authState.session = sessionFor(A.authUserId);
    let res = await apiReq(`/adoption/applications`, 'POST', { listing_id: LISTING });
    expect(res.status).toBe(201);
    const appId = (await res.json()).application.id;

    // Immediate duplicate (still 'submitted') → 409.
    res = await apiReq(`/adoption/applications`, 'POST', { listing_id: LISTING });
    expect(res.status).toBe(409);
    let body = await res.json();
    expect(body.already_applied).toBe(true);
    expect(body.status).toBe('submitted');

    // The shelter DECLINES the application.
    authState.session = sessionFor(SOWN.authUserId);
    res = await apiReq(`/providers/${SHELTER}/adoption-applications/${appId}`, 'PATCH', {
      status: 'declined',
    });
    expect(res.status).toBe(200);

    // The partial unique index (0038) would ALLOW a second row now (status <> 'declined'); the
    // route guard must still reject it — no re-apply for the same dog after a decline (the prod bug).
    authState.session = sessionFor(A.authUserId);
    res = await apiReq(`/adoption/applications`, 'POST', { listing_id: LISTING });
    expect(res.status).toBe(409);
    body = await res.json();
    expect(body.already_applied).toBe(true);
    expect(body.status).toBe('declined');

    // Exactly one application row exists for (A, LISTING) — the duplicate never inserted.
    const rows = await raw`
      select count(*)::int as n from adoption_applications
      where applicant_owner_user_id = ${A.profileId} and listing_id = ${LISTING}
    `;
    expect(rows[0].n).toBe(1);
  });

  it("a DIFFERENT owner's first application for the same listing still 201s", async () => {
    authState.session = sessionFor(A.authUserId);
    let res = await apiReq(`/adoption/applications`, 'POST', { listing_id: LISTING });
    expect(res.status).toBe(201);

    authState.session = sessionFor(B.authUserId);
    res = await apiReq(`/adoption/applications`, 'POST', { listing_id: LISTING });
    expect(res.status).toBe(201); // B has no prior application → allowed
  });
});

describe('adoption v2 — applicant notification on status change (real router)', () => {
  const APP = 500;
  beforeEach(async () => {
    await seedAdoptionApplication(raw, {
      applicationId: APP,
      listingId: LISTING,
      providerId: SHELTER,
      applicantUserId: A.profileId,
    });
  });

  it('under_review inserts an adoption_under_review notification for the applicant', async () => {
    authState.session = sessionFor(SOWN.authUserId);
    const res = await apiReq(`/providers/${SHELTER}/adoption-applications/${APP}`, 'PATCH', {
      status: 'under_review',
    });
    expect(res.status).toBe(200);

    const notifs = await raw`
      select type, subject_ref, recipient_user_id, actor_user_id
      from notifications where recipient_user_id = ${A.profileId}
    `;
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('adoption_under_review');
    expect(notifs[0].subject_ref).toBe(String(APP));
    expect(notifs[0].recipient_user_id).toBe(A.profileId);
    expect(notifs[0].actor_user_id).toBe(SOWN.profileId);
  });

  it('declined inserts an adoption_declined notification', async () => {
    authState.session = sessionFor(SOWN.authUserId);
    await apiReq(`/providers/${SHELTER}/adoption-applications/${APP}`, 'PATCH', { status: 'declined' });
    const [n] = await raw`select type from notifications where recipient_user_id = ${A.profileId}`;
    expect(n.type).toBe('adoption_declined');
  });

  it('approved (the transfer) inserts an adoption_approved notification', async () => {
    authState.session = sessionFor(SOWN.authUserId);
    const res = await apiReq(`/providers/${SHELTER}/adoption-applications/${APP}`, 'PATCH', {
      status: 'approved',
    });
    expect(res.status).toBe(200);
    const [n] = await raw`select type, subject_ref from notifications where recipient_user_id = ${A.profileId}`;
    expect(n.type).toBe('adoption_approved');
    expect(n.subject_ref).toBe(String(APP));
  });
});

describe('adoption v2 — re-list (undo a mistaken accept) (real router)', () => {
  const APP = 600;
  beforeEach(async () => {
    // A listing that was adopted with an approved application (the mistaken-accept state).
    await seedAdoptableListing(raw, { listingId: 200, providerId: SHELTER, status: 'adopted' });
    await seedAdoptionApplication(raw, {
      applicationId: APP,
      listingId: 200,
      providerId: SHELTER,
      applicantUserId: A.profileId,
      status: 'approved',
    });
  });

  it('re-list flips the listing → available AND re-opens the approved application → under_review', async () => {
    authState.session = sessionFor(SOWN.authUserId);
    const res = await apiReq(`/providers/${SHELTER}/adoptable-listings/200/relist`, 'POST');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.status).toBe('available');
    expect(body.reopened_application_ids).toEqual([APP]);

    const [listing] = await raw`select status from adoptable_listings where id = 200`;
    expect(listing.status).toBe('available');
    const [appRow] = await raw`select status from adoption_applications where id = ${APP}`;
    expect(appRow.status).toBe('under_review');
  });

  it('a DIFFERENT provider\'s admin cannot re-list the shelter\'s listing (403; unchanged)', async () => {
    authState.session = sessionFor(SQ.authUserId);
    const res = await apiReq(`/providers/${SHELTER}/adoptable-listings/200/relist`, 'POST');
    expect(res.status).toBe(403);
    // The listing + application are untouched.
    const [listing] = await raw`select status from adoptable_listings where id = 200`;
    expect(listing.status).toBe('adopted');
    const [appRow] = await raw`select status from adoption_applications where id = ${APP}`;
    expect(appRow.status).toBe('approved');
  });

  it('a guest cannot re-list (401)', async () => {
    authState.session = null;
    const res = await apiReq(`/providers/${SHELTER}/adoptable-listings/200/relist`, 'POST');
    expect(res.status).toBe(401);
  });
});
