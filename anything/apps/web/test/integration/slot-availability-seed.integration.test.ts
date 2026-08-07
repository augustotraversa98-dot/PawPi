// Appointment slots PR-1 — the 0076 SEED, proven on real Postgres.
//
// The seed runs at migration time (an empty DB, so a no-op there); this suite proves its
// BEHAVIOUR by inserting provider fixtures and then re-executing the ACTUAL 0076 file
// (idempotent: `add column if not exists`, guarded INSERT), asserting which providers get
// default windows. Runs as the harness owner (superuser) — the seed runs as the migration
// role in prod, so RLS is irrelevant here (the RLS of provider_availability is proven in
// generalized-booking-rls.integration.test.ts).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedUser, MIGRATIONS_DIR } from './db';

const OWNER = { authUserId: 1, profileId: 1, username: 'bizowner' };

let raw: Sql;
let seedSql: string;

beforeAll(async () => {
  raw = makeTestSql();
  seedSql = await readFile(
    path.join(MIGRATIONS_DIR, '0076_provider_slot_config.sql'),
    'utf8',
  );
});

afterAll(async () => {
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  await seedUser(raw, OWNER);
});

async function insertProvider(opts: {
  id: number;
  type: string;
  status: 'draft' | 'published';
  slug: string;
}): Promise<void> {
  await raw`
    insert into providers (id, owner_user_profile_id, provider_type, name, slug, status)
    values (${opts.id}, ${OWNER.profileId}, ${opts.type}, ${opts.slug}, ${opts.slug}, ${opts.status})
  `;
}

async function windowCount(providerId: number): Promise<number> {
  const rows = await raw<{ n: number }[]>`
    select count(*)::int as n from provider_availability where provider_id = ${providerId}
  `;
  return rows[0].n;
}

describe('0076 seed — default availability for appointment-capable providers', () => {
  it('seeds Mon–Fri 09:00–18:00 @30 for a published vet (capability row) and telehealth (provider_type)', async () => {
    // vet is represented by a provider_capabilities row; telehealth only by provider_type
    // (it is not a valid provider_capabilities value) — both must be seeded.
    await insertProvider({ id: 10, type: 'vet', status: 'published', slug: 'vet-clinic' });
    await raw`insert into provider_capabilities (provider_id, capability) values (10, 'vet')`;
    await insertProvider({ id: 11, type: 'telehealth', status: 'published', slug: 'tele-vet' });

    await raw.unsafe(seedSql);

    expect(await windowCount(10)).toBe(5);
    expect(await windowCount(11)).toBe(5);

    const rows = await raw<any[]>`
      select weekday, start_time, end_time, slot_minutes, staff_user_id, capability, active
      from provider_availability where provider_id = 10 order by weekday
    `;
    expect(rows.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4]); // Mon–Fri
    expect(rows[0].start_time).toBe('09:00:00');
    expect(rows[0].end_time).toBe('18:00:00');
    expect(
      rows.every(
        (r) =>
          r.slot_minutes === 30 &&
          r.staff_user_id === null &&
          r.capability === null &&
          r.active === true,
      ),
    ).toBe(true);
  });

  it('does NOT seed daycare / walker-only providers (not fixed-slot)', async () => {
    await insertProvider({ id: 20, type: 'daycare', status: 'published', slug: 'day-care' });
    await raw`insert into provider_capabilities (provider_id, capability) values (20, 'daycare')`;
    await insertProvider({ id: 21, type: 'walker', status: 'published', slug: 'walk-co' });
    await raw`insert into provider_capabilities (provider_id, capability) values (21, 'walker')`;

    await raw.unsafe(seedSql);

    expect(await windowCount(20)).toBe(0);
    expect(await windowCount(21)).toBe(0);
  });

  it('skips a draft provider and leaves an already-configured provider untouched (idempotent)', async () => {
    await insertProvider({ id: 30, type: 'vet', status: 'draft', slug: 'draft-vet' });
    await raw`insert into provider_capabilities (provider_id, capability) values (30, 'vet')`;

    await insertProvider({ id: 31, type: 'vet', status: 'published', slug: 'seeded-vet' });
    await raw`insert into provider_capabilities (provider_id, capability) values (31, 'vet')`;
    // 31 already has ONE custom window → the seed must not touch it (only ZERO-window
    // providers are seeded), so it is NOT topped up to 5.
    await raw`
      insert into provider_availability (provider_id, weekday, start_time, end_time, slot_minutes)
      values (31, 5, '10:00', '12:00', 15)
    `;

    await raw.unsafe(seedSql); // first pass
    await raw.unsafe(seedSql); // re-run proves idempotency

    expect(await windowCount(30)).toBe(0); // draft never seeded
    expect(await windowCount(31)).toBe(1); // existing config preserved
  });
});
