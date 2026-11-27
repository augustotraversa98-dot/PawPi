// Emergency / finder flow (migration 0146), on the REAL tables, through the REAL request router, as pawpi_app:
//   • privacy: relay and none publish neither the owner's phone nor email, and no emergency contact on a full vet
//     link; phone / email publish only the matching value; the tag shows the emergency contact only on opt-in;
//   • app_emergency_finder_message: relay, or phone / email with nothing saved; stores the finder contact for the
//     owner and the active family / caregivers (each readable by that person alone); bounded lengths; per-pet caps;
//   • the sender limits through the public POST, and the ways someone might try to get around them;
//   • member pushes follow each member's settings (Expo mocked);
//   • retention: nothing older than 90 days is returned, and the cron job deletes it;
//   • both deploy orders: the old relay still works with 0146, and the new web code works without it;
//   • supabase/verify_0146.sql reads PASS on every row.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, inject, vi } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedMedicalProfile, seedOwnerWithPet, seedUser } from './db';

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
// Household of Rex: an active family member, an active caregiver, and people who must NOT hear about him.
const FAMILY = 11;
const SITTER = 12;
const OUTSIDERS = { pending: 13, revoked: 14, expired: 15, left: 16, declined: 17, otherPet: 2 };
const tokenFor = (id: number) => `ExponentPushToken[user-${id}]`;
const VERIFY_ROWS = 19;

const readMigration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
const migration0146 = readMigration('0146_emergency_finder_contact.sql');
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

const finderCall = (
  token: string,
  message: string | null,
  name: string | null,
  phone: string | null,
  email: string | null,
  allowUrgent = true,
) =>
  asApp(null, async (tx) => {
    const [row] = await tx`
      select app_emergency_finder_message(${token}, ${message}, ${name}, ${phone}, ${email}, ${allowUrgent}) as result`;
    return row.result as any;
  });

// The OWNER's copy of each message (one per message); members get their own copies.
const bellRows = (recipient: number = A.profileId) =>
  raw`select recipient_user_id, type, subject_ref, body, finder_contact, finder_urgent
        from notifications where recipient_user_id = ${recipient} order by id`;
const allRows = () => raw`select recipient_user_id, body, finder_contact, finder_urgent from notifications order by id`;

// Make everything sent so far look older, to open the short windows again.
const age = (interval: string) =>
  raw`update notifications set created_at = created_at - ${interval}::interval`;

// A different client address per request, so the per-sender limit does not couple the cases.
let ip = 0;
const post = (token: string, body: unknown, headers: Record<string, string> | string = `10.1.0.${++ip}`) =>
  api.request(`/public/emergency/tag/${token}/contact`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(typeof headers === 'string' ? { 'x-real-ip': headers } : headers),
    },
    body: JSON.stringify(body),
  });
const HELLO = { message: 'hi', finderPhone: '123456' };

/** Push calls as [recipient token, interruption level]. */
const pushes = () => expoMock.send.mock.calls.flatMap((c) => c[0]).map((m: any) => [m.to, m.interruptionLevel]);
const urgentPushes = (to = PUSH_TOKEN) => pushes().filter(([t, level]) => t === to && level === 'time-sensitive');

async function seedHousehold() {
  for (const id of [FAMILY, SITTER, 13, 14, 15, 16, 17]) {
    await seedUser(raw, { authUserId: id, profileId: id, username: `member${id}` });
  }
  const grant = (grantee: number, role: string, status: string, expires: string | null = null, pet = A, owner = A) =>
    raw`insert into pet_caregivers (pet_id, owner_user_id, grantee_user_id, role, status, expires_at)
        values (${pet.petId}, ${owner.profileId}, ${grantee}, ${role}, ${status}, ${expires})`;
  await grant(FAMILY, 'family', 'active');
  await grant(SITTER, 'caregiver', 'active', new Date(Date.now() + 86_400_000).toISOString());
  await grant(OUTSIDERS.pending, 'family', 'pending');
  await grant(OUTSIDERS.revoked, 'family', 'revoked');
  await grant(OUTSIDERS.expired, 'caregiver', 'active', new Date(Date.now() - 60_000).toISOString());
  await grant(OUTSIDERS.left, 'family', 'left');
  await grant(OUTSIDERS.declined, 'family', 'declined');
  await grant(A.profileId, 'family', 'active', null, B, B); // Rex's owner cares for Bella: no effect on Rex
  for (const id of [FAMILY, SITTER, 13, 14, 15, 16, 17]) {
    await raw`insert into device_push_tokens (user_id, token, platform) values (${id}, ${tokenFor(id)}, 'ios')`;
  }
}

