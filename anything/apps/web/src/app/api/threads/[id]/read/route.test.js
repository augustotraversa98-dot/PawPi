import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/threads/[id]/read — mark a thread read (ticket 2.5). RLS scopes the UPDATE
// to threads the caller participates in; here we pin the auth gate + the "other side,
// unread" predicate + the updated count return.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

const req = () =>
  new Request('http://localhost/api/threads/100/read', { method: 'POST' });

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/threads/[id]/read', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(401);
  });

  it('marks the other side\'s unread messages read and returns the count', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // UPDATE ... RETURNING id
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    const text = lastQueryText();
    expect(text).toContain('UPDATE messages');
    expect(text).toContain('sender_user_id <>');
    expect(text).toContain('read_at IS NULL');
  });
});
