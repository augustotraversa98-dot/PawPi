import { describe, it, expect, vi, beforeEach } from 'vitest';

// /api/emergency-card — the OWNER surface (ticket 2.51). GET lazily creates the card + assembles
// the medical preview from owner-scoped sources; PATCH updates owner-controlled settings. auth()
// + `sql` mocked; the wrapper passes through when sql.begin is absent (mocked sql).

import { GET, PATCH } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
// No real transaction here: withSavepoint runs the query directly.
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn(), getActiveTx: () => null }));

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
      .mockResolvedValueOnce([{ id: 5, name: 'Rex', _pet_owner: 1 }]) // pet access (owner_user_id is selected as _pet_owner, stripped from the response)
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
  const patch = (body) =>
    new Request('http://localhost/api/emergency-card', { method: 'PATCH', body: JSON.stringify(body) });

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

  it('saves the tag emergency-contact opt-in with its own owner-scoped statement', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1 }]) // resolveOwner
      .mockResolvedValueOnce([]) // the 0146 column
      .mockResolvedValueOnce([{ id: 9, show_emergency_contact_on_tag: true }]); // main update returning
    const res = await PATCH(patch({ petId: 5, show_emergency_contact_on_tag: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).card.show_emergency_contact_on_tag).toBe(true);
    const [strings, ...values] = sql.mock.calls[1];
    expect(strings.join(' ')).toContain('show_emergency_contact_on_tag =');
    expect(strings.join(' ')).toContain('owner_user_id =');
    expect(values).toEqual([true, 5, 1]);
  });

  it('does not touch the opt-in when the request does not mention it', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 9 }]);
    await PATCH(patch({ petId: 5, active: true }));
    expect(sql).toHaveBeenCalledTimes(2);
    expect(sql.mock.calls[1][0].join(' ')).not.toContain('show_emergency_contact_on_tag =');
  });

  it.each([['yes'], [1], [null]])('rejects a non-boolean opt-in (%o) before any query', async (value) => {
    auth.mockResolvedValue(SESSION);
    const res = await PATCH(patch({ petId: 5, show_emergency_contact_on_tag: value }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('answers 503, changing nothing else, on a database without 0146', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1 }])
      .mockRejectedValueOnce(Object.assign(new Error('no column'), { code: '42703' }));
    const res = await PATCH(patch({ petId: 5, show_emergency_contact_on_tag: true, contact_mode: 'none' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('finder_settings_unavailable');
    expect(sql).toHaveBeenCalledTimes(2);
  });

  const NO_CHANNELS = {
    contact_phone_enabled: null,
    contact_email_enabled: null,
    contact_message_enabled: null,
    contact_phone: null,
    contact_email: null,
  };
  const statements = () => sql.mock.calls.map(([strings]) => strings.join(' '));
  const namesMode = (text) => /contact_mode = COALESCE|contact_value = COALESCE/.test(text);

  it('saves the phone / email switches with their own owner-scoped statement, never naming the older columns', async () => {
    auth.mockResolvedValue(SESSION);
    const row = {
      contact_mode: 'phone',
      contact_value: '11 5555',
      contact_phone_enabled: true,
      contact_email_enabled: true,
      contact_message_enabled: true,
      contact_phone: '11 5555',
      contact_email: 'a@example.test',
    };
    sql
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 9, contact_mode: 'phone', _row: row }]);
    const res = await PATCH(patch({ petId: 5, contact_email_enabled: true }));
    expect(res.status).toBe(200);
    const { card } = await res.json();
    expect(card).toMatchObject({ contact_email_enabled: true, contact_phone: '11 5555', contact_email: 'a@example.test' });
    expect(card).not.toHaveProperty('_row');
    const [, channels, rest] = statements();
    expect(channels).toContain('contact_email_enabled = COALESCE');
    expect(channels).toContain('owner_user_id =');
    expect(namesMode(channels)).toBe(false);
    expect(namesMode(rest)).toBe(false);
    expect(sql.mock.calls[1].slice(1)).toEqual([null, true, null, null, null, 5, 1]);
  });

  it('names contact_mode / contact_value only when the request has them', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 9 }]);
    await PATCH(patch({ petId: 5, show_medical_on_tag: false }));
    expect(statements().some(namesMode)).toBe(false);

    sql.mockClear();
    sql.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 9 }]);
    await PATCH(patch({ petId: 5, contact_mode: 'none' }));
    expect(statements().filter(namesMode)).toHaveLength(1);
    expect(statements().join(' ')).not.toContain('contact_phone_enabled = COALESCE');
  });

  it.each([
    [{ contact_phone_enabled: 'yes' }],
    [{ contact_message_enabled: null }],
    [{ contact_phone: 11 }],
    [{ contact_email: null }],
    [{ contact_phone_enabled: true, contact_mode: 'none' }],
    [{ contact_email: 'a@example.test', contact_value: 'b@example.test' }],
  ])('rejects %o before any query', async (body) => {
    auth.mockResolvedValue(SESSION);
    const res = await PATCH(patch({ petId: 5, ...body }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('answers 503 to the switches, changing nothing, on a database without 0152', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1 }])
      .mockRejectedValueOnce(Object.assign(new Error('no column'), { code: '42703' }));
    const res = await PATCH(patch({ petId: 5, contact_phone_enabled: true, show_medical_on_tag: true }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('contact_channels_unavailable');
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('reports the switches as unavailable when the row has no such columns', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 9, contact_mode: 'relay', _row: { contact_mode: 'relay' } }]);
    const res = await PATCH(patch({ petId: 5, active: true }));
    expect((await res.json()).card).toMatchObject(NO_CHANNELS);
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
