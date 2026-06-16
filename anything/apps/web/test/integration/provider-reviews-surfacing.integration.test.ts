// RLS — provider_reviews SURFACING (Phase 2 ticket 2.2, migration 0028), proven on the
// REAL table acting AS pawpi_app. Companion to provider-business-rls (R2e), which parked
// provider_reviews under a single owner FOR ALL policy. 0028 replaces it with per-command
// policies that open a PUBLIC READ window for a PUBLISHED provider's reviews while keeping
// writes owner-only and giving providers NO write path (anti-abuse):
//   SELECT  — a review of a PUBLISHED provider (any authed user — the public reviews list +
//             discovery/profile aggregates) OR my own review (visible even on a draft).
//   INSERT  — owner-only (owner_user_id = me). The completed-booking gate is app-layer.
//   UPDATE/DELETE — own review only; a provider can neither edit nor delete a review.
// Plus the one-per-booking dedup UNIQUE index on appointment_id.
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
  seedUser,
  seedProvider,
  seedStaff,
  seedReview,
} from './db';

// Two pet owners (reviewers).
const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
// Provider-1 cast.
const OWNER = { authUserId: 10, profileId: 10, username: 'biz_owner' };
const STAFF = { authUserId: 12, profileId: 12, username: 'biz_staff' };
const OUTSIDER = { authUserId: 13, profileId: 13, username: 'outsider' };

const P1 = 1; // the provider under review (published in most tests)
const P2 = 2; // a second, draft provider (cross-provider isolation)

let raw: Sql;
let app: Sql;

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

