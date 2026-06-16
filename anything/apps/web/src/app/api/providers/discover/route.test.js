import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/discover — the owner-facing PUBLIC browse view (ticket 5).
// Any logged-in user; NO provider_staff membership. Returns ONLY published
// providers, public business fields only. auth() and `sql` are mocked at the
// module boundary. Unlike the 4a routes there is no requireProviderRole and no
// resolveUserId — discovery is unscoped public read.

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

  it("?type=vet matches by CAPABILITY (JOIN provider_capabilities), not provider_type", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, provider_type: 'vet' }]);

    const res = await GET(req('http://localhost/api/providers/discover?type=vet'));

    expect(res.status).toBe(200);
    const [strings, ...values] = sql.mock.calls[0];
    const text = strings.join(' ');
    // Ticket 2.1: filter is on provider_capabilities.capability via a JOIN, not on
    // the providers.provider_type column.
    expect(text).toContain('JOIN provider_capabilities');
    expect(text).toContain('pc.capability =');
    expect(text).not.toContain('provider_type = ');
    expect(text).toContain("status = 'published'");
    expect(values).toContain('vet'); // bound param, not interpolated
  });

  it('no ?type → unfiltered published query (no capability JOIN)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req());

    const [strings] = sql.mock.calls[0];
    expect(strings.join(' ')).not.toContain('provider_capabilities');
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

  it('ticket 2.2: aggregates also present on the ?type filtered query', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(req('http://localhost/api/providers/discover?type=vet'));

    const text = allQueryText();
    expect(text).toContain('avg_rating');
    expect(text).toContain('review_count');
  });
});
