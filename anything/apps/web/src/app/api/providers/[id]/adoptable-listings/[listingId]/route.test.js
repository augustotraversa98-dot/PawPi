import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/[id]/adoptable-listings/[listingId] — PUBLIC single-listing
// read (ticket 2.56), closing the 2.30 deviation. Returns the dog IFF it is
// AVAILABLE and its place is PUBLISHED, public columns only; anything else → 404.
// auth() and `sql` are mocked at the module boundary; the wrapper passes through
// when `sql.begin` is absent (mocked sql), so the handler runs directly.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '100', listingId: '7' } };
const req = () =>
  new Request('http://localhost/api/providers/100/adoptable-listings/7');

const queryText = () => (sql.mock.calls[0]?.[0] ?? []).join(' ');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
