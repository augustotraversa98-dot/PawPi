import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/posts/streak (ticket 2.37) — returns a pet's recent daily-post days;
// the client computes the streak. Session + DB mocked at the module boundary.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const req = (qs = '') => new Request(`http://localhost/api/posts/streak${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/posts/streak', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req('?petId=3'));
    expect(res.status).toBe(401);
  });

  it('400 on a missing/invalid petId', async () => {
    auth.mockResolvedValue({ user: { id: 'a1' } });
    const res = await GET(req());
    expect(res.status).toBe(400);
  });

  it('returns normalized YYYY-MM-DD daily post dates', async () => {
    auth.mockResolvedValue({ user: { id: 'a1' } });
    sql.mockResolvedValueOnce([
      { post_date: '2026-06-18' },
      { post_date: new Date('2026-06-17T00:00:00Z') },
    ]);

    const res = await GET(req('?petId=3'));
    expect(res.status).toBe(200);
    const { dailyPostDates } = await res.json();
    expect(dailyPostDates).toEqual(['2026-06-18', '2026-06-17']);
  });
});
