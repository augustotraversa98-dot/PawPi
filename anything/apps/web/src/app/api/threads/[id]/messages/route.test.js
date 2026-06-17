import { describe, it, expect, vi, beforeEach } from 'vitest';

// /api/threads/[id]/messages — conversation view (GET paginated) + send (POST), ticket 2.5.
// auth() + `sql` mocked at the module boundary. Participant access is enforced by the
// DB RLS (0031) — proven in the integration harness; here we pin pagination, validation,
// the sender = caller forcing, and the RLS-denial → 403 mapping.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

const getReq = (query = '') =>
  new Request(`http://localhost/api/threads/100/messages${query}`);
const postReq = (body) =>
  new Request('http://localhost/api/threads/100/messages', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastValues = () => lastCall()?.slice(1) ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/threads/[id]/messages', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns messages with hasMore=false when under the page size', async () => {
    auth.mockResolvedValue(SESSION);
    const MSGS = [{ id: 2 }, { id: 1 }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce(MSGS); // messages
    const res = await GET(getReq('?limit=30'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: MSGS, hasMore: false });
  });

  it('computes hasMore when the DB returns limit+1 rows', async () => {
    auth.mockResolvedValue(SESSION);
    // limit=2 → fetch 3; 3 returned → hasMore true, slice to 2.
    const ROWS = [{ id: 3 }, { id: 2 }, { id: 1 }];
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(ROWS);
    const res = await GET(getReq('?limit=2'), PARAMS);
    const json = await res.json();
    expect(json.hasMore).toBe(true);
    expect(json.messages).toEqual([{ id: 3 }, { id: 2 }]);
  });

  it('?before= pages backwards (binds the cursor)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]);
    await GET(getReq('?before=50'), PARAMS);
    expect(lastValues()).toContain('50');
  });
});

describe('POST /api/threads/[id]/messages', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ body: 'hi' }), PARAMS);
    expect(res.status).toBe(401);
  });

  it('400 when the message has neither text nor attachment', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({ body: '   ' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('inserts the message AS the caller and bumps the thread', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 5, thread_id: 100, sender_user_id: 7, body: 'hi' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([CREATED]) // insert
      .mockResolvedValueOnce([]); // bump last_message_at
    const res = await POST(postReq({ body: 'hi' }), PARAMS);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ message: CREATED });
    // sender forced to the resolved profile id (7), never client-supplied.
    expect(sql.mock.calls[1].slice(1)).toContain(7);
  });

  it('maps an RLS denial on insert to 403 (non-participant)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockRejectedValueOnce(new Error('new row violates row-level security policy'));
    const res = await POST(postReq({ body: 'hi' }), PARAMS);
    expect(res.status).toBe(403);
  });

  it('accepts an attachment-only message', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 6, attachment_url: 'https://x/y.jpg' }])
      .mockResolvedValueOnce([]);
    const res = await POST(
      postReq({ attachment_url: 'https://x/y.jpg' }),
      PARAMS,
    );
    expect(res.status).toBe(201);
  });
});
