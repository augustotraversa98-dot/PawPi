// RLS R2g — the GAP CLOSURE (docs/rls-hardening.md §R2g), proven on the REAL tables acting
// AS pawpi_app. Companion to pets-rls (R2a), social-rls (R2b), owner-private-rls (R2c),
// provider-records-rls (R2d), provider-business-rls (R2e), care-access-rls (R2f).
//
// The R3 cutover found 7 public tables on LIVE Supabase with RLS ENABLED but ZERO policies
// (pawpi_app would read zero rows). 0026 closes the gap:
//   (1) DISABLE RLS on the 5 auth/identity infra tables — they sit OUTSIDE the RLS model
//       because the app reads them BEFORE app.current_user_id exists (resolveUserId
//       translates the auth id → user_profiles.id; the Auth.js adapter reads auth_* at
//       login). Proven here: as pawpi_app, user_profiles + auth_users are READABLE.
//   (2) ADD owner/participant policies to the 2 social-walk DATA tables, mirroring the
//       routes (src/app/api/social-walks/**) EXACTLY — no wider.
// Plus a COMPLETENESS GUARD: every base table in schema 'public' is either ENABLE+FORCE RLS
// with >=1 policy, or in the documented RLS_EXEMPT allowlist — so this class of gap (an
// RLS-on table with no policy, or a NEW unclassified table) cannot recur in the harness.
//
// HARNESS NUANCE: on Supabase these 5 auth/identity tables have RLS ENABLED (Supabase's own
// setup); our migrations never enabled it, so in this embedded-postgres harness they are RLS
// OFF — the harness cannot reproduce the "RLS-on-no-policy" Supabase state for them (the
// DISABLE is a no-op here). What the harness CAN and DOES prove: the social_walks policies,
// that pawpi_app can read the identity tables, and the completeness invariant.
//
// As in the sibling suites we connect a SECOND porsager client AS pawpi_app (NOBYPASSRLS),
// set app.current_user_id per transaction, and assert allowed-vs-ZERO. The harness owner is
// a superuser, so FORCE RLS constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedSocialWalk,
  seedJoinRequest,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' }; // walk owner
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' }; // requester (pending)
const C = { authUserId: 3, profileId: 3, username: 'ownerc', petId: 3, petName: 'Coco' }; // requester (approved)
const D = { authUserId: 4, profileId: 4, username: 'ownerd', petId: 4, petName: 'Duke' }; // authed outsider
const WALK_ID = 1;

let raw: Sql;
let app: Sql;

/** Run `fn` as pawpi_app inside one transaction stamped with `userId` (or no id). */
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

const ids = (rows: any[]) => rows.map((r: any) => r.id).sort((a, b) => a - b);

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
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

