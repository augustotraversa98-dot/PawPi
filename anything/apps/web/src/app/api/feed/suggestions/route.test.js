import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/feed/suggestions — Phase 2 ticket 2.13 feed integration. The PUBLIC sibling
// endpoint that supplies provider + adoption "suggestion" cards the mobile feed interleaves
// between pet posts. auth() and `sql` are mocked at the module boundary; each `await sql\`...\``
// consumes one mockResolvedValueOnce in order. This endpoint is unscoped public read — no
// resolveUserId / user_profiles lookup, never care_access_grants, posts, pets, or owner data.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(' ')).join(' ');

const req = (url = 'http://localhost/api/feed/suggestions') => new Request(url);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/feed/suggestions', () => {
  it('anonymous → 401, no query', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('returns interleaveable provider + adoption suggestions, each with its kind discriminator', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([
        { id: 1, slug: 'happy-paws', name: 'Happy Paws', provider_type: 'vet', bio: null, logo_url: null, avg_rating: 4.5, review_count: 3 },
      ]) // providers
      .mockResolvedValueOnce([
        { id: 9, provider_id: 5, name: 'Rex', breed: 'Lab', photo_urls: ['x'], provider_slug: 'shelter-x', provider_name: 'Shelter X' },
      ]); // adoptions

    const res = await GET(req());

    expect(res.status).toBe(200);
    const { suggestions } = await res.json();
    // Two distinct card types, each tagged with a clear discriminator.
    expect(suggestions.providers).toHaveLength(1);
    expect(suggestions.adoptions).toHaveLength(1);
    expect(suggestions.providers[0].kind).toBe('provider');
    expect(suggestions.adoptions[0].kind).toBe('adoption');
    // Public business / dog-profile fields pass through untouched.
    expect(suggestions.providers[0].name).toBe('Happy Paws');
    expect(suggestions.adoptions[0].name).toBe('Rex');
    expect(suggestions.adoptions[0].provider_slug).toBe('shelter-x');
  });

  it('providers query is published-only with the rating aggregate (2.2); adoptions are available-of-published', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await GET(req());

    const text = allQueryText();
    // Drafts excluded by the query, not in code.
    expect(text).toContain("status = 'published'");
    expect(text).toContain('avg_rating');
    expect(text).toContain('review_count');
    expect(text).toContain('provider_reviews');
    // Adoption suggestions are restricted to AVAILABLE listings of PUBLISHED places — the
    // exact discovery-visible set (mirrors RLS 0038), never pending/adopted/draft.
    expect(text).toContain("l.status = 'available'");
    expect(text).toContain("pr.status = 'published'");
  });

  it('?type=vet matches providers by CAPABILITY (JOIN provider_capabilities), bound param', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await GET(req('http://localhost/api/feed/suggestions?type=vet'));

    const [strings, ...values] = sql.mock.calls[0];
    const providerText = strings.join(' ');
    expect(providerText).toContain('JOIN provider_capabilities');
    expect(providerText).toContain('pc.capability =');
    expect(values).toContain('vet'); // bound, not interpolated
  });

  // ── THE NO-LEAK ASSERTIONS (ticket-mandated, explicit) ──
  it('NEVER selects owner identity, staff, applicant, or any pet/medical/owned table', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await GET(req('http://localhost/api/feed/suggestions?type=vet'));

    const text = allQueryText();
    // Provider owner identity + staff list never projected.
    expect(text).not.toContain('owner_user_profile_id');
    expect(text).not.toContain('provider_staff');
    // Consent ledger never touched.
    expect(text).not.toContain('care_access');
    // Adoption applicant identity never projected.
    expect(text).not.toContain('applicant');
    expect(text).not.toContain('adoption_applications');
    // No owner/medical/social tables.
    expect(text).not.toContain('user_profiles');
    expect(text).not.toContain('owner_user_id');
    expect(text).not.toMatch(/\bFROM posts\b/);
    expect(text).not.toMatch(/\bFROM pets\b/);
    expect(text).not.toContain('medical');
  });

  it('no-leak at the PAYLOAD level: response carries no owner/applicant/medical keys', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([
        { id: 1, slug: 's', name: 'P', provider_type: 'vet', bio: null, logo_url: null, avg_rating: null, review_count: 0 },
      ])
      .mockResolvedValueOnce([
        { id: 9, provider_id: 5, name: 'Rex', breed: 'Lab', age_years: 2, age_months: 0, gender: 'm', size: 'L', photo_urls: ['x'], energy_level: 'high', adoption_fee_cents: 0, currency: 'ARS', provider_slug: 'sx', provider_name: 'SX' },
      ]);

    const res = await GET(req());
    const { suggestions } = await res.json();

    const allKeys = [
      ...suggestions.providers.flatMap((p) => Object.keys(p)),
      ...suggestions.adoptions.flatMap((a) => Object.keys(a)),
    ];
    for (const banned of [
      'owner_user_profile_id',
      'owner_user_id',
      'applicant_owner_user_id',
      'user_id',
      'auth_user_id',
      'medical',
      'story', // private free-text not surfaced on a feed card
    ]) {
      expect(allKeys).not.toContain(banned);
    }
  });

  it('caps the fetch of each source (LIMIT) so the feed can never be flooded', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await GET(req('http://localhost/api/feed/suggestions?providerLimit=999&adoptionLimit=999'));

    // Both queries carry a LIMIT and the bound value is clamped to the cap (10), not 999.
    expect(allQueryText()).toContain('LIMIT');
    const providerValues = sql.mock.calls[0].slice(1);
    const adoptionValues = sql.mock.calls[1].slice(1);
    expect(providerValues).toContain(10);
    expect(adoptionValues).toContain(10);
  });
});
