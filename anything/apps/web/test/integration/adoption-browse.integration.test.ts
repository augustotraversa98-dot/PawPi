// Adoption browse (Wave 9 ticket 2.86) — the owner-facing GET /api/adoption/listings run as the REAL
// handler against the embedded DB AS pawpi_app (FORCE RLS like production). Proves: only PUBLISHED
// providers' AVAILABLE listings are visible (draft provider + adopted listing excluded); each row
// carries its provider's primary location lat/lng; nearest-first ordering with seeded coords; a
// gender filter narrows. Mirrors the provider-create-rls handler-as-pawpi_app pattern.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedUser,
  seedProvider,
  seedCapability,
  seedAdoptableListing,
  seedAdoptionApplication,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const VIEWER = { authUserId: 1, profileId: 1, username: 'viewer' };
const O1 = { authUserId: 10, profileId: 10, username: 'shelter1' };
const O2 = { authUserId: 20, profileId: 20, username: 'shelter2' };
const O3 = { authUserId: 30, profileId: 30, username: 'shelter3_draft' };
// NYC viewer; P1 ~1km away, P2 ~110km away.
const VIEW_LAT = 40.7128;
const VIEW_LNG = -74.006;

let raw: Sql;
let app: Sql;
let appSql: any;
let GET: (request: Request) => Promise<Response>;