// Four owners + pets; A owns one discoverable (nearby_pets, scheduled) walk.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedOwnerWithPet(raw, C);
  await seedOwnerWithPet(raw, D);
  await seedSocialWalk(raw, { walkId: WALK_ID, petId: A.petId, ownerUserId: A.profileId });
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. social_walks — read = any authed (discovery + join-request reads any scheduled walk);
//    write = owner only.
describe('RLS R2g — social_walks (as pawpi_app)', () => {
  it('any authed user reads the walk (owner, non-owner, outsider)', async () => {
    for (const uid of [A.profileId, B.profileId, D.profileId]) {
      await asApp(uid, async (tx) => {
        expect(ids(await tx`select id from social_walks`)).toEqual([WALK_ID]);
      });
    }
  });

  it('no identity → zero (deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from social_walks`).toHaveLength(0);
    });
  });

  it('owner A creates their own walk (WITH CHECK passes)', async () => {
    // Explicit id: the seeded walk used an explicit id, which does NOT advance the identity
    // sequence, so an auto-id insert here would collide on the pkey (the known PawPi gotcha).
    const created = await asApp(A.profileId, (tx) => tx`
      insert into social_walks (id, pet_id, owner_user_id, walk_name, scheduled_at, visibility, status)
      values (99, ${A.petId}, ${A.profileId}, 'new-walk', '2026-09-01T09:00:00Z', 'nearby_pets', 'scheduled')
      returning id, owner_user_id
    `);
    expect(created).toHaveLength(1);
    expect(created[0].owner_user_id).toBe(A.profileId);
  });

  it('a non-owner (B) cannot create a walk owned by A (WITH CHECK reject)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into social_walks (pet_id, owner_user_id, walk_name, scheduled_at, visibility, status)
        values (${A.petId}, ${A.profileId}, 'forged', '2026-09-01T09:00:00Z', 'nearby_pets', 'scheduled')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a non-owner (B) UPDATEs / DELETEs ZERO of A\'s walk; owner A can', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update social_walks set walk_name = 'hijacked' returning id`).toHaveLength(0);
      expect(await tx`delete from social_walks returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from social_walks`;
    expect(n).toBe(1); // untouched

    await asApp(A.profileId, async (tx) => {
      expect(await tx`update social_walks set walk_name = 'renamed' returning id`).toHaveLength(1);
      expect(await tx`delete from social_walks returning id`).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. social_walk_join_requests — per-command: SELECT (own OR approved OR walk owner),
//    INSERT (requester), UPDATE (walk owner), DELETE (none).
describe('RLS R2g — social_walk_join_requests SELECT (as pawpi_app)', () => {
  // r1 = B's PENDING request; r2 = C's APPROVED request — both on A's walk.
  beforeEach(async () => {
    await seedJoinRequest(raw, {
      requestId: 1, walkId: WALK_ID, requesterUserId: B.profileId, requesterPetId: B.petId, status: 'pending',
    });
    await seedJoinRequest(raw, {
      requestId: 2, walkId: WALK_ID, requesterUserId: C.profileId, requesterPetId: C.petId, status: 'approved',
    });
  });

  it('the walk owner (A) reads ALL requests for their walk', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from social_walk_join_requests`)).toEqual([1, 2]);
    });
  });

  it('a requester (B) reads their OWN pending request + the public APPROVED one', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(ids(await tx`select id from social_walk_join_requests`)).toEqual([1, 2]);
    });
  });

  it('an authed outsider (D) reads ONLY approved rows — pending is hidden', async () => {
    await asApp(D.profileId, async (tx) => {
      // Mirrors the count subqueries: approved participants are visible to any authed user,
      // a pending request is not.
      expect(ids(await tx`select id from social_walk_join_requests`)).toEqual([2]);
    });
  });

  it('no identity → zero', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from social_walk_join_requests`).toHaveLength(0);
    });
  });
});

describe('RLS R2g — social_walk_join_requests INSERT (as pawpi_app)', () => {
  it('a requester (B) creates their OWN request', async () => {
    const created = await asApp(B.profileId, (tx) => tx`
      insert into social_walk_join_requests
        (social_walk_id, requester_user_id, requester_pet_id, status)
      values (${WALK_ID}, ${B.profileId}, ${B.petId}, 'pending')
      returning id, requester_user_id
    `);
    expect(created).toHaveLength(1);
    expect(created[0].requester_user_id).toBe(B.profileId);
  });

  it('B cannot forge a request attributed to ANOTHER requester (C) — WITH CHECK reject', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into social_walk_join_requests
          (social_walk_id, requester_user_id, requester_pet_id, status)
        values (${WALK_ID}, ${C.profileId}, ${C.petId}, 'pending')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no identity → INSERT reject', async () => {
    await expect(
      asApp(null, (tx) => tx`
        insert into social_walk_join_requests
          (social_walk_id, requester_user_id, requester_pet_id, status)
        values (${WALK_ID}, ${B.profileId}, ${B.petId}, 'pending')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('RLS R2g — social_walk_join_requests UPDATE / DELETE (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedJoinRequest(raw, {
      requestId: 1, walkId: WALK_ID, requesterUserId: B.profileId, requesterPetId: B.petId, status: 'pending',
    });
  });

  it('the walk owner (A) approves a pending request with RETURNING *', async () => {
    await asApp(A.profileId, async (tx) => {
      const approved = await tx`
        update social_walk_join_requests set status = 'approved', updated_at = now()
        where id = 1 and social_walk_id = ${WALK_ID} and status = 'pending'
        returning id, status
      `;
      expect(approved).toHaveLength(1);
      expect(approved[0].status).toBe('approved');
    });
  });

  it('the requester (B) canNOT UPDATE the request — owner-only (no self-edit route)', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`
        update social_walk_join_requests set status = 'approved' returning id
      `).toHaveLength(0);
    });
    const [{ status }] = await raw`select status from social_walk_join_requests limit 1`;
    expect(status).toBe('pending'); // untouched
  });

  it('a non-participant (D) UPDATEs ZERO', async () => {
    await asApp(D.profileId, async (tx) => {
      expect(await tx`
        update social_walk_join_requests set status = 'declined' returning id
      `).toHaveLength(0);
    });
  });

  it('DELETE is denied for everyone (no delete route → no policy → zero under FORCE)', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await tx`delete from social_walk_join_requests returning id`).toHaveLength(0);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`delete from social_walk_join_requests returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from social_walk_join_requests`;
    expect(n).toBe(1); // survived both
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Identity bootstrap — the auth/identity infra tables are RLS-EXEMPT (DISABLE in 0026),
//    so pawpi_app can read them BEFORE app.current_user_id is set. This is what lets
//    resolveUserId translate the auth id → user_profiles.id (and the Auth.js adapter read
//    sessions) once the app connects as pawpi_app at the R3 cutover.
describe('RLS R2g — auth/identity tables are readable as pawpi_app (RLS disabled)', () => {
  it('user_profiles + auth_users resolve even with NO identity in scope', async () => {
    await asApp(null, async (tx) => {
      const profiles = await tx`
        select id, auth_user_id from user_profiles where auth_user_id = ${A.authUserId}
      `;
      expect(profiles).toHaveLength(1);
      expect(profiles[0].id).toBe(A.profileId);

      const users = await tx`select id from auth_users where id = ${A.authUserId}`;
      expect(users).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. COMPLETENESS GUARD — every base table in schema 'public' must be classified: either
//    ENABLE+FORCE RLS with >=1 policy, or in the documented RLS_EXEMPT allowlist. FAILs
//    naming any table that is RLS-enabled-without-a-policy, forced-without-a-policy, or not
//    covered by either bucket — so a NEW table cannot silently regress the model, and the
//    R3 gap (RLS-on-no-policy) cannot recur in the harness. The analog of the R1-rollout
//    route-wrap completeness guard (src/app/api/rls-rollout-completeness.test.js).
describe('RLS R2g — completeness: every public table is policied or documented-exempt', () => {
  // The 5 auth/identity infra tables are RLS-EXEMPT by necessity (read pre-identity →
  // cannot be gated on app.current_user_id). 0026 DISABLEs RLS on them. Any addition here
  // must be a deliberate, documented decision — that is the whole point of the allowlist.
  const RLS_EXEMPT = new Set<string>([
    'auth_users',
    'auth_accounts',
    'auth_sessions',
    'auth_verification_token',
    'user_profiles',
  ]);

  it('classifies every base table; none is RLS-enabled-without-a-policy or unclassified', async () => {
    const rows = await raw<
      { table: string; enabled: boolean; forced: boolean; policies: number }[]
    >`
      select c.relname as table,
             c.relrowsecurity as enabled,
             c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `;
    expect(rows.length).toBeGreaterThan(0);

    for (const r of rows) {
      if (RLS_EXEMPT.has(r.table)) {
        // Intentionally RLS-free: must carry no orphan policy and (in the harness, post-
        // DISABLE) not be RLS-enabled. Catches an accidental policy on an identity table.
        expect(r.policies, `exempt ${r.table} should carry no policy`).toBe(0);
        expect(r.enabled, `exempt ${r.table} should have RLS disabled in the harness`).toBe(false);
        continue;
      }
      // Every other base table: ENABLE + FORCE RLS with at least one policy.
      expect(r.enabled, `${r.table} must ENABLE row level security (or be added to RLS_EXEMPT)`).toBe(true);
      expect(r.forced, `${r.table} must FORCE row level security`).toBe(true);
      expect(
        r.policies,
        `${r.table} is FORCE-RLS'd with NO policy → it would deny all access (the R3 gap)`,
      ).toBeGreaterThan(0);
    }
  });
});
