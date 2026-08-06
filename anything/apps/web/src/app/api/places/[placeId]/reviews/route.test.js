import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/POST/DELETE /api/places/[placeId]/reviews — pet-friendly PLACE reviews (migration 0074).
// GET: any authed user lists a place's reviews newest-first + PUBLIC aggregates (overall avg/count,
// pet-welcome distribution + top tier, amenity tallies). POST: the caller upserts THEIR single
// review, owner_user_id from the session (never body), every field validated before any write.
// DELETE: soft-delete the caller's own review. auth() and `sql` are mocked at the module boundary
// like the sibling provider route tests.

import { GET, POST, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { placeId: 'g-place-1' } };

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];
const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(' ')).join(' ');

const postReq = (body) =>
  new Request('http://localhost/api/places/g-place-1/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const getReq = (url = 'http://localhost/api/places/g-place-1/reviews') =>
  new Request(url);

const delReq = () =>
  new Request('http://localhost/api/places/g-place-1/reviews', { method: 'DELETE' });

const validBody = (over = {}) => ({
  overall_rating: 5,
  pet_welcome_level: 'very_welcoming',
  amenities: ['water_bowls', 'treats'],
  comment: 'Lovely spot',
  place_name: 'Corner Cafe',
  place_category: 'cafe',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/places/[placeId]/reviews', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('empty place → zeroed aggregates', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no reviews
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reviews: [],
      aggregates: {
        overall_avg: null,
        overall_count: 0,
        welcome: { distribution: {}, top_level: null },
        amenities: { count_by_key: {} },
      },
    });
    // Query scopes by place_id and hides soft-deleted rows.
    expect(allQueryText()).toContain('FROM place_reviews');
    expect(allQueryText()).toContain('deleted_at IS NULL');
    expect(lastValues()).toContain('g-place-1');
  });

  it('computes avg, welcome top_level and amenity tallies', async () => {
    auth.mockResolvedValue(SESSION);
    const REVIEWS = [
      {
        id: 3, overall_rating: 5, pet_welcome_level: 'royalty',
        amenities: ['water_bowls', 'treats'], created_at: '2026-06-03',
      },
      {
        id: 2, overall_rating: 4, pet_welcome_level: 'very_welcoming',
        amenities: ['water_bowls'], created_at: '2026-06-02',
      },
      {
        id: 1, overall_rating: 3, pet_welcome_level: 'very_welcoming',
        amenities: [], created_at: '2026-06-01',
      },
    ];
    sql.mockResolvedValueOnce(REVIEWS);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    const { reviews, aggregates } = await res.json();
    expect(reviews).toHaveLength(3);
    expect(aggregates.overall_count).toBe(3);
    expect(aggregates.overall_avg).toBe(4); // (5+4+3)/3
    expect(aggregates.welcome.distribution).toEqual({
      royalty: 1,
      very_welcoming: 2,
    });
    expect(aggregates.welcome.top_level).toBe('very_welcoming'); // most common
    expect(aggregates.amenities.count_by_key).toEqual({
      water_bowls: 2,
      treats: 1,
    });
  });

  it('overall_avg rounds to two decimals', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: 1, overall_rating: 5, pet_welcome_level: 'allowed', amenities: [] },
      { id: 2, overall_rating: 4, pet_welcome_level: 'allowed', amenities: [] },
      { id: 3, overall_rating: 4, pet_welcome_level: 'allowed', amenities: [] },
    ]);
    const res = await GET(getReq(), PARAMS);
    expect((await res.json()).aggregates.overall_avg).toBe(4.33);
  });
});

describe('POST /api/places/[placeId]/reviews', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq(validBody()), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('missing place_name → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    const res = await POST(postReq(validBody({ place_name: '' })), PARAMS);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain('INSERT INTO place_reviews');
  });

  it('bad rating → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq(validBody({ overall_rating: 6 })), PARAMS);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain('INSERT INTO place_reviews');
  });

  it('bad pet_welcome_level → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq(validBody({ pet_welcome_level: 'meh' })), PARAMS);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain('INSERT INTO place_reviews');
  });

  it('unknown amenity → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(
      postReq(validBody({ amenities: ['water_bowls', 'helipad'] })),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown amenity: helipad' });
    expect(allQueryText()).not.toContain('INSERT INTO place_reviews');
  });

  it('happy path: upserts on (owner, place_id), owner from session', async () => {
    auth.mockResolvedValue(SESSION);
    const SAVED = {
      id: 1, owner_user_id: 7, place_id: 'g-place-1', place_name: 'Corner Cafe',
      overall_rating: 5, pet_welcome_level: 'very_welcoming',
      amenities: ['water_bowls', 'treats'], comment: 'Lovely spot',
    };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([SAVED]); // upsert
    const res = await POST(postReq(validBody()), PARAMS);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ review: SAVED });

    const text = lastQueryText();
    expect(text).toContain('INSERT INTO place_reviews');
    expect(text).toContain('ON CONFLICT (owner_user_id, place_id)');
    const values = lastValues();
    expect(values).toContain(7); // owner_user_id from session
    expect(values).toContain('g-place-1'); // place_id from the path
    expect(values).toContain('Corner Cafe');
  });

  it('owner_user_id from session — a forged owner_user_id in the body is ignored', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 1 }]);
    await POST(postReq(validBody({ owner_user_id: 999 })), PARAMS);
    const values = lastValues();
    expect(values).toContain(7); // the session profile id
    expect(values).not.toContain(999); // never the forged id
  });

  it('amenities default to [] when omitted', async () => {
    auth.mockResolvedValue(SESSION);
    const body = validBody();
    delete body.amenities;
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 1 }]);
    const res = await POST(postReq(body), PARAMS);
    expect(res.status).toBe(201);
    const values = lastValues();
    expect(values).toContainEqual([]); // empty amenities array bound
  });
});

describe('DELETE /api/places/[placeId]/reviews', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('soft-deletes the caller\'s own review', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 1 }]); // update returning
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const text = lastQueryText();
    expect(text).toContain('SET deleted_at = now()');
    expect(lastValues()).toContain(7); // owner_user_id from session
  });

  it('404 when there is no live review to delete', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([]); // nothing updated
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(404);
  });
});