function browseRequest(qs = ''): Request {
  return new Request(`http://localhost/api/adoption/listings${qs}`);
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
  const route = await import('@/app/api/adoption/listings/route');
  GET = route.GET as typeof GET;
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

beforeEach(async () => {
  for (const u of [VIEWER, O1, O2, O3]) await seedUser(raw, u);
  // Two published adoption shelters with primary locations + one available listing each.
  await seedProvider(raw, { providerId: 1, ownerUserProfileId: O1.profileId, slug: 'p1', status: 'published' });
  await seedProvider(raw, { providerId: 2, ownerUserProfileId: O2.profileId, slug: 'p2', status: 'published' });
  await seedProvider(raw, { providerId: 3, ownerUserProfileId: O3.profileId, slug: 'p3', status: 'draft' });
  for (const id of [1, 2, 3]) await seedCapability(raw, { providerId: id, capability: 'adoption' });
  await raw`insert into provider_locations (provider_id, name, lat, lng, address) values (1, 'L1', ${VIEW_LAT + 0.01}, ${VIEW_LNG}, '1 Bark St, NYC')`;
  await raw`insert into provider_locations (provider_id, name, lat, lng, address) values (2, 'L2', ${VIEW_LAT + 1.0}, ${VIEW_LNG}, '2 Woof Ave')`;
  await raw`insert into provider_locations (provider_id, name, lat, lng, address) values (3, 'L3', ${VIEW_LAT}, ${VIEW_LNG}, '3 Draft Rd')`;
  // P1: an available 'female' listing + an adopted one (excluded). P2: one available 'male'.
  await seedAdoptableListing(raw, { listingId: 101, providerId: 1, name: 'Near', status: 'available' });
  await raw`update adoptable_listings set gender='female' where id=101`;
  await seedAdoptableListing(raw, { listingId: 102, providerId: 1, name: 'Adopted', status: 'adopted' });
  await seedAdoptableListing(raw, { listingId: 201, providerId: 2, name: 'Far', status: 'available' });
  // P3 is a DRAFT provider → its listing must be invisible to browse.
  await seedAdoptableListing(raw, { listingId: 301, providerId: 3, name: 'Hidden', status: 'available' });

  authState.session = { user: { id: VIEWER.authUserId, email: 'v@x.com' } };
});

const ids = (data: any) => data.listings.map((l: any) => l.id);

describe('GET /api/adoption/listings (handler as pawpi_app)', () => {
  it('returns only published+available listings, with provider location, excluding draft + adopted', async () => {
    const res = await GET(browseRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    const got = ids(data).sort((a: number, b: number) => a - b);
    expect(got).toEqual([101, 201]); // 102 adopted, 301 draft-provider → excluded
    const near = data.listings.find((l: any) => l.id === 101);
    expect(Number(near.provider_lat)).toBeCloseTo(VIEW_LAT + 0.01, 5);
    expect(near.provider_address).toContain('NYC');
  });

  it('sorts nearest-first with seeded coords', async () => {
    const res = await GET(browseRequest(`?lat=${VIEW_LAT}&lng=${VIEW_LNG}&radius_km=200`));
    const data = await res.json();
    expect(data.sort).toBe('nearest');
    expect(ids(data)).toEqual([101, 201]); // P1 (~1km) before P2 (~110km), both inside 200km
    expect(data.listings[0].distance_km).toBeLessThan(data.listings[1].distance_km);
  });

  it('a gender filter narrows the result set', async () => {
    const res = await GET(browseRequest('?gender=female'));
    const data = await res.json();
    expect(ids(data)).toEqual([101]); // only the female listing
  });

  it('an OPTED-IN tight radius (enforce_radius=true) excludes the far shelter (2.95)', async () => {
    // Radius filtering is opt-in now: only with enforce_radius=true does the box hard-filter.
    const res = await GET(
      browseRequest(`?lat=${VIEW_LAT}&lng=${VIEW_LNG}&radius_km=10&enforce_radius=true`),
    );
    const data = await res.json();
    expect(ids(data)).toEqual([101]); // P2 (~110km) is outside the 10km box
  });

  it('a LOCATED shelter beyond the default radius still appears — distance ranks, not excludes (2.95)', async () => {
    // A published shelter that never set a map pin — no provider_locations row → coordless.
    const O4 = { authUserId: 40, profileId: 40, username: 'shelter4_nopin' };
    await seedUser(raw, O4);
    await seedProvider(raw, {
      providerId: 4,
      ownerUserProfileId: O4.profileId,
      slug: 'p4',
      status: 'published',
    });
    await seedCapability(raw, { providerId: 4, capability: 'adoption' });
    await seedAdoptableListing(raw, { listingId: 401, providerId: 4, name: 'NoPin', status: 'available' });

    // Geo active, NO enforce_radius: P2 (~111km, well beyond the old 100km default box) must
    // STILL be returned, merely ranked after the near P1; the coordless shelter surfaces last.
    const res = await GET(browseRequest(`?lat=${VIEW_LAT}&lng=${VIEW_LNG}`));
    const data = await res.json();
    expect(data.sort).toBe('nearest');
    const got = ids(data);
    expect(got).toContain(101); // near
    expect(got).toContain(201); // far LOCATED — NOT excluded anymore (was dropped by the old box)
    expect(got).toContain(401); // coordless — surfaced last
    // Order: near located → far located → coordless (no distance).
    expect(got.indexOf(101)).toBeLessThan(got.indexOf(201));
    expect(got.indexOf(201)).toBeLessThan(got.indexOf(401));
    const far = data.listings.find((l: any) => l.id === 201);
    expect(far.distance_km).toBeGreaterThan(100); // proves it was beyond the old radius
    const nopin = data.listings.find((l: any) => l.id === 401);
    expect(nopin.distance_km).toBeNull();
  });

  it("reflects the viewer's OWN application per listing as my_application_status (2.95)", async () => {
    // The viewer has a DECLINED application on the near listing (101) and NONE on the far one (201).
    // A DIFFERENT owner's application on 201 must NOT leak into the viewer's status.
    await seedAdoptionApplication(raw, {
      applicationId: 900,
      listingId: 101,
      providerId: 1,
      applicantUserId: VIEWER.profileId,
      status: 'declined',
    });
    await seedAdoptionApplication(raw, {
      applicationId: 901,
      listingId: 201,
      providerId: 2,
      applicantUserId: O1.profileId, // a DIFFERENT user
      status: 'submitted',
    });

    const res = await GET(browseRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    const near = data.listings.find((l: any) => l.id === 101);
    const far = data.listings.find((l: any) => l.id === 201);
    expect(near.my_application_status).toBe('declined'); // the viewer's own row
    expect(far.my_application_status).toBeNull(); // someone else's row does not leak
  });

  it('still surfaces a pin-less shelter (no location) when the viewer shares location (2.91)', async () => {
    // A published shelter that never set a map pin — no provider_locations row → coordless.
    const O4 = { authUserId: 40, profileId: 40, username: 'shelter4_nopin' };
    await seedUser(raw, O4);
    await seedProvider(raw, {
      providerId: 4,
      ownerUserProfileId: O4.profileId,
      slug: 'p4',
      status: 'published',
    });
    await seedCapability(raw, { providerId: 4, capability: 'adoption' });
    await seedAdoptableListing(raw, { listingId: 401, providerId: 4, name: 'NoPin', status: 'available' });

    // Geo active + an OPTED-IN tight radius (2.95): the far LOCATED shelter (P2) is excluded, but
    // the coordless shelter's dog must NOT vanish (the bounding box never drops pin-less shelters).
    const res = await GET(
      browseRequest(`?lat=${VIEW_LAT}&lng=${VIEW_LNG}&radius_km=10&enforce_radius=true`),
    );
    const data = await res.json();
    const got = ids(data);
    expect(got).toContain(101); // near, in-radius
    expect(got).toContain(401); // coordless → surfaced anyway
    expect(got).not.toContain(201); // far LOCATED shelter still filtered by the radius
    // The coordless row has no distance and sorts after located ones.
    const nopin = data.listings.find((l: any) => l.id === 401);
    expect(nopin.provider_lat).toBeNull();
    expect(nopin.distance_km).toBeNull();
  });
});
