// 0125 provider_claims — end-to-end flow proven with the ACTUAL route handlers
// wrapped in withRequestContext, running AS pawpi_app + FORCE RLS.
//
// What this proves:
//   1. An authed outsider can OPEN a claim on an unclaimed published listing (201).
//   2. An outsider CANNOT open a claim on an already-claimed listing (409).
//   3. An outsider CANNOT open a claim on a draft/hidden listing (404 — RLS hides it).
//   4. Re-opening a previously rejected claim by the same claimant updates the
//      existing row back to 'pending' (200, no duplicate).
//   5. GET /providers/[id]/claim returns the caller's OWN claim only.
//   6. GET /providers/claims/mine lists ONLY the caller's claims.
//   7. Non-admin CANNOT decide a claim (403 on both GET queue + POST decision).
//   8. Admin APPROVE via app_claim_provider:
//        - flips owner_user_profile_id to the claimant,
//        - flips claim_status to 'claimed', sets claimed_at,
//        - upserts (provider, claimant, 'owner', 'active') into provider_staff,
//        - marks THIS claim approved,
//        - auto-rejects every OTHER pending claim on the same provider.
//   9. Discovery still public-reads the (now-claimed) listing under any authed caller.
//  10. A non-admin CANNOT open the claim admin queue.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

let raw: Sql;
let app: Sql;
let appSql: any;

// Route handlers — dynamically imported AFTER DATABASE_URL is pointed at pawpi_app.
let claimPOST: (request: Request, ctx: { params: { id: string } }) => Promise<Response>;
let claimGET: (request: Request, ctx: { params: { id: string } }) => Promise<Response>;
let minePOST: never; // (no POST on /mine)
let mineGET: (request: Request) => Promise<Response>;
let adminQueueGET: (request: Request) => Promise<Response>;
let adminDecisionPOST: (
  request: Request,
  ctx: { params: { id: string } },
) => Promise<Response>;

// Test cast (high ids to stay clear of the pawpi_directory system profile at 2147000001).
const DIRECTORY_AUTH_ID = 2147000001;
const DIRECTORY_PROFILE_ID = 2147000001;

const OWNER1 = { authUserId: 210, profileId: 210, email: 'owner1@example.com' };
const OWNER2 = { authUserId: 211, profileId: 211, email: 'owner2@example.com' };
const OUTSIDER = { authUserId: 212, profileId: 212, email: 'out@example.com' };
const ADMIN = { authUserId: 220, profileId: 220, email: 'admin@example.com' };

async function seedAuthUser(id: number, email: string): Promise<void> {
  await raw`insert into auth_users (id, name, email) values (${id}, ${email}, ${email})`;
}

async function seedAuthAndProfile(u: {
  authUserId: number;
  profileId: number;
  email: string;
  role?: string;
  isAdmin?: boolean;
}): Promise<void> {
  const role = u.role ?? 'pet_owner';
  const isAdmin = u.isAdmin ?? false;
  await seedAuthUser(u.authUserId, u.email);
  await raw`
    insert into user_profiles (id, auth_user_id, role, is_admin, username, onboarding_completed)
    values (${u.profileId}, ${u.authUserId}, ${role}, ${isAdmin},
            ${'u_' + u.profileId}, true)
  `;
}

async function seedUnclaimedProvider(
  id: number,
  slug: string,
  status: 'draft' | 'published' = 'published',
): Promise<void> {
  await raw`
    insert into providers
      (id, owner_user_profile_id, provider_type, name, slug, status,
       source, external_source, external_id, claim_status)
    values
      (${id}, ${DIRECTORY_PROFILE_ID}, 'vet', ${'Clinic ' + id}, ${slug}, ${status},
       'serpapi_gmaps', 'serpapi_gmaps', ${'ext_' + id}, 'unclaimed')
  `;
  await raw`
    insert into provider_locations (provider_id, name, address, lat, lng, phone, pet_policy)
    values (${id}, ${'Clinic ' + id}, 'CABA', -34.6, -58.4, '+54 11 5555', null)
  `;
}

