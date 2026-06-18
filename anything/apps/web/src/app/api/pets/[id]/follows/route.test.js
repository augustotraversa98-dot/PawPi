import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/pets/[id]/follows (ticket 2.61): followers/following lists with public
// pet fields only + an is_following flag for the viewer's pet. Session + DB mocked.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const req = (qs = '') =>
  new Request(`http://localhost/api/pets/7/follows${qs}`);
const queryText = (callIndex) => sql.mock.calls[callIndex][0].join('?');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/pets/[id]/follows', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req('?rel=followers'), { params: { id: '7' } });
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('400 on an invalid rel', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    const res = await GET(req('?rel=bogus'), { params: { id: '7' } });
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('400 on a non-numeric pet id', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    const res = await GET(req('?rel=followers'), { params: { id: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('followers: returns public fields + is_following, scoped by followed_pet_id', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql.mockResolvedValueOnce([
      {
        id: 9,
        name: 'Rex',
        handle: 'rex',
        avatar_url: 'a.jpg',
        full_name: 'Bob',
        username: 'bob',
        is_following: true,
        // A private field that must NOT be forwarded:
        notes: 'SECRET medical note',
      },
    ]);

    const res = await GET(req('?rel=followers&viewerPetId=4'), {
      params: { id: '7' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pets).toEqual([
      {
        id: 9,
        name: 'Rex',
        handle: 'rex',
        avatar_url: 'a.jpg',
        owner_name: 'Bob',
        is_following: true,
      },
    ]);
    // No private/medical leakage.
    expect(JSON.stringify(body)).not.toContain('SECRET');
    expect(JSON.stringify(body)).not.toContain('notes');

    const q = queryText(0).toLowerCase();
    expect(q).toContain('from pet_follows');
    expect(q).toContain('join pets p on p.id = f.follower_pet_id');
    expect(q).toContain('where f.followed_pet_id =');
  });

  it('following: scoped by follower_pet_id (the followed pets)', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql.mockResolvedValueOnce([]);
    const res = await GET(req('?rel=following&viewerPetId=4'), {
      params: { id: '7' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pets).toEqual([]); // empty list, not fakes

    const q = queryText(0).toLowerCase();
    expect(q).toContain('join pets p on p.id = f.followed_pet_id');
    expect(q).toContain('where f.follower_pet_id =');
  });
});
