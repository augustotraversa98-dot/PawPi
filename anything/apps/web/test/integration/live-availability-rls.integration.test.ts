// Ticket B1 — provider_live_availability (walker "Accepting walks now") proven on the REAL table
// acting AS pawpi_app under FORCE RLS. 0088 adds the presence row + a two-tier read (published OR
// own-staff) + active-staff-only write. This suite is the RLS guard for that.
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. WRITE: an active staff member of the provider can upsert its row; an outsider CANNOT
//      (WITH CHECK reject on INSERT, 0 rows on UPDATE); a removed staff member loses write.
//   2. READ: a PUBLISHED provider's presence is readable by any authed user (public presence); a
//      DRAFT provider's presence is NOT public (only its own staff can read it).
//   3. EXPIRY AT READ: the availability boolean (accepting AND expires_at > now()) is computed at
//      read time — a stored accepting:true whose expires_at is in the past reads as NOT available.
//   4. Completeness: provider_live_availability is ENABLE+FORCE with ≥1 policy.
//
// The harness owner is a superuser, so FORCE RLS constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
} from './db';

// W = an active walker-staff (owner) of the PUBLISHED walker provider. X = an authed outsider.
const W = { authUserId: 1, profileId: 1, username: 'walkerw' };
const X = { authUserId: 2, profileId: 2, username: 'outsiderx' };
const PUB_ID = 10; // published walker provider
const DRAFT_ID = 11; // draft provider owned by W (draft presence is not public)

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
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
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  await seedUser(raw, W);
  await seedUser(raw, X);
  await seedProvider(raw, {
    providerId: PUB_ID,
    ownerUserProfileId: W.profileId,
    slug: 'paw-walks',
    status: 'published',
  });
  await seedStaff(raw, { providerId: PUB_ID, userProfileId: W.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: PUB_ID, capability: 'walker' });
  await seedProvider(raw, {
    providerId: DRAFT_ID,
    ownerUserProfileId: W.profileId,
    slug: 'draft-walks',
    status: 'draft',
  });
  await seedStaff(raw, { providerId: DRAFT_ID, userProfileId: W.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: DRAFT_ID, capability: 'walker' });
});

describe('B1 — provider_live_availability WRITE RLS (as pawpi_app)', () => {
  it('active staff W can upsert its provider row (toggle presence on)', async () => {
    await asApp(W.profileId, async (tx) => {
      const rows = await tx`
        insert into provider_live_availability (provider_id, accepting, expires_at)
        values (${PUB_ID}, true, now() + interval '8 hours')
        returning provider_id
      `;
      expect(rows).toHaveLength(1);
    });
    const [{ c }] = await raw`select count(*)::int as c from provider_live_availability where provider_id = ${PUB_ID}`;
    expect(c).toBe(1);
  });

  it('an outsider X CANNOT insert a presence row (WITH CHECK reject)', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into provider_live_availability (provider_id, accepting, expires_at)
        values (${PUB_ID}, true, now() + interval '8 hours')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an outsider X UPDATEs ZERO rows of an existing presence row', async () => {
    await raw`insert into provider_live_availability (provider_id, accepting, expires_at)
              values (${PUB_ID}, true, now() + interval '8 hours')`;
    await asApp(X.profileId, async (tx) => {
      expect(
        await tx`update provider_live_availability set accepting = false returning provider_id`,
      ).toHaveLength(0);
    });
    const [{ accepting }] = await raw`select accepting from provider_live_availability where provider_id = ${PUB_ID}`;
    expect(accepting).toBe(true); // untouched
  });

  it('a removed staff member loses write instantly', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${PUB_ID} and user_profile_id = ${W.profileId}`;
    await expect(
      asApp(W.profileId, (tx) => tx`
        insert into provider_live_availability (provider_id, accepting)
        values (${PUB_ID}, true)
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('B1 — provider_live_availability READ RLS (published vs draft, as pawpi_app)', () => {
  beforeEach(async () => {
    await raw`insert into provider_live_availability (provider_id, accepting, expires_at)
              values (${PUB_ID}, true, now() + interval '8 hours')`;
    await raw`insert into provider_live_availability (provider_id, accepting, expires_at)
              values (${DRAFT_ID}, true, now() + interval '8 hours')`;
  });

  it('any authed outsider can read a PUBLISHED provider presence (public presence)', async () => {
    await asApp(X.profileId, async (tx) => {
      const rows = await tx`select provider_id from provider_live_availability where provider_id = ${PUB_ID}`;
      expect(rows).toHaveLength(1);
    });
  });

  it('an outsider CANNOT read a DRAFT provider presence (not public)', async () => {
    await asApp(X.profileId, async (tx) => {
      const rows = await tx`select provider_id from provider_live_availability where provider_id = ${DRAFT_ID}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("own staff CAN read their still-draft provider's presence (management view)", async () => {
    await asApp(W.profileId, async (tx) => {
      const rows = await tx`select provider_id from provider_live_availability where provider_id = ${DRAFT_ID}`;
      expect(rows).toHaveLength(1);
    });
  });
});

describe('B1 — expiry is evaluated at READ time (as pawpi_app)', () => {
  it('a stored accepting:true with a PAST expires_at reads as NOT available', async () => {
    await raw`insert into provider_live_availability (provider_id, accepting, expires_at)
              values (${PUB_ID}, true, now() - interval '1 hour')`;
    await asApp(X.profileId, async (tx) => {
      const rows = await tx`
        select (accepting = true and expires_at is not null and expires_at > now()) as available
        from provider_live_availability where provider_id = ${PUB_ID}
      `;
      expect(rows[0].available).toBe(false);
    });
  });

  it('a future expires_at reads as available', async () => {
    await raw`insert into provider_live_availability (provider_id, accepting, expires_at)
              values (${PUB_ID}, true, now() + interval '2 hours')`;
    await asApp(X.profileId, async (tx) => {
      const rows = await tx`
        select (accepting = true and expires_at is not null and expires_at > now()) as available
        from provider_live_availability where provider_id = ${PUB_ID}
      `;
      expect(rows[0].available).toBe(true);
    });
  });
});

describe('B1 — completeness: provider_live_availability is ENABLE+FORCE RLS with policies', () => {
  it('the presence table is policied (the model cannot silently regress)', async () => {
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
        and c.relname = 'provider_live_availability'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled, 'must ENABLE RLS').toBe(true);
    expect(rows[0].forced, 'must FORCE RLS').toBe(true);
    expect(rows[0].policies, 'must carry ≥1 policy').toBeGreaterThan(0);
  });
});