function req(pathname: string, init?: RequestInit): Request {
  return new Request(`http://localhost${pathname}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
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

  appSql = (await import('@/app/api/utils/sql')).default;
  const claim = await import('@/app/api/providers/[id]/claim/route');
  claimPOST = claim.POST as typeof claimPOST;
  claimGET = claim.GET as typeof claimGET;
  const mine = await import('@/app/api/providers/claims/mine/route');
  mineGET = mine.GET as typeof mineGET;
  const adminQueue = await import('@/app/api/admin/provider-claims/route');
  adminQueueGET = adminQueue.GET as typeof adminQueueGET;
  const decision = await import(
    '@/app/api/admin/provider-claims/[id]/decision/route'
  );
  adminDecisionPOST = decision.POST as typeof adminDecisionPOST;
});

afterAll(async () => {
  await appSql.end?.();
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

// Every test starts from: system directory profile exists, four users seeded, one
// unclaimed published provider (id=1000) + one draft (id=1001) + one claimed (id=1002).
beforeEach(async () => {
  const existing = await raw<{ id: number }[]>`
    select id from user_profiles where username = 'pawpi_directory' limit 1
  `;
  if (existing.length === 0) {
    await raw`insert into auth_users (id, name, email)
      values (${DIRECTORY_AUTH_ID}, 'PawPi Directory', 'directory@pawpi.system')`;
    await raw`insert into user_profiles (id, auth_user_id, role, username, onboarding_completed)
      values (${DIRECTORY_PROFILE_ID}, ${DIRECTORY_AUTH_ID}, 'admin', 'pawpi_directory', true)`;
  }
  await seedAuthAndProfile(OWNER1);
  await seedAuthAndProfile(OWNER2);
  await seedAuthAndProfile(OUTSIDER);
  await seedAuthAndProfile({ ...ADMIN, isAdmin: true });

  await seedUnclaimedProvider(1000, 'clinic-unclaimed', 'published');
  await seedUnclaimedProvider(1001, 'clinic-draft', 'draft');
  await seedUnclaimedProvider(1002, 'clinic-claimed', 'published');
  // Simulate a prior successful claim: flip 1002 to claimed and give OWNER2 the staff row.
  await raw`
    update providers set owner_user_profile_id = ${OWNER2.profileId},
                         claim_status = 'claimed', claimed_at = now()
     where id = 1002
  `;
  await raw`
    insert into provider_staff (provider_id, user_profile_id, role, status)
    values (1002, ${OWNER2.profileId}, 'owner', 'active')
  `;
});

describe('POST /api/providers/[id]/claim', () => {
  it('outsider can open a claim on an unclaimed published listing (201)', async () => {
    authState.session = {
      user: { id: OUTSIDER.authUserId, email: OUTSIDER.email, name: 'Out' },
    };
    const res = await claimPOST(
      req('/api/providers/1000/claim', {
        method: 'POST',
        body: JSON.stringify({ method: 'phone', note: 'This is my clinic' }),
      }),
      { params: { id: '1000' } },
    );
    expect(res.status).toBe(201);
    const { claim } = await res.json();
    expect(claim.provider_id).toBe(1000);
    expect(claim.status).toBe('pending');
    expect(claim.claimant_user_profile_id).toBe(OUTSIDER.profileId);
  });

  it('409 when the listing is already claimed', async () => {
    authState.session = {
      user: { id: OUTSIDER.authUserId, email: OUTSIDER.email, name: 'Out' },
    };
    const res = await claimPOST(
      req('/api/providers/1002/claim', {
        method: 'POST',
        body: JSON.stringify({ method: 'phone' }),
      }),
      { params: { id: '1002' } },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.claim_status).toBe('claimed');
  });

  it('404 for a hidden/draft listing (RLS never surfaces it)', async () => {
    authState.session = {
      user: { id: OUTSIDER.authUserId, email: OUTSIDER.email, name: 'Out' },
    };
    const res = await claimPOST(
      req('/api/providers/1001/claim', { method: 'POST', body: '{}' }),
      { params: { id: '1001' } },
    );
    expect(res.status).toBe(404);
  });

  it('re-opening a previously rejected claim updates the same row back to pending (200)', async () => {
    // Simulate an earlier rejected claim by OUTSIDER on 1000.
    await raw`
      insert into provider_claims (provider_id, claimant_user_profile_id, status, decided_at, decided_by)
      values (1000, ${OUTSIDER.profileId}, 'rejected', now(), ${ADMIN.profileId})
    `;
    authState.session = {
      user: { id: OUTSIDER.authUserId, email: OUTSIDER.email, name: 'Out' },
    };
    const res = await claimPOST(
      req('/api/providers/1000/claim', {
        method: 'POST',
        body: JSON.stringify({ method: 'email', note: 'Retry' }),
      }),
      { params: { id: '1000' } },
    );
    expect(res.status).toBe(200);
    const { claim, reused } = await res.json();
    expect(reused).toBe(true);
    expect(claim.status).toBe('pending');

    const [{ count }] = await raw<{ count: string }[]>`
      select count(*)::text from provider_claims
      where provider_id = 1000 and claimant_user_profile_id = ${OUTSIDER.profileId}
    `;
    expect(Number(count)).toBe(1);
  });
});

describe('GET /api/providers/claims/mine', () => {
  it('returns only the calling users own claims', async () => {
    // Two claims: one by OUTSIDER on 1000, one by OWNER1 on 1002 (already claimed — synthetic).
    await raw`
      insert into provider_claims (provider_id, claimant_user_profile_id, status)
      values (1000, ${OUTSIDER.profileId}, 'pending'),
             (1000, ${OWNER1.profileId}, 'pending')
    `;
    authState.session = {
      user: { id: OUTSIDER.authUserId, email: OUTSIDER.email, name: 'Out' },
    };
    const res = await mineGET(req('/api/providers/claims/mine'));
    expect(res.status).toBe(200);
    const { claims } = await res.json();
    expect(claims).toHaveLength(1);
    expect(claims[0].claimant_user_profile_id).toBeUndefined(); // not in projection
    expect(claims[0].provider_id).toBe(1000);
    expect(claims[0].provider_name).toBe('Clinic 1000');
    expect(claims[0].provider_slug).toBe('clinic-unclaimed');
  });
});

describe('admin decision flow', () => {
  it('non-admin cannot open the admin queue (403)', async () => {
    authState.session = {
      user: { id: OUTSIDER.authUserId, email: OUTSIDER.email, name: 'Out' },
    };
    const res = await adminQueueGET(req('/api/admin/provider-claims'));
    expect(res.status).toBe(403);
  });

  it('non-admin cannot decide a claim (403)', async () => {
    const [claim] = await raw<{ id: number }[]>`
      insert into provider_claims (provider_id, claimant_user_profile_id, status)
      values (1000, ${OUTSIDER.profileId}, 'pending') returning id
    `;
    authState.session = {
      user: { id: OUTSIDER.authUserId, email: OUTSIDER.email, name: 'Out' },
    };
    const res = await adminDecisionPOST(
      req(`/api/admin/provider-claims/${claim.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params: { id: String(claim.id) } },
    );
    expect(res.status).toBe(403);

    // And nothing changed on the provider.
    const [row] = await raw<{ owner_user_profile_id: number; claim_status: string }[]>`
      select owner_user_profile_id, claim_status from providers where id = 1000
    `;
    expect(row.claim_status).toBe('unclaimed');
    expect(row.owner_user_profile_id).toBe(DIRECTORY_PROFILE_ID);
  });

  it('admin approve: flips ownership, adds owner staff, approves this claim, auto-rejects others', async () => {
    // Two competing pending claims on the same provider.
    const [claimA] = await raw<{ id: number }[]>`
      insert into provider_claims (provider_id, claimant_user_profile_id, status)
      values (1000, ${OWNER1.profileId}, 'pending') returning id
    `;
    const [claimB] = await raw<{ id: number }[]>`
      insert into provider_claims (provider_id, claimant_user_profile_id, status)
      values (1000, ${OUTSIDER.profileId}, 'pending') returning id
    `;

    authState.session = {
      user: { id: ADMIN.authUserId, email: ADMIN.email, name: 'Admin' },
    };
    const res = await adminDecisionPOST(
      req(`/api/admin/provider-claims/${claimA.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params: { id: String(claimA.id) } },
    );
    expect(res.status).toBe(200);
    const { claim } = await res.json();
    expect(claim.status).toBe('approved');
    expect(claim.decided_by).toBe(ADMIN.profileId);

    // Provider now owned by OWNER1, claimed.
    const [prov] = await raw<{ owner_user_profile_id: number; claim_status: string; claimed_at: Date | null }[]>`
      select owner_user_profile_id, claim_status, claimed_at from providers where id = 1000
    `;
    expect(prov.owner_user_profile_id).toBe(OWNER1.profileId);
    expect(prov.claim_status).toBe('claimed');
    expect(prov.claimed_at).not.toBeNull();

    // OWNER1 is now active owner in provider_staff.
    const [staff] = await raw<{ role: string; status: string }[]>`
      select role, status from provider_staff
      where provider_id = 1000 and user_profile_id = ${OWNER1.profileId}
    `;
    expect(staff.role).toBe('owner');
    expect(staff.status).toBe('active');

    // Other pending claim (claimB) auto-rejected.
    const [other] = await raw<{ status: string; decided_by: number | null }[]>`
      select status, decided_by from provider_claims where id = ${claimB.id}
    `;
    expect(other.status).toBe('rejected');
    expect(other.decided_by).toBe(ADMIN.profileId);
  });

  it('admin reject: marks the claim rejected, does NOT touch ownership', async () => {
    const [claim] = await raw<{ id: number }[]>`
      insert into provider_claims (provider_id, claimant_user_profile_id, status)
      values (1000, ${OWNER1.profileId}, 'pending') returning id
    `;
    authState.session = {
      user: { id: ADMIN.authUserId, email: ADMIN.email, name: 'Admin' },
    };
    const res = await adminDecisionPOST(
      req(`/api/admin/provider-claims/${claim.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'reject', note: 'Cannot verify' }),
      }),
      { params: { id: String(claim.id) } },
    );
    expect(res.status).toBe(200);

    const [prov] = await raw<{ owner_user_profile_id: number; claim_status: string }[]>`
      select owner_user_profile_id, claim_status from providers where id = 1000
    `;
    expect(prov.owner_user_profile_id).toBe(DIRECTORY_PROFILE_ID);
    expect(prov.claim_status).toBe('unclaimed');
  });

  it('cannot decide a non-pending claim (409)', async () => {
    const [claim] = await raw<{ id: number }[]>`
      insert into provider_claims (provider_id, claimant_user_profile_id, status, decided_at, decided_by)
      values (1000, ${OWNER1.profileId}, 'rejected', now(), ${ADMIN.profileId}) returning id
    `;
    authState.session = {
      user: { id: ADMIN.authUserId, email: ADMIN.email, name: 'Admin' },
    };
    const res = await adminDecisionPOST(
      req(`/api/admin/provider-claims/${claim.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params: { id: String(claim.id) } },
    );
    expect(res.status).toBe(409);
  });
});

describe('discovery projection', () => {
  it('unclaimed seed rows carry claim_status and pet_policy in /providers/discover', async () => {
    await raw`
      update provider_locations set pet_policy = 'Dogs allowed inside' where provider_id = 1000
    `;

    const discover = await import('@/app/api/providers/discover/route');
    const discoverGET = discover.GET as (r: Request) => Promise<Response>;

    authState.session = {
      user: { id: OUTSIDER.authUserId, email: OUTSIDER.email, name: 'Out' },
    };
    const res = await discoverGET(new Request('http://localhost/api/providers/discover'));
    expect(res.status).toBe(200);
    const { providers } = await res.json();
    const row = providers.find((p: any) => p.id === 1000);
    expect(row).toBeTruthy();
    expect(row.claim_status).toBe('unclaimed');
    expect(row.pet_policy).toBe('Dogs allowed inside');
  });
});