const getPublic = (path: string) =>
  api.request(path, { headers: { 'x-real-ip': `10.2.0.${++ip}` } });

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
  // This file re-applies 0146 on the shared cluster, which restores its older card assembler: put 0152's and
  // then 0156's back.
  await raw.unsafe(readMigration('0152_emergency_contact_channels.sql'));
  await raw.unsafe(readMigration('0156_pet_age_estimate.sql'));
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
  delete process.env.NOTIF_V2_ENABLED;
  delete process.env.CRON_SECRET;
  vi.useRealTimers();
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
        expect(JSON.parse(text).card.contact, path).toEqual({ mode, value: null, accepts_message: mode === 'relay' });
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
      expect(card.contact, path).toEqual({ mode, value, accepts_message: false });
    }
  });

  it.each([
    ['email', OWNER_PHONE],
    ['phone', OWNER_EMAIL],
    ['phone', '   '],
    ['email', null],
  ])('%s mode with a value of the wrong kind (%s) publishes nothing and takes messages instead', async (mode, value) => {
    await setContact(mode, value);
    for (const path of PUBLIC_PATHS) {
      const text = await (await getPublic(path)).text();
      expect(JSON.parse(text).card.contact, path).toEqual({ mode, value: null, accepts_message: true });
      if (value && value.trim()) expect(text, path).not.toContain(value);
    }
  });

  it('by default the public tag withholds vet and emergency-contact details, whatever the finder setting', async () => {
    for (const [mode, value] of [['relay', null], ['phone', OWNER_PHONE], ['none', null]] as const) {
      await setContact(mode, value);
      const tag = await (await getPublic('/public/emergency/tag/TAG1')).text();
      expect(tag).not.toContain(VET_PHONE);
      expect(tag).not.toContain(KIN_PHONE);
      expect(tag).not.toContain('Kin Person');
      expect(JSON.parse(tag).card.emergency_contact).toBeNull();
    }
  });
});

describe('full vet link: the emergency contact follows the finder setting', () => {
  it.each([
    ['relay', null],
    ['relay', OWNER_PHONE],
    ['none', null],
  ])('%s (stored value %s) hands out no finder or emergency contact at all', async (mode, value) => {
    await setContact(mode, value);
    // The opt-in is about the TAG only; it does not open the vet link.
    for (const optIn of [false, true]) {
      await raw`update pet_emergency_cards set show_emergency_contact_on_tag = ${optIn} where id = 1`;
      const text = await (await getPublic('/public/emergency/card/LINKFULL')).text();
      expect(text).not.toContain(KIN_PHONE);
      expect(text).not.toContain('Kin Person');
      if (value) expect(text).not.toContain(value);
      const { card } = JSON.parse(text);
      expect(card.contact.value).toBeNull();
      expect(card.emergency_contact).toBeNull();
      expect(Object.keys(card.medical)).not.toContain('emergency_contact_name');
      expect(Object.keys(card.medical)).not.toContain('emergency_contact_phone');
      expect(card.medical.vet_phone).toBe(VET_PHONE); // the rest of the full card is unchanged
    }
  });

  it.each([
    ['phone', OWNER_PHONE],
    ['email', OWNER_EMAIL],
    ['phone', null],
  ])('%s (value %s) includes the emergency contact', async (mode, value) => {
    await setContact(mode, value);
    const { card } = await (await getPublic('/public/emergency/card/LINKFULL')).json();
    expect(card.medical.emergency_contact_name).toBe('Kin Person');
    expect(card.medical.emergency_contact_phone).toBe(KIN_PHONE);
    const basic = await (await getPublic('/public/emergency/card/LINKBASIC')).text();
    expect(basic).not.toContain(KIN_PHONE);
  });
});

