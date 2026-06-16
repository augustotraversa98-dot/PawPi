import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST/GET /api/providers/[id]/reviews — Phase 2 ticket 2.2 (reviews surfacing).
// POST: the pet's OWNER writes a review, gated on a COMPLETED booking with this provider,
// one review per completed booking (dedup), owner_user_id from the session (never body),
// rating 1–5. GET: any authed user lists a published provider's reviews (reviewer + pet +
// rating + body + date), paginated. auth() and `sql` are mocked at the module boundary like
// the sibling provider route tests.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];
const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(' ')).join(' ');

const postReq = (body) =>
  new Request('http://localhost/api/providers/100/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const getReq = (url = 'http://localhost/api/providers/100/reviews') =>
  new Request(url);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/[id]/reviews', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('draft/unknown provider → 404, no review query', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 100, status: 'draft' }]);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(404);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('published provider → reviews with reviewer + pet context', async () => {
    auth.mockResolvedValue(SESSION);
    const REVIEWS = [
      {
        id: 1,
        provider_id: 100,
        pet_id: 5,
        rating: 5,
        body: 'Great',
        created_at: '2026-06-01',
        reviewer_name: 'Augusto',
        pet_name: 'Rex',
      },
    ];
    sql
      .mockResolvedValueOnce([{ id: 100, status: 'published' }]) // provider published
      .mockResolvedValueOnce(REVIEWS); // reviews
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: REVIEWS });
    const text = allQueryText();
    expect(text).toContain('reviewer_name');
    expect(text).toContain('pet_name');
    expect(text).toContain('FROM provider_reviews');
  });

  it('paginates with bounded ?limit / ?offset', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 100, status: 'published' }])
      .mockResolvedValueOnce([]);
    await GET(getReq('http://localhost/api/providers/100/reviews?limit=999&offset=10'), PARAMS);
    const values = lastValues();
    expect(values).toContain(50); // limit clamped to MAX_LIMIT
    expect(values).toContain(10); // offset
  });
});

describe('POST /api/providers/[id]/reviews', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ rating: 5 }), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('rating out of range → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    const res = await POST(postReq({ rating: 6 }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // profile lookup only
  });

  it('missing rating → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({ body: 'no rating' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('draft/unknown provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 100, status: 'draft' }]); // provider not published
    const res = await POST(postReq({ rating: 5 }), PARAMS);
    expect(res.status).toBe(404);
  });

  it('no completed booking with this provider → 403, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 100, status: 'published' }]) // provider published
      .mockResolvedValueOnce([]) // no un-reviewed completed booking
      .mockResolvedValueOnce([]); // no completed booking at all
    const res = await POST(postReq({ rating: 5 }), PARAMS);
    expect(res.status).toBe(403);
    // The booking gate filters on status='completed'.
    expect(allQueryText()).toContain("status = 'completed'");
    // Never reached an INSERT.
    expect(allQueryText()).not.toContain('INSERT INTO provider_reviews');
  });

  it('completed booking exists but ALL already reviewed → 409 (one-per-booking dedup)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 100, status: 'published' }]) // provider published
      .mockResolvedValueOnce([]) // no UN-reviewed completed booking
      .mockResolvedValueOnce([{ '?column?': 1 }]); // but a completed booking DOES exist
    const res = await POST(postReq({ rating: 5 }), PARAMS);
    expect(res.status).toBe(409);
    expect(allQueryText()).not.toContain('INSERT INTO provider_reviews');
  });

  it('supplied pet_id not owned → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 100, status: 'published' }]) // provider published
      .mockResolvedValueOnce([{ id: 55 }]) // un-reviewed completed booking (appt id 55)
      .mockResolvedValueOnce([]); // pet ownership: not my pet
    const res = await POST(postReq({ rating: 5, pet_id: 999 }), PARAMS);
    expect(res.status).toBe(403);
  });

  it('happy path: inserts a review tied to the completed booking, owner from session', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = {
      id: 1,
      provider_id: 100,
      owner_user_id: 7,
      pet_id: 5,
      appointment_id: 55,
      rating: 5,
      body: 'Wonderful care',
    };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 100, status: 'published' }]) // provider published
      .mockResolvedValueOnce([{ id: 55 }]) // un-reviewed completed booking
      .mockResolvedValueOnce([{ pet_id: 5 }]) // booking's pet (no pet_id supplied)
      .mockResolvedValueOnce([CREATED]); // insert
    const res = await POST(postReq({ rating: 5, body: 'Wonderful care' }), PARAMS);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ review: CREATED });

    const text = lastQueryText();
    expect(text).toContain('INSERT INTO provider_reviews');
    expect(text).toContain('appointment_id');
    const values = lastValues();
    expect(values).toContain('100'); // provider_id (path id)
    expect(values).toContain(7); // owner_user_id = me (from session, not body)
    expect(values).toContain(55); // appointment_id (the completed booking)
    expect(values).toContain(5); // pet_id from the booking
    expect(values).toContain('Wonderful care');
  });

  it('owner_user_id from session — a forged owner_user_id in the body is ignored', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 100, status: 'published' }])
      .mockResolvedValueOnce([{ id: 55 }])
      .mockResolvedValueOnce([{ pet_id: 5 }])
      .mockResolvedValueOnce([{ id: 1 }]);
    await POST(postReq({ rating: 4, owner_user_id: 999 }), PARAMS);
    const values = lastValues();
    expect(values).toContain(7); // the session profile id
    expect(values).not.toContain(999); // never the forged id
  });
});
