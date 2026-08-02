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
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

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
    expect(await res.json()).toEqual({ providers: PUBLISHED });
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
    expect(text).not.toContain('provider_type = ');
    expect(text).toContain("status = 'published'");
    expect(values).toContain('vet'); // bound param, not interpolated
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

  it('geo ?lat&lng → attaches distance_km and sorts nearest-first', async () => {
    auth.mockResolvedValue(SESSION);
    // Two providers: one far, one near. Query order is name ASC; the route re-sorts by distance.
    sql.mockResolvedValueOnce([
      { id: 1, name: 'Far', lat: -34.9, lng: -58.9 },
      { id: 2, name: 'Near', lat: -34.61, lng: -58.41 },
    ]);

    // Buenos Aires-ish origin close to provider 2.
    const res = await GET(
      req('http://localhost/api/providers/discover?lat=-34.6&lng=-58.4'),
    );

    const { providers } = await res.json();
    expect(providers.map((p) => p.id)).toEqual([2, 1]); // nearest first
    expect(providers[0].distance_km).toBeLessThan(providers[1].distance_km);
    expect(typeof providers[0].distance_km).toBe('number');
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
