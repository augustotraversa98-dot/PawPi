// Emergency / finder flow (migration 0146), on the REAL tables, through the REAL request router, as pawpi_app:
//   • privacy: relay and none publish neither the owner's phone nor email (SQL JSON and API response); phone / email
//     publish only the matching value; the 0122 least-privilege tag is unchanged;
//   • app_emergency_finder_message: relay-only, stores the finder contact on the owner's bell row (readable by the
//     owner alone), bounded lengths, capped per pet per hour;
//   • the public POST: new form, older page (message only), invalid contact, and the push it sends (Expo mocked);
//   • both deploy orders: the old relay still works with 0146, and the new web code works without it;
//   • supabase/verify_0146.sql reads PASS on every row.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, inject, vi } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedMedicalProfile, seedOwnerWithPet } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const expoMock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('expo-server-sdk', () => ({
  Expo: class {
    sendPushNotificationsAsync = expoMock.send;
    chunkPushNotifications = (m: any[]) => [m];
    static isExpoPushToken(t: any) {
      return typeof t === 'string' && t.startsWith('ExponentPushToken');
    }
  },
}));

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const OWNER_PHONE = '+54 9 11 5555 0101';
const OWNER_EMAIL = 'ana.owner@example.test';
const VET_PHONE = '+54 11 4000 7777';
const KIN_PHONE = '+54 9 11 6666 0202';
const PUSH_TOKEN = 'ExponentPushToken[owner-phone]';

const migration0146 = readFileSync(join(MIGRATIONS_DIR, '0146_emergency_finder_contact.sql'), 'utf8');
const verify0146 = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0146.sql'), 'utf8');

let raw: Sql;
let app: Sql;
let api: { request: (path: string, init?: RequestInit) => Promise<Response> };

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

const setContact = (mode: string, value: string | null) =>
  raw`update pet_emergency_cards set contact_mode = ${mode}, contact_value = ${value} where id = 1`;

const finderCall = (token: string, message: string | null, name: string | null, phone: string | null, email: string | null) =>
  asApp(null, async (tx) => {
    const [row] = await tx`select app_emergency_finder_message(${token}, ${message}, ${name}, ${phone}, ${email}) as result`;
    return row.result as any;
  });

const bellRows = () =>
  raw`select recipient_user_id, type, subject_ref, body, finder_contact from notifications order by id`;

