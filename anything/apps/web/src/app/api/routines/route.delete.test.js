import { describe, it, expect, vi, beforeEach } from 'vitest';

// Soft-delete contract for DELETE /api/routines (Routine-deletion ticket).
// The route must SOFT delete — set deleted_at + is_active=false, scoped to the
// owner's user_profiles.id and only while deleted_at IS NULL — never hard-delete,
// so past health logs are preserved. Session + DB are mocked at the module
// boundary (same approach as pets/route.test.js); the point is the route contract,
// not a live DB.

import { DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = {
  user: { id: 42, email: 'owner@example.com', name: 'Pat Owner' },
  expires: '9999999999',
};
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const req = (id) =>
  new Request(
    `http://localhost/api/routines${id != null ? `?id=${id}` : ''}`,
    { method: 'DELETE' },
  );

describe('DELETE /api/routines — soft delete', () => {
  it('authed + owned routine -> 200 success and performs a soft delete (no hard delete)', async () => {
    auth.mockResolvedValue(SESSION);
    // 1st sql call: profile lookup. 2nd: the soft-delete UPDATE returning the id.
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([{ id: 55 }]);

    const res = await DELETE(req(55));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // The write is an UPDATE that sets deleted_at + is_active=false, scoped to the
    // owner and guarded by deleted_at IS NULL — never a DELETE FROM (no hard delete,
    // history preserved).
    const writeSql = sql.mock.calls[1][0].join(' ');
    expect(writeSql).toMatch(/UPDATE routines/i);
    expect(writeSql).toMatch(/deleted_at = NOW\(\)/i);
    expect(writeSql).toMatch(/is_active = false/i);
    expect(writeSql).toMatch(/deleted_at IS NULL/i);
    expect(writeSql).not.toMatch(/DELETE FROM/i);
  });

  it('anonymous -> 401, NOT 500, and never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await DELETE(req(55));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(sql).not.toHaveBeenCalled();
  });

  it('missing id -> 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);

    const res = await DELETE(req(undefined));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Routine ID is required' });
  });

  it("not owned / already deleted (no row updated) -> 403", async () => {
    auth.mockResolvedValue(SESSION);
    // Profile found, but the guarded UPDATE matches no row.
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]);

    const res = await DELETE(req(999));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Routine not found or access denied',
    });
  });
});
