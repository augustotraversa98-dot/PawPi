import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/emergency-card/links — owner creates a revocable vet link (ticket 2.51).

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const post = (body) =>
  new Request('http://localhost/api/emergency-card/links', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/emergency-card/links', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post({ petId: 5 }))).status).toBe(401);
  });

  it('rejects an invalid ttlHours', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(post({ petId: 5, ttlHours: -1 }));
    expect(res.status).toBe(400);
  });

  it('creates a scoped link for an owned pet (201) with a generated token', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1 }]) // resolveOwner
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 7, token: 'tok', scope: 'full', expires_at: null }]); // insert
    const res = await POST(post({ petId: 5, scope: 'full', ttlHours: 24 }));
    expect(res.status).toBe(201);
    expect((await res.json()).link.token).toBe('tok');
    // The insert binds owner_user_id from the resolved caller (RLS WITH CHECK then matches).
    const insertText = sql.mock.calls[2][0].join(' ');
    expect(insertText).toContain('pet_emergency_share_links');
  });

  it('404 when the pet is not owned by the caller', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);
    expect((await POST(post({ petId: 5 }))).status).toBe(404);
  });
});