// A different client address per request, so the per-IP limit (10/hour) does not couple the cases.
let ip = 0;
const post = (token: string, body: unknown, address = `10.1.0.${++ip}`) =>
  api.request(`/public/emergency/tag/${token}/contact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
    body: JSON.stringify(body),
  });

const getPublic = (path: string) =>
  api.request(path, { headers: { 'x-forwarded-for': `10.2.0.${++ip}` } });

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  app = postgres(url.toString(), { max: 1, onnotice: () => {} });
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  // Imported AFTER the env is set: the shared `sql` reads DATABASE_URL at import time.
  ({ api } = (await import('../../__create/route-builder')) as any);
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  expoMock.send.mockReset();
  expoMock.send.mockResolvedValue([]);
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedMedicalProfile(raw, { profileRowId: 1, petId: A.petId, ownerUserId: A.profileId });
  await raw`
    update pet_medical_profiles
       set vet_phone = ${VET_PHONE}, emergency_contact_name = 'Kin Person', emergency_contact_phone = ${KIN_PHONE}
     where pet_id = ${A.petId}
  `;
  await raw`
    insert into pet_emergency_cards (id, pet_id, owner_user_id, tag_token, show_medical_on_tag, contact_mode, active)
    values (1, ${A.petId}, ${A.profileId}, 'TAG1', true, 'relay', true)
  `;
  await raw`
    insert into pet_emergency_share_links (id, pet_id, owner_user_id, token, scope)
    values (1, ${A.petId}, ${A.profileId}, 'LINKFULL', 'full'), (2, ${A.petId}, ${A.profileId}, 'LINKBASIC', 'basic')
  `;
  await raw`insert into device_push_tokens (user_id, token, platform) values (${A.profileId}, ${PUSH_TOKEN}, 'ios')`;
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
  vi.restoreAllMocks();
});

const PUBLIC_PATHS = ['/public/emergency/tag/TAG1', '/public/emergency/card/LINKFULL', '/public/emergency/card/LINKBASIC'];

describe('privacy: the owner phone / email follows the chosen mode only', () => {
  it.each(['relay', 'none'])('%s publishes neither, even with a stored value (API JSON)', async (mode) => {
    for (const value of [OWNER_PHONE, OWNER_EMAIL]) {
      await setContact(mode, value);
      for (const path of PUBLIC_PATHS) {
        const res = await getPublic(path);
        expect(res.status, path).toBe(200);
        const text = await res.text();
        expect(text, path).not.toContain(value);
        expect(JSON.parse(text).card.contact, path).toEqual({ mode, value: null });
      }
    }
  });

  it.each([
    ['phone', OWNER_PHONE],
    ['email', OWNER_EMAIL],
  ])('%s publishes that value on the tag and on both vet links', async (mode, value) => {
    await setContact(mode, value);
    for (const path of PUBLIC_PATHS) {
      const { card } = await (await getPublic(path)).json();
      expect(card.contact, path).toEqual({ mode, value });
    }
  });

  it.each([
    ['email', OWNER_PHONE],
    ['phone', OWNER_EMAIL],
    ['phone', '   '],
    ['email', null],
  ])('%s mode with a value of the wrong kind (%s) publishes nothing', async (mode, value) => {
    await setContact(mode, value);
    for (const path of PUBLIC_PATHS) {
      const text = await (await getPublic(path)).text();
      expect(JSON.parse(text).card.contact.value, path).toBeNull();
      if (value && value.trim()) expect(text, path).not.toContain(value);
    }
  });

  it('the public tag still withholds vet and emergency-contact details (0122), the full vet link still has them', async () => {
    for (const [mode, value] of [['relay', null], ['phone', OWNER_PHONE], ['none', null]] as const) {
      await setContact(mode, value);
      const tag = await (await getPublic('/public/emergency/tag/TAG1')).text();
      expect(tag).not.toContain(VET_PHONE);
      expect(tag).not.toContain(KIN_PHONE);
      expect(tag).not.toContain('Kin Person');
      const full = await (await getPublic('/public/emergency/card/LINKFULL')).json();
      expect(full.card.medical.emergency_contact_phone).toBe(KIN_PHONE);
      const basic = await (await getPublic('/public/emergency/card/LINKBASIC')).text();
      expect(basic).not.toContain(KIN_PHONE);
    }
  });
});

describe('app_emergency_finder_message', () => {
  it('writes the owner bell row with readable text and the structured finder contact', async () => {
    const result = await finderCall('TAG1', 'He is at the park', 'Marta', '+54 11 1234 5678', 'marta@example.test');
    expect(result).toMatchObject({ delivered: true, recipient_user_id: A.profileId, pet_id: A.petId, pet_name: 'Rex', recent_count: 0 });
    const rows = await bellRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipient_user_id: A.profileId, type: 'emergency_contact', subject_ref: String(A.petId) });
    expect(rows[0].body).toBe('Marta\nTel: +54 11 1234 5678\nEmail: marta@example.test\nHe is at the park');
    expect(rows[0].finder_contact).toEqual({
      pet_name: 'Rex', name: 'Marta', phone: '+54 11 1234 5678', email: 'marta@example.test', message: 'He is at the park',
    });
  });

  it('leaves out what the finder left empty and bounds every field', async () => {
    await finderCall('TAG1', 'x'.repeat(2000), 'n'.repeat(500), '', null);
    const [row] = await bellRows();
    expect(row.finder_contact.message).toHaveLength(500);
    expect(row.finder_contact.name).toHaveLength(80);
    expect(Object.keys(row.finder_contact).sort()).toEqual(['message', 'name', 'pet_name']);
    expect(row.body).not.toContain('Tel:');
  });

  it('only the pet owner can read it', async () => {
    await finderCall('TAG1', 'hi', null, '123456', null);
    expect(await asApp(A.profileId, (tx) => tx`select finder_contact from notifications`)).toHaveLength(1);
    expect(await asApp(B.profileId, (tx) => tx`select finder_contact from notifications`)).toHaveLength(0);
    expect(await asApp(null, (tx) => tx`select finder_contact from notifications`)).toHaveLength(0);
  });

  it.each(['phone', 'email', 'none'])('delivers nothing when the card is in %s mode', async (mode) => {
    await setContact(mode, null);
    expect(await finderCall('TAG1', 'hi', null, '123456', null)).toBeNull();
    expect(await bellRows()).toHaveLength(0);
  });

  it('delivers nothing for an unknown tag or an inactive card', async () => {
    expect(await finderCall('NOPE', 'hi', null, '123456', null)).toBeNull();
    await raw`update pet_emergency_cards set active = false where id = 1`;
    expect(await finderCall('TAG1', 'hi', null, '123456', null)).toBeNull();
    expect(await bellRows()).toHaveLength(0);
  });

  it('stops at 20 messages per pet per hour, whoever sends them, and opens again afterwards', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await finderCall('TAG1', `m${i}`, null, '123456', null);
      expect(r).toMatchObject({ delivered: true, recent_count: i });
    }
    expect(await finderCall('TAG1', 'one too many', null, '123456', null)).toEqual({ delivered: false });
    expect(await bellRows()).toHaveLength(20);
    await raw`update notifications set created_at = now() - interval '2 hours'`;
    expect(await finderCall('TAG1', 'later', null, '123456', null)).toMatchObject({ delivered: true, recent_count: 0 });
  });

  it('the old relay function (previous web version) still delivers', async () => {
    const [{ ok }] = await asApp(null, (tx) => tx`select app_emergency_relay_contact('TAG1', 'I found your dog') as ok`);
    expect(ok).toBe(true);
    const [row] = await bellRows();
    expect(row.body).toBe('I found your dog');
    expect(row.finder_contact).toBeNull();
  });
});

describe('POST /api/public/emergency/tag/[token]/contact', () => {
  it('stores the message and sends one time-sensitive push in the owner language', async () => {
    await raw`update user_profiles set preferred_locale = 'es' where id = ${A.profileId}`;
    const res = await post('TAG1', { message: 'Está en la plaza', finderName: 'Marta', finderPhone: '+54 11 1234 5678', finderEmail: '' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true }); // nothing about the owner leaves the server
    expect(await bellRows()).toHaveLength(1);
    expect(expoMock.send).toHaveBeenCalledTimes(1);
    expect(expoMock.send.mock.calls[0][0]).toEqual([
      {
        to: PUSH_TOKEN,
        title: 'Alguien encontró a Rex',
        subtitle: 'Emergencia',
        body: 'Marta\nTel: +54 11 1234 5678\nEstá en la plaza',
        data: { type: 'emergency_contact', subjectRef: String(A.petId) },
        sound: 'default',
        priority: 'high',
        interruptionLevel: 'time-sensitive',
      },
    ]);
  });

  it('after 5 messages in an hour keeps delivering but stops breaking through Focus', async () => {
    for (let i = 0; i < 6; i++) await post('TAG1', { message: `m${i}`, finderPhone: '123456' });
    const levels = expoMock.send.mock.calls.map((c) => c[0][0].interruptionLevel);
    expect(levels).toEqual([...Array(5).fill('time-sensitive'), 'active']);
    expect(await bellRows()).toHaveLength(6);
  });

  it('accepts an older page that sends only a message', async () => {
    const res = await post('TAG1', { message: 'old page' });
    expect(await res.json()).toEqual({ ok: true });
    const [row] = await bellRows();
    expect(row.body).toBe('old page');
    expect(row.finder_contact).toEqual({ pet_name: 'Rex', message: 'old page' });
  });

  it.each([
    [{ message: 'hi', finderName: 'Marta', finderPhone: '', finderEmail: '' }, 'contact_required'],
    [{ message: 'hi', finderPhone: 'call me' }, 'invalid_phone'],
    [{ message: 'hi', finderEmail: 'a@example.test?bcc=x@example.test' }, 'invalid_email'],
  ])('refuses a form without a usable contact (%o)', async (body, error) => {
    const res = await post('TAG1', body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error });
    expect(await bellRows()).toHaveLength(0);
    expect(expoMock.send).not.toHaveBeenCalled();
  });

  it('answers ok:false, writes and pushes nothing for a card that does not take messages', async () => {
    await setContact('none', null);
    const res = await post('TAG1', { message: 'hi', finderPhone: '123456' });
    expect(await res.json()).toEqual({ ok: false });
    const unknown = await post('NOPE', { message: 'hi', finderPhone: '123456' });
    expect(await unknown.json()).toEqual({ ok: false });
    expect(await bellRows()).toHaveLength(0);
    expect(expoMock.send).not.toHaveBeenCalled();
  });

  it('still delivers when the push service fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expoMock.send.mockRejectedValue(new Error('expo down'));
    const res = await post('TAG1', { message: 'hi', finderPhone: '123456' });
    expect(await res.json()).toEqual({ ok: true });
    expect(await bellRows()).toHaveLength(1);
  });

  it('keeps the per-address limit of 10 an hour', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post('TAG1', { message: 'hi', finderPhone: '123456' }, '10.9.9.9')).status);
    expect(statuses).toEqual([...Array(10).fill(200), 429]);
  });

  it('GET /api/notifications gives the owner the finder contact', async () => {
    await post('TAG1', { message: 'hi', finderEmail: 'marta@example.test' });
    authState.session = { user: { id: A.authUserId } };
    const { notifications } = await (await api.request('/notifications')).json();
    expect(notifications[0].finder_contact).toEqual({ pet_name: 'Rex', email: 'marta@example.test', message: 'hi' });
    authState.session = { user: { id: B.authUserId } };
    expect((await (await api.request('/notifications')).json()).notifications).toEqual([]);
  });
});

describe('new web code on a database without 0146', () => {
  const removeMigration = async () => {
    await raw.unsafe('drop function app_emergency_finder_message(text, text, text, text, text)');
    await raw.unsafe('alter table notifications drop column finder_contact');
  };
  const restore = async () => {
    await raw.unsafe(migration0146);
  };

  it('relays through the old function with the contact in the text, and the notification list still loads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await removeMigration();
    try {
      const res = await post('TAG1', { message: 'At the park', finderName: 'Marta', finderPhone: '123456' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const rows = await raw`select body from notifications`;
      expect(rows.map((r) => r.body)).toEqual(['Marta\nTel: 123456\nAt the park']);
      expect(expoMock.send).not.toHaveBeenCalled(); // no push on the old schema, as before

      authState.session = { user: { id: A.authUserId } };
      const list = await api.request('/notifications');
      expect(list.status).toBe(200);
      const { notifications } = await list.json();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].finder_contact).toBeNull();
    } finally {
      await restore();
    }
  });
});

describe('verify_0146.sql', () => {
  const failing = async (tx: Sql) =>
    (await tx.unsafe<{ ord: number; check_name: string; detail: string; status: string }[]>(verify0146))
      .filter((r) => r.status !== 'PASS')
      .map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);

  it('every row reads PASS, also after applying 0146 a second time', async () => {
    await raw.unsafe(migration0146);
    expect((await raw.unsafe(verify0146)).length).toBe(11);
    expect(await failing(raw)).toEqual([]);
  });

  it('keeps verify_0122.sql passing', async () => {
    const rows = await raw.unsafe<{ status: string }[]>(
      readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0122.sql'), 'utf8'),
    );
    expect(rows.filter((r) => r.status !== 'PASS')).toEqual([]);
  });

  it('can fail: missing function and an unguarded assembler are flagged (rolled back)', async () => {
    const ROLLBACK = new Error('rollback');
    let names: string[] = [];
    const old0122 = readFileSync(join(MIGRATIONS_DIR, '0122_emergency_tag_medical_least_privilege.sql'), 'utf8');
    await raw
      .begin(async (tx) => {
        await tx.unsafe('drop function app_emergency_finder_message(text, text, text, text, text)');
        await tx.unsafe(old0122);
        names = await failing(tx as unknown as Sql);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    expect(names.join('|')).toMatch(/^2 /);
    expect(names.join('|')).toMatch(/\|8 /);
  });
});
