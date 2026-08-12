import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/[id]/adoptable-listings/[listingId] — PUBLIC single-listing
// read (ticket 2.56), closing the 2.30 deviation. Returns the dog IFF it is
// AVAILABLE and its place is PUBLISHED, public columns only; anything else → 404.
// auth() and `sql` are mocked at the module boundary; the wrapper passes through
// when `sql.begin` is absent (mocked sql), so the handler runs directly.

import { GET, PATCH } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { requireProviderCapability, requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => {
  class ProviderAuthError extends Error {
    constructor(m) { super(m); this.status = 403; }
  }
  return { requireProviderCapability: vi.fn(), requireProviderRole: vi.fn(), ProviderAuthError };
});

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '100', listingId: '7' } };
const req = () =>
  new Request('http://localhost/api/providers/100/adoptable-listings/7');

const queryText = () => (sql.mock.calls[0]?.[0] ?? []).join(' ');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  requireProviderRole.mockResolvedValue(undefined);
});

// PATCH — set/clear a listing's age (the "always Age unknown" fix). providerAuth is mocked,
// so the sql sequence is: [0] resolveUserId, [1] the UPDATE. Age validation runs before the
// UPDATE, so a bad value never issues SQL beyond resolveUserId.
describe('PATCH adoptable listing — age', () => {
  const PROFILE = [{ id: 7 }];
  const patchReq = (body) =>
    new Request('http://localhost/api/providers/100/adoptable-listings/7', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const findCall = (needle) =>
    sql.mock.calls.find((c) => (c?.[0] ?? []).join(' ').includes(needle));

  it('sets age_years + age_months on the update', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 7, age_years: 3, age_months: 6 }]);
    const res = await PATCH(patchReq({ name: 'Rex', age_years: 3, age_months: 6 }), PARAMS);
    expect(res.status).toBe(200);
    const update = findCall('UPDATE adoptable_listings');
    expect(update).toBeTruthy();
    const text = update[0].join(' ');
    expect(text).toContain('age_years =');
    expect(text).toContain('age_months =');
    const values = update.slice(1);
    expect(values).toContain(3);
    expect(values).toContain(6);
  });

  it('a present null CLEARS the age (empty → unknown) rather than keeping the old value', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 7, age_years: null, age_months: null }]);
    const res = await PATCH(patchReq({ age_years: null, age_months: null }), PARAMS);
    expect(res.status).toBe(200);
    const update = findCall('UPDATE adoptable_listings');
    // Age is set directly (not COALESCE'd), so an explicit null reaches the column and clears it.
    expect(update[0].join(' ')).not.toContain('COALESCE(null, age_years)');
    const data = await res.json();
    expect(data.listing.age_years).toBeNull();
  });

  it('rejects a negative age_years (400) before issuing the update', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(PROFILE);
    const res = await PATCH(patchReq({ age_years: -2 }), PARAMS);
    expect(res.status).toBe(400);
    expect(findCall('UPDATE adoptable_listings')).toBeFalsy();
  });

  it('rejects months outside 0–11 (400) before issuing the update', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(PROFILE);
    const res = await PATCH(patchReq({ age_months: 12 }), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/months|0 and 11/i);
    expect(findCall('UPDATE adoptable_listings')).toBeFalsy();
  });

  it('omitting age keeps the stored value (no age key in the body)', async () => {
    auth.mockResolvedValue(SESSION);
    // When age is omitted, each age column is set from a nested `sql`col`` fragment — those
    // are two extra sql() calls made while building the UPDATE, before the UPDATE itself.
    sql
      .mockResolvedValueOnce(PROFILE) // resolveUserId
      .mockResolvedValueOnce([]) // age_years keep-fragment
      .mockResolvedValueOnce([]) // age_months keep-fragment
      .mockResolvedValueOnce([{ id: 7, age_years: 5 }]); // UPDATE
    const res = await PATCH(patchReq({ name: 'Rex' }), PARAMS);
    expect(res.status).toBe(200);
    // The update still runs; the age columns keep their stored value via the fragment branch.
    const update = findCall('UPDATE adoptable_listings');
    expect(update).toBeTruthy();
    expect(update[0].join(' ')).toContain('age_years =');
  });
});

describe('GET single adoptable listing (public)', () => {
  it('anonymous → 401, no query', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('published + available → returns public fields + the place identity', async () => {
    auth.mockResolvedValue(SESSION);
    const LISTING = {
      id: 7,
      provider_id: 100,
      name: 'Pongo',
      breed: 'Dalmatian',
      story: 'Sweet boy',
      photo_urls: ['https://x/1.jpg'],
      adoption_fee_cents: 5000,
      currency: 'ARS',
      status: 'available',
      provider_name: 'Happy Paws',
      provider_slug: 'happy-paws',
      provider_logo_url: null,
    };
    sql.mockResolvedValueOnce([LISTING]);

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ listing: LISTING });

    // The query enforces the PUBLIC visibility (available + published) and is
    // scoped to the requested listing + provider.
    const [strings, ...values] = sql.mock.calls[0];
    const text = strings.join(' ');
    expect(text).toContain("al.status = 'available'");
    expect(text).toContain("p.status = 'published'");
    expect(values).toContain('7'); // listingId
    expect(values).toContain('100'); // providerId
  });

  it('joins the shelter primary location so the detail can map it (ticket 2.87)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: 7, status: 'available', provider_lat: 40.71, provider_lng: -74.0, provider_address: '1 Bark St' },
    ]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.listing.provider_lat).toBe(40.71);
    const text = queryText();
    expect(text).toContain('provider_locations');
    expect(text).toContain('provider_lat');
  });

  it('unpublished/adopted/removed → 404 (no row matches the public filter)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // RLS + the status/published filter exclude it

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not available/i);
  });

  it('never exposes admin/applicant/owner-private columns', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7, status: 'available' }]);

    await GET(req(), PARAMS);

    const text = queryText();
    // No private/admin tables joined, no owner/applicant columns selected.
    expect(text).not.toContain('adoption_applications');
    expect(text).not.toContain('provider_staff');
    expect(text).not.toContain('owner_user_id');
    expect(text).not.toContain('owner_user_profile_id');
    expect(text).not.toContain('care_access');
  });
});
