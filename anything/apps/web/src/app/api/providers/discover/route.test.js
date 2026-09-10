import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/discover — the owner-facing PUBLIC browse view (ticket 5).
// Any logged-in user; NO provider_staff membership. Returns ONLY published
// providers, public business fields only. auth() and `sql` are mocked at the
// module boundary. Unlike the 4a routes there is no requireProviderRole and no
// resolveUserId — discovery is unscoped public read.
//
// Services Hub P1 (docs/SERVICES_HUB_PLAN.md §5): ONE query per call now projects
// capabilities[] + the primary location (lat/lng/location_name/hours_json) and
// accepts optional ?capability (legacy ?type still works), ?q, and ?lat/&lng/&radius
// geo params. All additive.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn(), getActiveTx: () => null }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };

// All SQL text issued across the call, joined — used to assert care_access_grants
// is never touched and the published filter is always present.
const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(' ')).join(' ');

const req = (url = 'http://localhost/api/providers/discover') => new Request(url);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/discover', () => {
  it('anonymous → 401, no query', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('returns only published providers (public fields)', async () => {
    auth.mockResolvedValue(SESSION);
    const PUBLISHED = [
      { id: 1, slug: 'happy-paws', name: 'Happy Paws', provider_type: 'vet', bio: null, logo_url: null },
    ];
    sql.mockResolvedValueOnce(PUBLISHED);

    const res = await GET(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers).toEqual(PUBLISHED);
    expect(body.page).toMatchObject({ limit: 200, offset: 0, count: 1 }); // A-14 paging envelope
    // Drafts are excluded by the query, not in code.
    expect(allQueryText()).toContain("status = 'published'");
  });

  it('P1 projection: capabilities[] + primary location (lat/lng/name/hours) via LATERAL', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req());

    const text = allQueryText();
    // capabilities[] — correlated array_agg over provider_capabilities (one row/provider).
    expect(text).toContain('array_agg(pc.capability');
    expect(text).toContain('AS capabilities');
    // primary location — LATERAL over provider_locations, lowest id = primary.
    expect(text).toContain('LEFT JOIN LATERAL');
    expect(text).toContain('provider_locations');
    expect(text).toContain('ORDER BY pl.id ASC');
    expect(text).toContain('AS location_name');
    expect(text).toContain('hours_json');
    expect(text).toContain('loc.lat AS lat');
    expect(text).toContain('loc.lng AS lng');
  });

  it('?type=vet matches by CAPABILITY (EXISTS on provider_capabilities), not provider_type', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, provider_type: 'vet' }]);

    const res = await GET(req('http://localhost/api/providers/discover?type=vet'));

    expect(res.status).toBe(200);
    const [strings, ...values] = sql.mock.calls[0];
    const text = strings.join(' ');
    // Ticket 2.1: filter is on provider_capabilities.capability, never on the
    // providers.provider_type column. P1 does it via EXISTS (one row per provider).
    expect(text).toContain('EXISTS');
    expect(text).toContain('pc.capability =');
    expect(text).toContain("status = 'published'");
    expect(values).toContain('vet'); // bound param, not interpolated (as ?capability)
    // 0125 added a distinct ?provider_type filter (needed for pet_friendly seed rows,
    // which carry NO provider_capabilities). ?type=vet is the CAPABILITY alias — the
    // providerType bind stays null so the SQL guard `${providerType}::text IS NULL`
    // short-circuits that branch (no filtering on providers.provider_type).
    expect(text).toContain('p.provider_type =');
  });

  it('?provider_type=pet_friendly filters on providers.provider_type (0125, for pet-friendly seed rows)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(
      req('http://localhost/api/providers/discover?provider_type=pet_friendly'),
    );

    const [strings, ...values] = sql.mock.calls[0];
    const text = strings.join(' ');
    expect(text).toContain('p.provider_type =');
    expect(values).toContain('pet_friendly');
  });

  it('?capability= is the P1 alias for ?type= (binds the capability)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req('http://localhost/api/providers/discover?capability=groomer'));

    const [, ...values] = sql.mock.calls[0];
    expect(values).toContain('groomer');
  });

  it('no capability filter → capability param bound null (no capability cutoff)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req());

    // The EXISTS branch is guarded by `${capability}::text IS NULL` — with no filter
    // the bound value is null so every published provider passes.
    const [, ...values] = sql.mock.calls[0];
    expect(values).toContain(null);
    // capabilities are STILL projected even with no filter.
    expect(allQueryText()).toContain('array_agg(pc.capability');
  });

  it('?q= adds a bound ILIKE name search', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req('http://localhost/api/providers/discover?q=happy'));

    const [strings, ...values] = sql.mock.calls[0];
    expect(strings.join(' ')).toContain('p.name ILIKE');
    expect(values).toContain('%happy%'); // wrapped + bound, not interpolated
  });

  it('geo ?lat&lng → distance_km is computed and ordered nearest-first IN SQL (A-14: paging-exact)', async () => {
    auth.mockResolvedValue(SESSION);
    // SQL returns the page already nearest-first, distance_km as a numeric string.
    sql.mockResolvedValueOnce([
      { id: 2, name: 'Near', lat: -34.61, lng: -58.41, distance_km: '1.4' },
      { id: 1, name: 'Far', lat: -34.9, lng: -58.9, distance_km: '55.2' },
    ]);

    // Buenos Aires-ish origin close to provider 2.
    const res = await GET(
      req('http://localhost/api/providers/discover?lat=-34.6&lng=-58.4'),
    );

    const { providers } = await res.json();
    expect(providers.map((p) => p.id)).toEqual([2, 1]); // SQL order preserved
    expect(providers[0].distance_km).toBeLessThan(providers[1].distance_km);
    expect(typeof providers[0].distance_km).toBe('number');
    // The origin is bound into the haversine and the ORDER BY is on distance_km.
    expect(sql.mock.calls[0].slice(1)).toContain(-34.6);
    expect(sql.mock.calls[0].slice(1)).toContain(-58.4);
    expect(allQueryText()).toContain('ORDER BY distance_km ASC NULLS LAST');
  });

  it('geo: a provider with no coords sorts last with distance_km null', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: 1, name: 'Located', lat: -34.61, lng: -58.41 },
      { id: 2, name: 'NoCoords', lat: null, lng: null },
    ]);

    const res = await GET(
      req('http://localhost/api/providers/discover?lat=-34.6&lng=-58.4'),
    );

    const { providers } = await res.json();
    expect(providers.map((p) => p.id)).toEqual([1, 2]);
    expect(providers[1].distance_km).toBeNull();
  });

  it('?radius with geo adds a bounding-box coordinate filter', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(
      req('http://localhost/api/providers/discover?lat=-34.6&lng=-58.4&radius=5'),
    );

    const text = sql.mock.calls[0][0].join(' ');
    expect(text).toContain('loc.lat BETWEEN');
    expect(text).toContain('loc.lng BETWEEN');
  });

  it('no geo → no distance_km, plain published set (back-compat)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, name: 'A' }]);

    const res = await GET(req());
    const { providers } = await res.json();
    expect(providers[0].distance_km).toBeUndefined();
  });

  it('never exposes owner identity or status in the projection', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req());

    const text = allQueryText();
    expect(text).not.toContain('owner_user_profile_id');
    expect(text).not.toContain('provider_staff');
  });

  it('never queries care_access_grants (structural)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req('http://localhost/api/providers/discover?type=vet'));

    expect(allQueryText()).not.toContain('care_access');
  });

  it('ticket 2.2: aggregates avg_rating + review_count over provider_reviews', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req());

    const text = allQueryText();
    expect(text).toContain('avg_rating');
    expect(text).toContain('review_count');
    expect(text).toContain('provider_reviews');
  });
});