describe('owner setting: show my emergency contact on the pet tag', () => {
  const patch = (body: unknown) =>
    api.request('/emergency-card', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const tagCard = async () => (await (await getPublic('/public/emergency/tag/TAG1')).json()).card;

  it('is OFF for a new card and for the owner GET', async () => {
    // The seed above wrote an explicit card id; move the sequence past it before the route creates one.
    await raw`select setval(pg_get_serial_sequence('pet_emergency_cards', 'id'), 100)`;
    authState.session = { user: { id: B.authUserId } };
    const created = await (await api.request(`/emergency-card?petId=${B.petId}`)).json();
    expect(created.card.show_emergency_contact_on_tag).toBe(false);
  });

  it('the owner turns it on and off; the tag follows, independently of the medical switch', async () => {
    authState.session = { user: { id: A.authUserId } };
    for (const medical of [false, true]) {
      await raw`update pet_emergency_cards set show_medical_on_tag = ${medical} where id = 1`;
      const on = await patch({ petId: A.petId, show_emergency_contact_on_tag: true });
      expect((await on.json()).card.show_emergency_contact_on_tag).toBe(true);
      expect((await tagCard()).emergency_contact).toEqual({ name: 'Kin Person', phone: KIN_PHONE });
      // Turning it on adds nothing else: the vet's details stay off the tag.
      expect(await (await getPublic('/public/emergency/tag/TAG1')).text()).not.toContain(VET_PHONE);

      const off = await patch({ petId: A.petId, show_emergency_contact_on_tag: false });
      expect((await off.json()).card.show_emergency_contact_on_tag).toBe(false);
      expect((await tagCard()).emergency_contact).toBeNull();
    }
  });

  it('changing another setting leaves it as it was', async () => {
    authState.session = { user: { id: A.authUserId } };
    await patch({ petId: A.petId, show_emergency_contact_on_tag: true });
    const res = await patch({ petId: A.petId, contact_mode: 'none' });
    expect((await res.json()).card.show_emergency_contact_on_tag).toBe(true);
  });

  it('shows nothing when the profile has no emergency contact', async () => {
    await raw`update pet_emergency_cards set show_emergency_contact_on_tag = true where id = 1`;
    await raw`update pet_medical_profiles set emergency_contact_name = ' ', emergency_contact_phone = '' where pet_id = ${A.petId}`;
    expect((await tagCard()).emergency_contact).toBeNull();
  });

  it('nobody but the owner can turn it on: not a stranger, not a family member', async () => {
    await seedHousehold();
    for (const authUserId of [B.authUserId, FAMILY]) {
      authState.session = { user: { id: authUserId } };
      const res = await patch({ petId: A.petId, show_emergency_contact_on_tag: true });
      expect(res.status).toBe(404);
    }
    const [row] = await raw`select show_emergency_contact_on_tag as v from pet_emergency_cards where id = 1`;
    expect(row.v).toBe(false);
  });
});

describe('app_emergency_finder_message', () => {
  it('writes the owner bell row with readable text and the structured finder contact', async () => {
    const result = await finderCall('TAG1', 'He is at the park', 'Marta', '+54 11 1234 5678', 'marta@example.test');
    expect(result).toMatchObject({
      delivered: true, recipient_user_id: A.profileId, pet_id: A.petId, pet_name: 'Rex', urgent: true, member_user_ids: [],
    });
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

  it('only the pet owner can read the owner copy', async () => {
    await finderCall('TAG1', 'hi', null, '123456', null);
    expect(await asApp(A.profileId, (tx) => tx`select finder_contact from notifications`)).toHaveLength(1);
    expect(await asApp(B.profileId, (tx) => tx`select finder_contact from notifications`)).toHaveLength(0);
    expect(await asApp(null, (tx) => tx`select finder_contact from notifications`)).toHaveLength(0);
  });

  it('gives every ACTIVE family member and caregiver their own copy, and nobody else', async () => {
    await seedHousehold();
    const result = await finderCall('TAG1', 'hi', 'Marta', '123456', null);
    expect(result.member_user_ids).toEqual([FAMILY, SITTER]);
    const rows = await allRows();
    expect(rows.map((r) => r.recipient_user_id)).toEqual([A.profileId, FAMILY, SITTER]);
    for (const row of rows) {
      expect(row.finder_contact).toMatchObject({ pet_name: 'Rex', name: 'Marta', phone: '123456' });
      expect(row.finder_urgent).toBe(true);
    }
    // Row security: each reads exactly their own copy; the excluded people read nothing.
    for (const id of [FAMILY, SITTER]) {
      const mine = await asApp(id, (tx) => tx`select recipient_user_id from notifications`);
      expect(mine.map((r) => r.recipient_user_id)).toEqual([id]);
    }
    for (const id of Object.values(OUTSIDERS)) {
      expect(await asApp(id, (tx) => tx`select id from notifications`), String(id)).toHaveLength(0);
    }
  });

  it.each([
    ['phone', null],
    ['phone', '   '],
    ['phone', OWNER_EMAIL],
    ['email', null],
    ['email', OWNER_PHONE],
  ])('takes messages in %s mode when nothing is published (stored: %s)', async (mode, value) => {
    await setContact(mode, value);
    expect(await finderCall('TAG1', 'hi', null, '123456', null)).toMatchObject({ delivered: true });
    expect(await bellRows()).toHaveLength(1);
  });

  it.each([
    ['phone', OWNER_PHONE],
    ['email', OWNER_EMAIL],
    ['none', null],
    ['none', OWNER_PHONE],
  ])('delivers nothing when the card is in %s mode with %s', async (mode, value) => {
    await setContact(mode, value);
    expect(await finderCall('TAG1', 'hi', null, '123456', null)).toBeNull();
    expect(await bellRows()).toHaveLength(0);
  });

  it('delivers nothing for an unknown tag or an inactive card', async () => {
    expect(await finderCall('NOPE', 'hi', null, '123456', null)).toBeNull();
    await raw`update pet_emergency_cards set active = false where id = 1`;
    expect(await finderCall('TAG1', 'hi', null, '123456', null)).toBeNull();
    expect(await bellRows()).toHaveLength(0);
  });

  it('takes 5 messages per pet in 10 minutes and 30 a day, whoever sends them', async () => {
    for (let batch = 0; batch < 6; batch++) {
      for (let i = 0; i < 5; i++) {
        expect(await finderCall('TAG1', `m${batch}-${i}`, null, '123456', null)).toMatchObject({ delivered: true });
      }
      expect(await finderCall('TAG1', 'one too many', null, '123456', null)).toEqual({ delivered: false });
      await age('11 minutes');
    }
    expect(await bellRows()).toHaveLength(30);
    expect(await finderCall('TAG1', 'over the day', null, '123456', null)).toEqual({ delivered: false });
    await age('24 hours');
    expect(await finderCall('TAG1', 'next day', null, '123456', null)).toMatchObject({ delivered: true, urgent: true });
  });

  it('allows one urgent message per pet in 10 minutes and 4 a day; the rest arrive quietly', async () => {
    const send = async () => (await finderCall('TAG1', 'hi', null, '123456', null)).urgent;
    expect(await send()).toBe(true);
    expect(await send()).toBe(false);
    expect(await send()).toBe(false);
    for (let i = 0; i < 3; i++) {
      await age('11 minutes');
      expect(await send()).toBe(true);
    }
    await age('11 minutes');
    expect(await send()).toBe(false); // the 5th of the day
    await age('24 hours');
    expect(await send()).toBe(true);
    expect((await bellRows()).filter((r) => r.finder_urgent)).toHaveLength(5);
  });

  it('is not urgent when the server withholds it', async () => {
    expect(await finderCall('TAG1', 'hi', null, '123456', null, false)).toMatchObject({ delivered: true, urgent: false });
    // ...and a withheld one does not use up the pet's urgent slot.
    expect(await finderCall('TAG1', 'hi', null, '123456', null)).toMatchObject({ urgent: true });
  });

  it('keeps the limits when many requests arrive at the same moment', async () => {
    const url = new URL(inject('TEST_DATABASE_URL'));
    url.username = 'pawpi_app';
    url.password = 'pawpi_app';
    const pool = postgres(url.toString(), { max: 10, onnotice: () => {} });
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          pool.begin(async (tx) => {
            const [row] = await tx`
              select app_emergency_finder_message('TAG1', 'burst', null, '123456', null, true) as result`;
            // Hold the transaction open, so the others really do overlap.
            await tx`select pg_sleep(0.05)`;
            return row.result as any;
          }),
        ),
      );
      expect(results.filter((r) => r.delivered)).toHaveLength(5);
      expect(results.filter((r) => r.urgent)).toHaveLength(1);
      expect(await bellRows()).toHaveLength(5);
    } finally {
      await pool.end();
    }
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

  it('a second message soon after, even from someone else, arrives as an ordinary notification', async () => {
    await post('TAG1', HELLO);
    await post('TAG1', HELLO);
    expect(pushes()).toEqual([[PUSH_TOKEN, 'time-sensitive'], [PUSH_TOKEN, 'active']]);
    expect(expoMock.send.mock.calls[1][0][0].priority).toBe('default');
    expect(await bellRows()).toHaveLength(2);
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

  it('GET /api/notifications gives the owner the finder contact', async () => {
    await post('TAG1', { message: 'hi', finderEmail: 'marta@example.test' });
    authState.session = { user: { id: A.authUserId } };
    const { notifications } = await (await api.request('/notifications')).json();
    expect(notifications[0].finder_contact).toEqual({ pet_name: 'Rex', email: 'marta@example.test', message: 'hi' });
    authState.session = { user: { id: B.authUserId } };
    expect((await (await api.request('/notifications')).json()).notifications).toEqual([]);
  });
});

describe('one sender cannot ring the family again and again', () => {
  // The limiter uses fixed windows. Pin the clock-independent part by clearing the pet's own history between sends,
  // so what is measured is the SENDER limit and not the per-pet one.
  const reopenPet = () => age('25 hours');

  it('3 messages per 10 minutes, then 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await post('TAG1', HELLO, '198.51.100.1')).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(await bellRows()).toHaveLength(3);
  });

  it('10 a day, also across short windows', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      // Forget the short window each time, as 10 minutes passing would.
      await raw`delete from rate_limit_hits where bucket = 'emergency_relay'`;
      await reopenPet();
      statuses.push((await post('TAG1', HELLO, '198.51.100.2')).status);
    }
    expect(statuses).toEqual([...Array(10).fill(200), 429, 429]);
  });

  it('only the first is urgent for a day, even after the pet limit has opened again', async () => {
    for (let i = 0; i < 3; i++) {
      await post('TAG1', HELLO, '198.51.100.3');
      await reopenPet();
    }
    expect(urgentPushes()).toHaveLength(1);
    expect(pushes()).toHaveLength(3);
    // A different person is still urgent.
    await post('TAG1', HELLO, '198.51.100.4');
    expect(urgentPushes()).toHaveLength(2);
  });

  it('the urgent allowance is per tag', async () => {
    await raw`insert into pet_emergency_cards (id, pet_id, owner_user_id, tag_token, contact_mode, active)
              values (2, ${B.petId}, ${B.profileId}, 'TAG2', 'relay', true)`;
    await raw`insert into device_push_tokens (user_id, token, platform) values (${B.profileId}, ${tokenFor(B.profileId)}, 'ios')`;
    await post('TAG1', HELLO, '198.51.100.5');
    await post('TAG2', HELLO, '198.51.100.5');
    expect(pushes()).toEqual([[PUSH_TOKEN, 'time-sensitive'], [tokenFor(B.profileId), 'time-sensitive']]);
  });

  describe('bypass attempts', () => {
    const attempts = async (headers: (i: number) => Record<string, string>) => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await post('TAG1', HELLO, headers(i))).status);
      return statuses;
    };
    const STOPPED = [200, 200, 200, 429, 429, 429];

    it('inventing a new X-Forwarded-For each time', async () => {
      expect(
        await attempts((i) => ({ 'x-forwarded-for': `203.0.113.${i}, 198.51.100.9`, 'x-real-ip': '198.51.100.9' })),
      ).toEqual(STOPPED);
    });

    it('inventing a new first X-Forwarded-For entry when there is no X-Real-IP', async () => {
      expect(await attempts((i) => ({ 'x-forwarded-for': `203.0.113.${i}, 198.51.100.10` }))).toEqual(STOPPED);
    });

    it('inventing CF-Connecting-IP while calling Railway directly', async () => {
      expect(
        await attempts((i) => ({ 'cf-connecting-ip': `203.0.113.${i}`, 'x-real-ip': '198.51.100.11' })),
      ).toEqual(STOPPED);
    });

    it('rotating addresses inside one IPv6 /64', async () => {
      expect(await attempts((i) => ({ 'x-real-ip': `2001:db8:aa:bb::${i + 1}` }))).toEqual(STOPPED);
    });

    it('through Cloudflare: the visitor is counted, not the Cloudflare address', async () => {
      const via = (visitor: string) => ({ 'x-real-ip': '172.64.1.1', 'cf-connecting-ip': visitor });
      expect(await attempts(() => via('198.51.100.12'))).toEqual(STOPPED);
      // Another visitor behind the same Cloudflare address is not blocked by the first one.
      await reopenPet();
      expect((await post('TAG1', HELLO, via('198.51.100.13'))).status).toBe(200);
    });

    it('signing in, or switching accounts, does not give a new allowance', async () => {
      const statuses: number[] = [];
      for (const session of [null, A, B, null, A]) {
        authState.session = session ? { user: { id: session.authUserId } } : null;
        statuses.push((await post('TAG1', HELLO, '198.51.100.14')).status);
      }
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
    });

    it('using the old message-only form', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) statuses.push((await post('TAG1', { message: 'old' }, '198.51.100.15')).status);
      expect(statuses).toEqual([200, 200, 200, 429]);
    });

    it('many addresses at once still ring only once in 10 minutes and 4 times a day', async () => {
      let sender = 0;
      for (let round = 0; round < 6; round++) {
        for (let i = 0; i < 8; i++) await post('TAG1', HELLO, `192.0.2.${++sender}`);
        expect(urgentPushes()).toHaveLength(Math.min(round + 1, 4));
        expect(await bellRows()).toHaveLength(Math.min((round + 1) * 5, 30));
        await age('11 minutes');
      }
      expect(pushes()).toHaveLength(30); // refused messages push nothing at all
    });

    it('the sender address is not stored in readable form', async () => {
      await post('TAG1', HELLO, '198.51.100.16');
      const rows = await raw`select subject from rate_limit_hits where bucket like 'emergency_relay%'`;
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.subject).toMatch(/^ip:[0-9a-f]{32}/);
        expect(r.subject).not.toContain('198.51.100.16');
        expect(r.subject).not.toContain('TAG1');
      }
    });

    it('a rejected form does not use up the allowance of a real finder', async () => {
      for (let i = 0; i < 5; i++) await post('TAG1', { message: 'hi', finderPhone: '' }, '198.51.100.17');
      expect((await post('TAG1', HELLO, '198.51.100.17')).status).toBe(200);
    });
  });
});

