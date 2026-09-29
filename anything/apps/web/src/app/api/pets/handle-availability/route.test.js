import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level smoke, mirroring src/app/api/pets/route.test.js: session and DB
// are mocked at the module boundary — no live DB. Proves the contract the
// onboarding handle step (step 2) relies on: authed + free -> available: true,
// authed + taken -> available: false, anonymous -> 401 never touches the DB.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = {
  user: { id: 42, email: 'owner@example.com', name: 'Pat Owner' },
  expires: '9999999999',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/pets/handle-availability — authenticated path', () => {
  it('handle not in use -> 200 { available: true }', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no pet row with this handle

    const res = await GET(
      new Request('http://localhost/api/pets/handle-availability?handle=newpup'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
  });

  it('handle already on a pet -> 200 { available: false }', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1 }]);

    const res = await GET(
      new Request('http://localhost/api/pets/handle-availability?handle=max'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
  });

  it('normalizes the handle (lowercase, trims, strips a leading @) before querying', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    await GET(
      new Request(
        'http://localhost/api/pets/handle-availability?handle=' +
          encodeURIComponent('  @Buddy_Dog  '),
      ),
    );

    // sql`...${handle}...` calls the mocked tagged-template fn as (strings, handle).
    expect(sql.mock.calls[0][1]).toBe('buddy_dog');
  });

  it('missing handle -> 400, never touches the DB', async () => {
    auth.mockResolvedValue(SESSION);

    const res = await GET(
      new Request('http://localhost/api/pets/handle-availability'),
    );

    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('anonymous -> 401, NOT 500, and never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await GET(
      new Request('http://localhost/api/pets/handle-availability?handle=max'),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(sql).not.toHaveBeenCalled();
  });
});
