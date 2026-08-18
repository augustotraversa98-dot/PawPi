import { describe, it, expect, vi, beforeEach } from 'vitest';

// Vet Record documents route (ticket 2.41): owner-scoped GET/POST/DELETE over
// vet_documents. Session + DB mocked at the module boundary; sql is a tagged
// template consuming one mockResolvedValueOnce per `await sql\`...\`` in order.
// (RLS owner-scoping itself is proven in owner-private-rls.integration.test.ts.)

import { GET, POST, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const req = (qs = '', init) =>
  new Request(`http://localhost/api/vet-record/documents${qs}`, init);
const jsonReq = (body) =>
  req('', { method: 'POST', body: JSON.stringify(body) });
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
  it('lists the owner-scoped documents', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // resolveUserId → user_profiles
      .mockResolvedValueOnce([{ owner_user_id: 7 }]) // resolvePetLogOwner owner fast-path
      .mockResolvedValueOnce([{ id: 1, name: 'Labwork' }]); // documents
    const res = await GET(req('?petId=3'));
    expect(res.status).toBe(200);
    expect((await res.json()).documents).toHaveLength(1);
    expect(queryText(2).toLowerCase()).toContain('owner_user_id =');
  });
});

describe('POST', () => {
  it('400 when required fields are missing', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    const res = await POST(jsonReq({ petId: 1, name: 'x' })); // missing type+url
    expect(res.status).toBe(400);
  });
  it('inserts an owner-scoped document', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // resolveUserId → user_profiles
      .mockResolvedValueOnce([{ owner_user_id: 7 }]) // resolvePetLogOwner owner fast-path
      .mockResolvedValueOnce([{ id: 11, name: 'Rabies cert' }]); // insert RETURNING
    const res = await POST(
      jsonReq({
        petId: 3,
        name: 'Rabies cert',
        documentType: 'vaccination',
        fileUrl: 'https://x/f.jpg',
        documentDate: '2026-06-18',
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).document.id).toBe(11);
    expect(queryText(2).toLowerCase()).toContain('insert into vet_documents');
  });
});

describe('DELETE', () => {
  it('400 without id', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    expect((await DELETE(req())).status).toBe(400);
  });
  it('deletes only the caller-owned row', async () => {
    auth.mockResolvedValue({ user: { id: 'a' } });
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // user_profiles
      .mockResolvedValueOnce([]); // delete
    const res = await DELETE(req('?id=11'));
    expect(res.status).toBe(200);
    expect(queryText(1).toLowerCase()).toContain('owner_user_id =');
  });
});