describe('family and caregivers are notified, by their own settings', () => {
  beforeEach(seedHousehold);
  const recipients = () => pushes().map(([to]) => to).sort();
  const everyone = [PUSH_TOKEN, tokenFor(FAMILY), tokenFor(SITTER)].sort();

  it('pushes the owner and each active member, urgent for all, and answers only ok', async () => {
    const res = await post('TAG1', HELLO);
    expect(await res.json()).toEqual({ ok: true });
    expect(recipients()).toEqual(everyone);
    expect(pushes().every(([, level]) => level === 'time-sensitive')).toBe(true);
  });

  it('a member who switched "Lost pet alerts" off gets the bell entry but no push', async () => {
    await raw`insert into notification_prefs (user_id, category, enabled) values (${FAMILY}, 'owner_lost_alerts', false)`;
    await post('TAG1', HELLO);
    expect(recipients()).toEqual([PUSH_TOKEN, tokenFor(SITTER)].sort());
    expect(await bellRows(FAMILY)).toHaveLength(1);
  });

  it('a member without a phone registered still gets the bell entry', async () => {
    await raw`delete from device_push_tokens where user_id = ${SITTER}`;
    await post('TAG1', HELLO);
    expect(recipients()).toEqual([PUSH_TOKEN, tokenFor(FAMILY)].sort());
    expect(await bellRows(SITTER)).toHaveLength(1);
  });

  it('quiet hours silence a member who has them, never the owner (notifications v2 on)', async () => {
    process.env.NOTIF_V2_ENABLED = 'true';
    // 03:00 in Buenos Aires: inside the default quiet hours. Only Date is faked, so timers and the database run.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-26T06:00:00Z') });
    await raw`insert into notification_settings (owner_user_id, quiet_hours_enabled) values (${SITTER}, false)`;
    await raw`insert into notification_settings (owner_user_id, quiet_hours_enabled) values (${A.profileId}, true)`;
    await post('TAG1', HELLO);
    expect(recipients()).toEqual([PUSH_TOKEN, tokenFor(SITTER)].sort());
    expect(await bellRows(FAMILY)).toHaveLength(1);
  });

  it('outside quiet hours every member is pushed (notifications v2 on)', async () => {
    process.env.NOTIF_V2_ENABLED = 'true';
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-26T15:00:00Z') });
    await post('TAG1', HELLO);
    expect(recipients()).toEqual(everyone);
  });
});

