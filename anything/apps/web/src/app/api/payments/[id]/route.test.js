import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/payments/[id] — owner/provider scoped read. The scope WHERE is in the SQL;
// the test proves anon→401, a visible payment returns 200, and an invisible/missing one
// returns 404 (existence not leaked).

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '99' } };
const req = () => new Request('http://localhost/api/payments/99');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe('GET /api/payments/[id]', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('returns the payment when visible to the caller', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 99, order_id: 10, status: 'approved' }]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).payment).toMatchObject({ id: 99, status: 'approved' });
    // The scoped query joins orders and gates on owner OR active staff.
    const q = sql.mock.calls[0][0].join(' ');
    expect(q).toContain('FROM payments');
    expect(q).toContain('JOIN orders');
    expect(q).toContain('provider_staff');
  });

  it('404 when not visible / not found (no existence leak)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // scoped query returns nothing
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
  });
});
