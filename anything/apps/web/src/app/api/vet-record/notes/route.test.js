import { describe, it, expect, vi, beforeEach } from 'vitest';

// Vet Record notes = the append-only clinical history log (ticket 2.42). This
// pins the OWNER route (GET/POST/DELETE, owner-scoped). The append-only integrity
// (providers INSERT but cannot UPDATE/DELETE; owner can) is RLS, proven in
// provider-records-rls.integration.test.ts — not re-litigated here.

import { GET, POST, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const req = (qs = '', init) =>
  new Request(`http://localhost/api/vet-record/notes${qs}`, init);
const post = (body) => req('', { method: 'POST', body: JSON.stringify(body) });
const queryText = (i) => sql.mock.calls[i][0].join('?');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET', () => {
  it('401 unauthenticated', async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(req('?petId=1'))).status).toBe(401);
  });
  it('400 without petId', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    expect((await GET(req())).status).toBe(400);
  });
  it('lists the owner-scoped notes', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // resolveUserId → user_profiles
      .mockResolvedValueOnce([{ owner_user_id: 7 }]) // resolvePetLogOwner owner fast-path
      .mockResolvedValueOnce([{ id: 1, note: 'Annual checkup' }]); // notes
    const res = await GET(req('?petId=3'));
    expect(res.status).toBe(200);
    expect((await res.json()).notes).toHaveLength(1);
    expect(queryText(2).toLowerCase()).toContain('owner_user_id =');
  });
});

describe('POST', () => {
  it('400 when note/date missing', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    expect((await POST(post({ petId: 1 }))).status).toBe(400);
  });
  it('inserts an owner-authored entry (vetName omitted → "You")', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // resolveUserId
      .mockResolvedValueOnce([{ owner_user_id: 7 }]) // resolvePetLogOwner owner fast-path
      .mockResolvedValueOnce([{ id: 9, note: 'Limping on left paw' }]); // insert RETURNING
    const res = await POST(
      post({ petId: 3, noteDate: '2026-06-18', note: 'Limping on left paw' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).note.id).toBe(9);
    expect(queryText(2).toLowerCase()).toContain('insert into vet_notes');
  });
});

describe('DELETE', () => {
  it('400 without id', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    expect((await DELETE(req())).status).toBe(400);
  });
  it('deletes only the caller-owned entry', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    sql.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([]);
    const res = await DELETE(req('?id=9'));
    expect(res.status).toBe(200);
    expect(queryText(1).toLowerCase()).toContain('owner_user_id =');
  });
});