describe('retention: finder details are deleted after 90 days', () => {
  const list = async (authUserId: number) => {
    authState.session = { user: { id: authUserId } };
    return (await (await api.request('/notifications')).json()).notifications;
  };
  const runCron = () =>
    api.request('/notifications/push-receipts/run', { method: 'POST', headers: { 'x-cron-secret': 'test-secret' } });
  const full = { pet_name: 'Rex', name: 'Marta', phone: '123456', message: 'hi' };

  async function seedOldAndNew() {
    await seedHousehold();
    await finderCall('TAG1', 'old message', 'Old Finder', '111111', 'old@example.test');
    await asApp(null, (tx) => tx`select app_emergency_relay_contact('TAG1', 'older relay 222222')`);
    await age('91 days');
    await finderCall('TAG1', 'hi', 'Marta', '123456', null);
    await age('89 days'); // old rows are now 180 days old, the new one 89
  }

  it('never returns them past 90 days, even before the job has run', async () => {
    await seedOldAndNew();
    const notifications = await list(A.authUserId);
    expect(notifications).toHaveLength(3);
    expect(notifications[0].finder_contact).toEqual(full);
    expect(notifications[0].body).toContain('Marta');
    for (const old of notifications.slice(1)) {
      expect(old.body).toBeNull();
      expect(Object.keys(old.finder_contact)).toEqual(['pet_name']);
    }
    expect(JSON.stringify(notifications)).not.toMatch(/Old Finder|111111|old@example\.test|222222/);
    expect(JSON.stringify(await list(FAMILY))).not.toContain('Old Finder');
  });

  it('the hourly job deletes them from every copy, keeps newer ones, and is safe to repeat', async () => {
    await seedOldAndNew();
    // A different kind of notification of the same age is not touched.
    await raw`insert into notifications (recipient_user_id, type, body, created_at)
              values (${A.profileId}, 'paw', 'keep me', now() - interval '200 days')`;
    process.env.CRON_SECRET = 'test-secret';
    const first = await (await runCron()).json();
    expect(first.finderDetailsCleared).toBe(4); // owner + 2 members for the old message, 1 old relay row
    const stored = JSON.stringify(await raw`select body, finder_contact from notifications`);
    expect(stored).not.toMatch(/Old Finder|111111|old@example\.test|222222/);
    expect(stored).toContain('Marta');
    expect(stored).toContain('keep me');
    const [kept] = await raw`
      select finder_contact from notifications where finder_contact is not null order by created_at limit 1`;
    expect(kept.finder_contact).toEqual({ pet_name: 'Rex' });
    expect((await (await runCron()).json()).finderDetailsCleared).toBe(0);
  });

  it('also removes old sender counters, and only the finder ones', async () => {
    await raw`insert into rate_limit_hits (bucket, subject, window_start, hits) values
      ('emergency_relay', 'ip:old', now() - interval '91 days', 1),
      ('emergency_relay_daily', 'ip:new', now() - interval '1 day', 1),
      ('post_create', 'u:1', now() - interval '91 days', 1)`;
    await asApp(null, (tx) => tx`select app_purge_finder_details()`);
    const left = await raw`select subject from rate_limit_hits order by subject`;
    expect(left.map((r) => r.subject)).toEqual(['ip:new', 'u:1']);
  });

  it('the job refuses a caller without the secret', async () => {
    await seedOldAndNew();
    process.env.CRON_SECRET = 'test-secret';
    const res = await api.request('/notifications/push-receipts/run', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(await raw`select body from notifications`)).toContain('Old Finder');
  });
});

