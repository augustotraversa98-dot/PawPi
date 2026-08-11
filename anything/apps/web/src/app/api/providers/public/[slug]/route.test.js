import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/public/[slug] — a single PUBLISHED provider's public profile
// (ticket 5). Any logged-in user; returns public business fields + locations +
// ACTIVE services only. Never staff, never owner identity, never pet data. A draft
// slug → 404. auth() and `sql` are mocked at the module boundary; there is no
// requireProviderRole/resolveUserId (unscoped public read).

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { slug: 'happy-paws' } };

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(' ')).join(' ');

const req = () => new Request('http://localhost/api/providers/public/happy-paws');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/public/[slug]', () => {
  it('anonymous → 401, no query', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('a draft/unpublished slug → 404 (only published rows match)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no published provider for this slug

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    // The lookup itself filters on published — drafts can never match.
    const [strings, ...values] = sql.mock.calls[0];
    expect(strings.join(' ')).toContain("status = 'published'");
    expect(values).toContain('happy-paws');
    // No follow-up location/service queries once the provider 404s.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('published provider → public fields + locations + ACTIVE services + items + posts', async () => {
    auth.mockResolvedValue(SESSION);
    const PROVIDER = {
      id: 100,
      slug: 'happy-paws',
      name: 'Happy Paws',
      provider_type: 'vet',
      bio: 'We care',
      logo_url: null,
      cover_image_url: 'https://x/cover.png',
    };
    const LOCATIONS = [{ id: 5, name: 'Main', address: '1 St' }];
    const SERVICES = [{ id: 9, name: 'Checkup', active: true }];
    const PRODUCTS = [{ id: 3, name: 'Kibble', price_cents: 5000 }];
    const POSTS = [{ id: 7, body: 'Hello', image_urls: [], created_at: 'now' }];
    sql
      .mockResolvedValueOnce([PROVIDER]) // provider lookup
      .mockResolvedValueOnce(LOCATIONS) // locations
      .mockResolvedValueOnce(SERVICES) // active services
      .mockResolvedValueOnce([{ capability: 'shop' }, { capability: 'vet' }]) // capabilities
      .mockResolvedValueOnce(PRODUCTS) // active products
      .mockResolvedValueOnce(POSTS); // posts

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: PROVIDER,
      locations: LOCATIONS,
      services: SERVICES,
      capabilities: ['shop', 'vet'],
      products: PRODUCTS,
      // Phase C: every post carries comment_count. The to_regclass probe is unmocked here, so the
      // guard falls back to 0 (the real count path is covered by the integration test).
      posts: POSTS.map((p) => ({ ...p, comment_count: 0 })),
    });

    // Services query is scoped to the resolved provider id and active=true only.
    const [svcStrings, ...svcValues] = sql.mock.calls[2];
    expect(svcStrings.join(' ')).toContain('active = true');
    expect(svcValues).toContain(100);
  });

  it('ticket 2.22: posts are paginated, filter hidden_at, and expose author_user_id for Block (Guideline 1.2)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 100, slug: 'happy-paws' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]) // products
      .mockResolvedValueOnce([]); // posts

    await GET(
      new Request(
        'http://localhost/api/providers/public/happy-paws?postsLimit=5&postsOffset=10',
      ),
      PARAMS,
    );

    // The posts query (call index 5) is LIMIT/OFFSET bound, hides moderated posts, and now
    // surfaces author_user_id + is_own so the mobile ModerationMenu can Block/own-detect.
    const [postStrings, ...postValues] = sql.mock.calls[5];
    const postText = postStrings.join(' ');
    expect(postText).toContain('provider_posts');
    expect(postText).toContain('LIMIT');
    expect(postText).toContain('OFFSET');
    expect(postText).toContain('hidden_at IS NULL');
    expect(postText).toContain('author_user_id');
    expect(postText).toContain('is_own');
    expect(postValues).toContain(5); // bound limit
    expect(postValues).toContain(10); // bound offset
  });

  it('response carries NO staff list and NO owner_user_profile_id', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 100, slug: 'happy-paws', name: 'Happy Paws' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]) // capabilities
      .mockResolvedValueOnce([]) // products
      .mockResolvedValueOnce([]); // posts

    const res = await GET(req(), PARAMS);
    const body = await res.json();

    expect(body).not.toHaveProperty('staff');
    expect(body.provider).not.toHaveProperty('owner_user_profile_id');
    // No SQL path touches provider_staff or the owner column.
    const text = allQueryText();
    expect(text).not.toContain('provider_staff');
    expect(text).not.toContain('owner_user_profile_id');
  });

  it('never queries care_access_grants (structural)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 100, slug: 'happy-paws' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]) // capabilities
      .mockResolvedValueOnce([]) // products
      .mockResolvedValueOnce([]); // posts

    await GET(req(), PARAMS);

    expect(allQueryText()).not.toContain('care_access');
  });

  it('Phase 2a: services + products order featured-first and project the merchandising columns; provider projects storefront_section_order', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 100, slug: 'happy-paws' }]) // provider lookup
      .mockResolvedValueOnce([]) // locations
      .mockResolvedValueOnce([]) // services
      .mockResolvedValueOnce([]) // capabilities
      .mockResolvedValueOnce([]) // products
      .mockResolvedValueOnce([]); // posts

    await GET(req(), PARAMS);

    // Provider lookup (call 0) projects the section-order override column.
    expect(sql.mock.calls[0][0].join(' ')).toContain('storefront_section_order');

    // Services (call 2): featured-first ordering + is_featured/sort_order in the projection.
    const svcText = sql.mock.calls[2][0].join(' ');
    expect(svcText).toContain('ORDER BY is_featured DESC, sort_order ASC, created_at ASC');
    expect(svcText).toContain('is_featured');
    expect(svcText).toContain('sort_order');

    // Products (call 4): featured-first ordering + the discount/sort/featured projection.
    const prodText = sql.mock.calls[4][0].join(' ');
    expect(prodText).toContain('ORDER BY is_featured DESC, sort_order ASC, created_at DESC');
    expect(prodText).toContain('is_featured');
    expect(prodText).toContain('sort_order');
    expect(prodText).toContain('compare_at_cents');
  });

  it('ticket 2.2: the provider lookup aggregates avg_rating + review_count', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 100, slug: 'happy-paws' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]) // products
      .mockResolvedValueOnce([]); // posts

    await GET(req(), PARAMS);

    // The FIRST query (the provider lookup) carries the rating aggregate subqueries.
    const [strings] = sql.mock.calls[0];
    const text = strings.join(' ');
    expect(text).toContain('avg_rating');
    expect(text).toContain('review_count');
    expect(text).toContain('provider_reviews');
  });
});
