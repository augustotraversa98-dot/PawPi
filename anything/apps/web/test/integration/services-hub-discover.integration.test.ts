// Services Hub P1 — the /api/providers/discover PROJECTION on REAL Postgres, acting AS
// pawpi_app (docs/SERVICES_HUB_PLAN.md §5). The mocked unit test proves the route's param
// wiring; THIS proves the pieces that only real Postgres + RLS can: that a browsing owner
// (an OUTSIDER, no staff membership) can read a PUBLISHED provider's capabilities[] and its
// PRIMARY location coords through the public-read RLS windows (0027 provider_capabilities_read,
// 0024 provider_locations_read), that the LATERAL picks the LOWEST-id location, that a
// location-less provider yields NULL coords, and that DRAFT providers stay invisible.
//
// The SELECT below MIRRORS the route's projection (route.js) — kept in lockstep by shape,
// not imported, because the route runs on the module `sql` (superuser, RLS-bypassing) while
// an RLS proof needs the NOBYPASSRLS pawpi_app connection, exactly like the sibling suites.

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
  seedLocation,
} from './db';

// A browsing owner with NO provider relationship — the discovery caller.
const OUTSIDER = { authUserId: 20, profileId: 20, username: 'browser' };
// Provider owners (bare users, just to satisfy the FK).
const OWNER = { authUserId: 10, profileId: 10, username: 'biz_owner' };

const P1 = 1; // published, two locations + two capabilities
const P2 = 2; // published, NO location
const P3 = 3; // draft (must stay invisible)

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

// The discover projection query, mirroring route.js. Optional filters bound the same way.
function discover(
  tx: Sql,
  opts: { capability?: string | null; q?: string | null } = {},
) {
  const capability = opts.capability ?? null;
  const qLike = opts.q ? `%${opts.q}%` : null;
  return tx`
    SELECT
      p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url,
      (SELECT COALESCE(array_agg(pc.capability ORDER BY pc.capability), ARRAY[]::text[])
         FROM provider_capabilities pc WHERE pc.provider_id = p.id) AS capabilities,
      loc.lat AS lat,
      loc.lng AS lng,
      loc.name AS location_name,
      loc.hours_json AS hours_json
    FROM providers p
    LEFT JOIN LATERAL (
      SELECT lat, lng, name, address, hours_json
      FROM provider_locations pl
      WHERE pl.provider_id = p.id
      ORDER BY pl.id ASC
      LIMIT 1
    ) loc ON true
    WHERE p.status = 'published'
      AND (
        ${capability}::text IS NULL
        OR EXISTS (
          SELECT 1 FROM provider_capabilities pc
          WHERE pc.provider_id = p.id AND pc.capability = ${capability}
        )
      )
      AND (${qLike}::text IS NULL OR p.name ILIKE ${qLike})
    ORDER BY p.name ASC
  `;
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

// P1 published: two locations (id 100 with coords, id 101 without) + caps [groomer, vet].
// P2 published: no location. P3 draft: a location + a capability that must NOT surface.
beforeEach(async () => {
  await seedUser(raw, OUTSIDER);
  await seedUser(raw, OWNER);

  await seedProvider(raw, { providerId: P1, ownerUserProfileId: OWNER.profileId, slug: 'happy-paws', status: 'published' });
  // Lowest id (100) is the primary → its coords/name/hours must win over 101.
  await seedLocation(raw, { locationId: 100, providerId: P1, name: 'Downtown', lat: -34.6037, lng: -58.3816, hoursJson: { mon: '9-17' } });
  await seedLocation(raw, { locationId: 101, providerId: P1, name: 'Suburb', lat: -34.9, lng: -58.9 });
  await seedCapability(raw, { providerId: P1, capability: 'vet' });
  await seedCapability(raw, { providerId: P1, capability: 'groomer' });

  await seedProvider(raw, { providerId: P2, ownerUserProfileId: OWNER.profileId, slug: 'no-location', status: 'published' });
  await seedCapability(raw, { providerId: P2, capability: 'shop' });

  await seedProvider(raw, { providerId: P3, ownerUserProfileId: OWNER.profileId, slug: 'draft-clinic', status: 'draft' });
  await seedLocation(raw, { locationId: 300, providerId: P3, name: 'Hidden', lat: -34.6, lng: -58.4 });
  await seedCapability(raw, { providerId: P3, capability: 'vet' });

  await raw`select setval(pg_get_serial_sequence('providers','id'), (select max(id) from providers))`;
  await raw`select setval(pg_get_serial_sequence('provider_locations','id'), (select max(id) from provider_locations))`;
});

describe('services hub discover — projection under RLS (as pawpi_app)', () => {
  it('an OUTSIDER reads a published provider capabilities[] + PRIMARY (lowest-id) location', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const rows = await discover(tx);
      const p1 = rows.find((r: any) => r.id === P1);
      expect(p1).toBeTruthy();
      // capabilities[] sorted, both present — read through the public window (0027).
      expect(p1.capabilities).toEqual(['groomer', 'vet']);
      // Primary = lowest id (100 'Downtown'), NOT the far 'Suburb' (101).
      expect(p1.location_name).toBe('Downtown');
      expect(Number(p1.lat)).toBeCloseTo(-34.6037, 3);
      expect(Number(p1.lng)).toBeCloseTo(-58.3816, 3);
      expect(p1.hours_json).toEqual({ mon: '9-17' });
    });
  });

  it('a published provider with NO location returns NULL coords (still listed)', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const rows = await discover(tx);
      const p2 = rows.find((r: any) => r.id === P2);
      expect(p2).toBeTruthy();
      expect(p2.lat).toBeNull();
      expect(p2.lng).toBeNull();
      expect(p2.location_name).toBeNull();
      expect(p2.capabilities).toEqual(['shop']);
    });
  });

  it('DRAFT providers are invisible (published-only), even to an outsider', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const rows = await discover(tx);
      expect(rows.map((r: any) => r.id).sort()).toEqual([P1, P2]);
      expect(rows.find((r: any) => r.id === P3)).toBeUndefined();
    });
  });

  it('?capability filter (EXISTS) returns only providers holding it — one row per provider', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const vets = await discover(tx, { capability: 'vet' });
      expect(vets.map((r: any) => r.id)).toEqual([P1]); // P3 is draft; P2 has no vet cap
      // A multi-capability provider appears exactly ONCE (EXISTS, not a JOIN).
      expect(vets).toHaveLength(1);

      const shops = await discover(tx, { capability: 'shop' });
      expect(shops.map((r: any) => r.id)).toEqual([P2]);

      const walkers = await discover(tx, { capability: 'walker' });
      expect(walkers).toHaveLength(0);
    });
  });

  it('?q ILIKE matches provider name (bound, case-insensitive)', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const rows = await discover(tx, { q: 'HAPPY' });
      expect(rows.map((r: any) => r.id)).toEqual([P1]);
    });
  });
});
