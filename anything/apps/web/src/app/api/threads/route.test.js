import { describe, it, expect, vi, beforeEach } from 'vitest';

// /api/threads — owner ↔ provider chat thread list + start (ticket 2.5).
// auth() + `sql` mocked at the module boundary (the 2.x route-test convention);
// resolveUserId runs for real against the mocked sql. The DB-level participant RLS
// (0031) is proven separately in the integration harness — these unit tests pin the
// route's auth gates, scoping, idempotent-start, and validation.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

const getReq = (query = '') =>
  new Request(`http://localhost/api/threads${query}`);
const postReq = (body) =>
  new Request('http://localhost/api/threads', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/threads', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('404 when no profile row', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // resolveUserId → no profile
    const res = await GET(getReq());
    expect(res.status).toBe(404);
  });

  it('owner side: returns my threads', async () => {
    auth.mockResolvedValue(SESSION);
    const THREADS = [{ id: 1, owner_user_id: 7, provider_id: 10, unread_count: 2 }];
    // resolveUserId, then the WHERE-clause tagged template (nested s`...`), then the
    // threadCards SELECT that returns the rows.
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]) // nested WHERE-clause template
      .mockResolvedValueOnce(THREADS); // threadCards SELECT
    const res = await GET(getReq('?side=owner'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ threads: THREADS });
  });

  it('provider side without providerId → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await GET(getReq('?side=provider'));
    expect(res.status).toBe(400);
  });

  it('provider side with providerId returns threads', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]) // nested WHERE-clause template
      .mockResolvedValueOnce([{ id: 5 }]); // threadCards SELECT
    const res = await GET(getReq('?side=provider&providerId=10'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ threads: [{ id: 5 }] });
  });
});

describe('POST /api/threads', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ providerId: 10 }));
    expect(res.status).toBe(401);
  });

  it('400 when providerId missing', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('404 when provider is not published', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 10, status: 'draft' }]); // provider lookup
    const res = await POST(postReq({ providerId: 10 }));
    expect(res.status).toBe(404);
  });

  it('reuses an existing general thread (idempotent start)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 10, status: 'published' }]) // provider
      .mockResolvedValueOnce([{ id: 99 }]); // existing thread
    const res = await POST(postReq({ providerId: 10 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ thread: { id: 99 }, reused: true });
  });

  it('creates a new thread when none exists', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 100, owner_user_id: 7, provider_id: 10, booking_id: null };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 10, status: 'published' }]) // provider
      .mockResolvedValueOnce([]) // no existing thread
      .mockResolvedValueOnce([CREATED]); // insert
    const res = await POST(postReq({ providerId: 10 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ thread: CREATED, reused: false });
  });

  it('400 when booking_id is not the caller\'s booking with this provider', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 10, status: 'published' }]) // provider
      .mockResolvedValueOnce([]); // booking lookup → none
    const res = await POST(postReq({ providerId: 10, booking_id: 55 }));
    expect(res.status).toBe(400);
  });
});
