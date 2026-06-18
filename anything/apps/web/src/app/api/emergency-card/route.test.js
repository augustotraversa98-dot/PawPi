import { describe, it, expect, vi, beforeEach } from 'vitest';

// /api/emergency-card — the OWNER surface (ticket 2.51). GET lazily creates the card + assembles
// the medical preview from owner-scoped sources; PATCH updates owner-controlled settings. auth()
// + `sql` mocked; the wrapper passes through when sql.begin is absent (mocked sql).

import { GET, PATCH } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/emergency-card', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(new Request('http://localhost/api/emergency-card?petId=5'));
    expect(res.status).toBe(401);
  });

  it('missing petId → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(new Request('http://localhost/api/emergency-card'));
    expect(res.status).toBe(400);
  });

  it('lazily creates the card and assembles the preview from owner-scoped sources', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1 }]) // resolveOwner
      .mockResolvedValueOnce([{ id: 5, name: 'Rex' }]) // pet ownership
      .mockResolvedValueOnce([{ id: 9, pet_id: 5, tag_token: 'tok', show_medical_on_tag: false, contact_mode: 'relay', active: true }]) // upsert card
      .mockResolvedValueOnce([{ microchip_id: 'chip', medical_notes: null }]) // medical profile
      .mockResolvedValueOnce([{ allergen: 'Penicillin' }]) // allergies
      .mockResolvedValueOnce([{ condition: 'Arthritis' }]) // conditions
      .mockResolvedValueOnce([]) // lost
      .mockResolvedValueOnce([{ id: 3, token: 'L', scope: 'full' }]); // links

    const res = await GET(new Request('http://localhost/api/emergency-card?petId=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card.tag_token).toBe('tok');
    expect(body.allergies[0].allergen).toBe('Penicillin');
    expect(body.links).toHaveLength(1);
    // The card upsert is idempotent on pet_id (a stable tag never breaks).
    const upsertText = sql.mock.calls[2][0].join(' ');
    expect(upsertText).toContain('ON CONFLICT (pet_id)');
  });

  it('404 when the pet is not the caller\'s', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1 }]) // resolveOwner
      .mockResolvedValueOnce([]); // pet not owned
    const res = await GET(new Request('http://localhost/api/emergency-card?petId=5'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/emergency-card', () => {
  it('rejects an invalid contact_mode', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await PATCH(
      new Request('http://localhost/api/emergency-card', {
        method: 'PATCH',
        body: JSON.stringify({ petId: 5, contact_mode: 'carrier-pigeon' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('updates owner-controlled settings scoped to the owner', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1 }]) // resolveOwner
      .mockResolvedValueOnce([{ id: 9, show_medical_on_tag: true }]); // update returning
    const res = await PATCH(
      new Request('http://localhost/api/emergency-card', {
        method: 'PATCH',
        body: JSON.stringify({ petId: 5, show_medical_on_tag: true }),
      }),
    );
    expect(res.status).toBe(200);
    const updateText = sql.mock.calls[1][0].join(' ');
    expect(updateText).toContain('owner_user_id =');
  });

  it('404 when the owner has no such card', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);
    const res = await PATCH(
      new Request('http://localhost/api/emergency-card', {
        method: 'PATCH',
        body: JSON.stringify({ petId: 5, active: false }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