// AUDIT_2026-09 A-14: the directory is paged and nearest-first ordering happens in SQL.
describe('paging + SQL distance (A-14)', () => {
  it('binds LIMIT/OFFSET (default 200/0) and reports the page', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    const res = await GET(new Request('http://localhost/api/providers/discover'));
    const body = await res.json();
    expect(allQueryText()).toContain('LIMIT');
    expect(allQueryText()).toContain('OFFSET');
    expect(allQueryText()).toContain('ORDER BY distance_km ASC NULLS LAST, p.name ASC');
    expect(body.page).toEqual({ limit: 200, offset: 0, count: 0, hasMore: false });
    const values = sql.mock.calls[0].slice(1);
    expect(values).toContain(200);
    expect(values).toContain(0);
  });

  it('honours ?limit/?offset, clamps to 500, and flags hasMore when the page is full', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const res = await GET(new Request('http://localhost/api/providers/discover?limit=2&offset=4'));
    const body = await res.json();
    expect(sql.mock.calls[0].slice(1)).toContain(2);
    expect(sql.mock.calls[0].slice(1)).toContain(4);
    expect(body.page).toEqual({ limit: 2, offset: 4, count: 2, hasMore: true });
    expect(body.providers.map((p) => p.id)).toEqual([1, 2]);

    sql.mockResolvedValueOnce([]);
    await GET(new Request('http://localhost/api/providers/discover?limit=99999'));
    expect(sql.mock.calls[1].slice(1)).toContain(500);
  });

  it('with geo: distance_km comes from SQL and is exposed as a number; without geo it is dropped', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, distance_km: '1.25' }, { id: 2, distance_km: null }]);
    let res = await GET(new Request('http://localhost/api/providers/discover?lat=-34.6&lng=-58.4'));
    let { providers } = await res.json();
    expect(providers[0].distance_km).toBe(1.25);
    expect(providers[1].distance_km).toBeNull();
    expect(sql.mock.calls[0].slice(1)).toContain(-34.6);

    sql.mockResolvedValueOnce([{ id: 1, distance_km: null }]);
    res = await GET(new Request('http://localhost/api/providers/discover'));
    ({ providers } = await res.json());
    expect('distance_km' in providers[0]).toBe(false);
  });
});