// A + B own pets; OWNER/STAFF/OUTSIDER are bare users. P1 (will be published) + P2 (draft).
// A and B each have a review on P1. STAFF is active staff of P1.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  for (const u of [OWNER, STAFF, OUTSIDER]) await seedUser(raw, u);
  await seedProvider(raw, { providerId: P1, ownerUserProfileId: OWNER.profileId, slug: 'clinic-1' });
  await seedStaff(raw, { providerId: P1, userProfileId: OWNER.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: P1, userProfileId: STAFF.profileId, role: 'staff', status: 'active' });
  await seedProvider(raw, { providerId: P2, ownerUserProfileId: OWNER.profileId, slug: 'clinic-2' });
  await seedReview(raw, { reviewId: 300, providerId: P1, ownerUserId: A.profileId, petId: A.petId });
  await seedReview(raw, { reviewId: 301, providerId: P1, ownerUserId: B.profileId, petId: B.petId });
  await raw`select setval(pg_get_serial_sequence('providers','id'), (select max(id) from providers))`;
  await raw`select setval(pg_get_serial_sequence('provider_staff','id'), (select max(id) from provider_staff))`;
  await raw`select setval(pg_get_serial_sequence('provider_reviews','id'), (select max(id) from provider_reviews))`;
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. SELECT — public read of a PUBLISHED provider's reviews; draft reviews stay private.
describe('reviews surfacing — SELECT (public read of a published provider)', () => {
  it('any authed user reads ALL reviews of a PUBLISHED provider', async () => {
    await raw`update providers set status = 'published' where id = ${P1}`;
    for (const uid of [A.profileId, B.profileId, OUTSIDER.profileId, STAFF.profileId, OWNER.profileId]) {
      await asApp(uid, async (tx) => {
        expect(ids(await tx`select id from provider_reviews`)).toEqual([300, 301]);
      });
    }
  });

  it('while the provider is DRAFT, only the reviewer sees their OWN review (no public window)', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_reviews`)).toEqual([300]); // own only
    });
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`select id from provider_reviews`).toHaveLength(0); // no public read yet
    });
  });

  it('the public read window is open even with NO identity (a published provider is public)', async () => {
    await raw`update providers set status = 'published' where id = ${P1}`;
    await asApp(null, async (tx) => {
      // Reviews of a PUBLISHED provider are public business info — readable without an
      // identity, exactly like the discovery/public-profile aggregates that surface them.
      expect(ids(await tx`select id from provider_reviews`)).toEqual([300, 301]);
    });
  });

  it('no identity + DRAFT provider → zero (the own-review branch needs an identity)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from provider_reviews`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. INSERT — owner-only (author AS yourself).
describe('reviews surfacing — INSERT (owner-only)', () => {
  it('the owner authors their OWN review', async () => {
    const created = await asApp(A.profileId, (tx) => tx`
      insert into provider_reviews (provider_id, owner_user_id, pet_id, rating, body)
      values (${P1}, ${A.profileId}, ${A.petId}, 5, 'great') returning id, owner_user_id
    `);
    expect(created).toHaveLength(1);
    expect(created[0].owner_user_id).toBe(A.profileId);
  });

  it('WITH CHECK rejects authoring a review attributed to ANOTHER owner', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into provider_reviews (provider_id, owner_user_id, pet_id, rating, body)
        values (${P1}, ${B.profileId}, ${B.petId}, 1, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a provider staff member cannot fabricate a review (no provider-side INSERT path)', async () => {
    // STAFF is not an owner of any review; owner_user_id = STAFF would be "themselves" but
    // they own no pet — and crucially there is no provider branch, so a review attributed to
    // a real reviewer (A) by staff is rejected.
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into provider_reviews (provider_id, owner_user_id, pet_id, rating, body)
        values (${P1}, ${A.profileId}, ${A.petId}, 5, 'fabricated by provider')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. UPDATE / DELETE — own review only; providers get NOTHING (anti-abuse).
describe('reviews surfacing — UPDATE / DELETE (own only, providers blocked)', () => {
  beforeEach(async () => {
    await raw`update providers set status = 'published' where id = ${P1}`;
  });

  it('the reviewer edits + deletes their OWN review', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await tx`update provider_reviews set body = 'edited' where id = 300 returning id`).toHaveLength(1);
      expect(await tx`delete from provider_reviews where id = 300 returning id`).toHaveLength(1);
    });
  });

  it('another owner cannot edit or delete a review that is not theirs', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update provider_reviews set body = 'hijack' where id = 300 returning id`).toHaveLength(0);
      expect(await tx`delete from provider_reviews where id = 300 returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from provider_reviews where id = 300`;
    expect(n).toBe(1); // untouched
  });

  it('the PROVIDER (owner|staff of P1) can NEITHER edit NOR delete any review', async () => {
    for (const u of [OWNER, STAFF]) {
      await asApp(u.profileId, async (tx) => {
        expect(await tx`update provider_reviews set body = 'provider edit' returning id`).toHaveLength(0);
        expect(await tx`delete from provider_reviews returning id`).toHaveLength(0);
      });
    }
    const [{ n }] = await raw`select count(*)::int as n from provider_reviews`;
    expect(n).toBe(2); // both reviews survive the provider's attempts
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. one-per-booking dedup — the partial UNIQUE index on appointment_id (added in 0028).
describe('reviews surfacing — one-per-booking dedup (unique appointment_id)', () => {
  it('two reviews tied to the SAME completed booking are rejected by the unique index', async () => {
    // Seed a completed booking owned by A with provider P1.
    const [{ id: apptId }] = await raw<{ id: number }[]>`
      insert into vet_appointments
        (pet_id, owner_user_id, title, appointment_date, appointment_time, provider_id, status)
      values (${A.petId}, ${A.profileId}, 'Checkup', '2026-07-01', '09:00', ${P1}, 'completed')
      returning id
    `;
    // First review tied to that booking — fine (use raw to bypass RLS for the setup half is
    // unnecessary; the owner can author it).
    await asApp(A.profileId, async (tx) => {
      const r = await tx`
        insert into provider_reviews (provider_id, owner_user_id, pet_id, appointment_id, rating, body)
        values (${P1}, ${A.profileId}, ${A.petId}, ${apptId}, 5, 'first') returning id
      `;
      expect(r).toHaveLength(1);
    });
    // Second review tied to the SAME booking → unique-violation.
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into provider_reviews (provider_id, owner_user_id, pet_id, appointment_id, rating, body)
        values (${P1}, ${A.profileId}, ${A.petId}, ${apptId}, 4, 'second')
      `),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('reviews with NULL appointment_id (legacy shape) are NOT constrained by the partial index', async () => {
    // The two seeded reviews (300/301) have NULL appointment_id and coexist fine.
    const [{ n }] = await raw`select count(*)::int as n from provider_reviews where appointment_id is null`;
    expect(n).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4b. Aggregates — the discovery/profile avg_rating + review_count subqueries compute
//     correctly under RLS for a published provider (the public-read window lets the
//     COUNT/AVG see every review), and zero/NULL for a draft provider.
describe('reviews surfacing — aggregates under RLS (discovery/profile)', () => {
  it('a published provider aggregates ALL its reviews for any authed viewer', async () => {
    await raw`update providers set status = 'published' where id = ${P1}`;
    // 300 (rating 5) + 301 (rating 5) → avg 5.0, count 2.
    await asApp(OUTSIDER.profileId, async (tx) => {
      const [agg] = await tx`
        select
          (select round(avg(r.rating)::numeric, 1) from provider_reviews r where r.provider_id = ${P1}) as avg_rating,
          (select count(*)::int from provider_reviews r where r.provider_id = ${P1}) as review_count
      `;
      expect(Number(agg.avg_rating)).toBe(5);
      expect(agg.review_count).toBe(2);
    });
  });

  it('a DRAFT provider aggregates to zero/NULL for an outsider (no public window)', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const [agg] = await tx`
        select
          (select round(avg(r.rating)::numeric, 1) from provider_reviews r where r.provider_id = ${P1}) as avg_rating,
          (select count(*)::int from provider_reviews r where r.provider_id = ${P1}) as review_count
      `;
      expect(agg.avg_rating).toBeNull();
      expect(agg.review_count).toBe(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Catalog — provider_reviews is FORCE-RLS'd with the per-command 2.2 policy set.
describe('reviews surfacing — catalog: provider_reviews per-command policies', () => {
  it('FORCE RLS + the four per-command policies exist (FOR ALL placeholder gone)', async () => {
    const [flags] = await raw`
      select relrowsecurity, relforcerowsecurity
      from pg_class where oid = 'public.provider_reviews'::regclass
    `;
    expect(flags.relrowsecurity).toBe(true);
    expect(flags.relforcerowsecurity).toBe(true);

    const names = (
      await raw`select policyname from pg_policies where schemaname = 'public' and tablename = 'provider_reviews'`
    ).map((p: any) => p.policyname);
    expect(names).toContain('provider_reviews_select');
    expect(names).toContain('provider_reviews_insert');
    expect(names).toContain('provider_reviews_update');
    expect(names).toContain('provider_reviews_delete');
    expect(names).not.toContain('provider_reviews_owner_all'); // R2e placeholder removed
  });
});