describe('new web code on a database without 0146', () => {
  const removeMigration = async () => {
    await raw.unsafe('drop function app_emergency_finder_message(text, text, text, text, text, boolean)');
    await raw.unsafe('drop function app_purge_finder_details()');
    await raw.unsafe('alter table notifications drop column finder_contact, drop column finder_urgent');
    await raw.unsafe('alter table pet_emergency_cards drop column show_emergency_contact_on_tag');
    // The assembler and the publish rule as they were before 0146.
    await raw.unsafe(readMigration('0122_emergency_tag_medical_least_privilege.sql'));
    await raw.unsafe('drop function app_emergency_published_contact(text, text)');
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

  it('the emergency card still loads and saves; only the new setting says it is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await removeMigration();
    try {
      authState.session = { user: { id: A.authUserId } };
      const patch = (body: unknown) =>
        api.request('/emergency-card', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      const got = await api.request(`/emergency-card?petId=${A.petId}`);
      expect(got.status).toBe(200);
      expect((await got.json()).card.show_emergency_contact_on_tag).toBeNull();
      expect((await patch({ petId: A.petId, show_emergency_contact_on_tag: true })).status).toBe(503);
      const saved = await patch({ petId: A.petId, contact_mode: 'none' });
      expect(saved.status).toBe(200);
      expect((await saved.json()).card.contact_mode).toBe('none');
      process.env.CRON_SECRET = 'test-secret';
      const cron = await api.request('/notifications/push-receipts/run', {
        method: 'POST',
        headers: { 'x-cron-secret': 'test-secret' },
      });
      expect(await cron.json()).toEqual({ skipped: 'disabled', finderDetailsCleared: null });
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
    expect((await raw.unsafe(verify0146)).length).toBe(VERIFY_ROWS);
    expect(await failing(raw)).toEqual([]);
  });

  it('keeps verify_0122.sql passing', async () => {
    const rows = await raw.unsafe<{ status: string }[]>(
      readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0122.sql'), 'utf8'),
    );
    expect(rows.filter((r) => r.status !== 'PASS')).toEqual([]);
  });

  const brokenBy = async (statements: string[]) => {
    const ROLLBACK = new Error('rollback');
    let names: string[] = [];
    await raw
      .begin(async (tx) => {
        for (const statement of statements) await tx.unsafe(statement);
        names = await failing(tx as unknown as Sql);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    return names.map((n) => Number(n.split(' ')[0]));
  };

  it('can fail: without 0146 functions and with the 0122 assembler (rolled back)', async () => {
    const rows = await brokenBy([
      'drop function app_emergency_finder_message(text, text, text, text, text, boolean)',
      'drop function app_purge_finder_details()',
      readMigration('0122_emergency_tag_medical_least_privilege.sql'),
    ]);
    expect(rows).toEqual([4, 5, 6, 7, 8, 9, 10, 13, 15, 16, 17]);
  });

  it('can fail: a default-ON opt-in, a looser publish rule and a public purge are each flagged', async () => {
    expect(
      await brokenBy(['alter table pet_emergency_cards alter column show_emergency_contact_on_tag set default true']),
    ).toEqual([3]);
    expect(
      await brokenBy([
        `create or replace function app_emergency_published_contact(p_mode text, p_value text) returns text
           language sql immutable set search_path = public, pg_temp as 'select p_value'`,
      ]),
    ).toEqual([11]);
    expect(await brokenBy(['grant execute on function app_purge_finder_details() to public'])).toEqual([17]);
  });

  it('can fail: an assembler that hands the emergency contact to every full link is flagged', async () => {
    const [{ def }] = await raw<{ def: string }[]>`
      select pg_get_functiondef('app_emergency_card_json(integer, boolean, text)'::regprocedure) as def`;
    const leaky = def.replace("'vet_phone', mp.vet_phone,", "'vet_phone', mp.vet_phone, 'emergency_contact_phone', mp.emergency_contact_phone,");
    expect(leaky).not.toBe(def);
    expect(await brokenBy([leaky])).toContain(16);
  });
});
