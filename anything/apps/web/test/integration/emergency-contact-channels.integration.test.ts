// Emergency card contact channels (migration 0152), on the REAL tables, through the REAL request router, as
// pawpi_app:
//   • a card never saved with the switches behaves and reads exactly as before;
//   • phone, email, both, or neither (private message / no contact): public pages, vet links, finder message;
//   • one truth between the old columns (older app builds) and the new ones, whoever writes last;
//   • only the owner reads or changes the choice;
//   • the web code on a database without 0152; re-applying the migration; verify_0152.sql and verify_0146.sql.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, inject, vi } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedMedicalProfile, seedOwnerWithPet, seedUser } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));
vi.mock('expo-server-sdk', () => ({
  Expo: class {
    sendPushNotificationsAsync = async () => [];
    chunkPushNotifications = (m: any[]) => [m];
    static isExpoPushToken() {
      return true;
    }
  },
}));

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const FAMILY = 11;
const PHONE = '+54 9 11 5555 0101';
const OTHER_PHONE = '+54 9 11 5555 0303';
const EMAIL = 'ana.owner@example.test';
const KIN_PHONE = '+54 9 11 6666 0202';
const NEW_COLUMNS = [
  'contact_phone_enabled',
  'contact_email_enabled',
  'contact_message_enabled',
  'contact_phone',
  'contact_email',
] as const;
const UNSET = Object.fromEntries(NEW_COLUMNS.map((c) => [c, null]));
const VERIFY_ROWS = 11;

const readMigration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
const readVerify = (name: string) => readFileSync(join(MIGRATIONS_DIR, '..', name), 'utf8');
const migration0146 = readMigration('0146_emergency_finder_contact.sql');
const migration0152 = readMigration('0152_emergency_contact_channels.sql');
const verify0152 = readVerify('verify_0152.sql');

let raw: Sql;
let app: Sql;
let api: { request: (path: string, init?: RequestInit) => Promise<Response> };

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

/** The two columns older app builds write, set directly. */
const setMode = (mode: string, value: string | null) =>
  raw`update pet_emergency_cards set contact_mode = ${mode}, contact_value = ${value} where id = 1`;

const stored = async () => {
  const [row] = await raw`
    select contact_mode, contact_value, contact_phone_enabled, contact_email_enabled, contact_message_enabled,
           contact_phone, contact_email
      from pet_emergency_cards where id = 1`;
  return { ...row } as Record<string, any>;
};
const newColumns = async () => {
  const row = await stored();
  return Object.fromEntries(NEW_COLUMNS.map((c) => [c, row[c]]));
};

const as = (who: { authUserId: number } | number | null) => {
  authState.session = who === null ? null : { user: { id: typeof who === 'number' ? who : who.authUserId } };
};
const patch = (body: Record<string, unknown>) =>
  api.request('/emergency-card', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ petId: A.petId, ...body }),
  });
const ownerCard = async () => {
  as(A);
  const res = await api.request(`/emergency-card?petId=${A.petId}`);
  expect(res.status).toBe(200);
  return (await res.json()).card;
};
const save = async (body: Record<string, unknown>) => {
  as(A);
  const res = await patch(body);
  expect(res.status).toBe(200);
  return (await res.json()).card;
};

let ip = 0;
const publicText = async (path: string) => {
  const res = await api.request(path, { headers: { 'x-real-ip': `10.3.0.${++ip}` } });
  expect(res.status, path).toBe(200);
  return res.text();
};
const PATHS = ['/public/emergency/tag/TAG1', '/public/emergency/card/LINKFULL', '/public/emergency/card/LINKBASIC'];
/** The public `contact` object, which must be the same on the tag and on both vet links. */
const publicContact = async () => {
  const contacts = [];
  for (const path of PATHS) contacts.push(JSON.parse(await publicText(path)).card.contact);
  expect(contacts[1]).toEqual(contacts[0]);
  expect(contacts[2]).toEqual(contacts[0]);
  return contacts[0];
};
const vetLinkHasKin = async () => (await publicText('/public/emergency/card/LINKFULL')).includes(KIN_PHONE);
const finderMessageAccepted = async () => {
  const before = (await raw`select id from notifications`).length;
  const res = await api.request('/public/emergency/tag/TAG1/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.4.0.${++ip}` },
    body: JSON.stringify({ message: 'hi', finderPhone: '123456' }),
  });
  const { ok } = await res.json();
  expect((await raw`select id from notifications`).length - before).toBe(ok ? 1 : 0);
  // Open the per-pet window again, so cases do not affect each other.
  await raw`update notifications set created_at = created_at - interval '25 hours'`;
  return ok as boolean;
};

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
  // Other files re-apply older migrations on the shared cluster; assert this file's final state first.
  await raw.unsafe(migration0152);
});

afterAll(async () => {
  // 0156 replaced the card assembler again: put it back after this file's re-applies of 0146 and 0152.
  await raw.unsafe(readMigration('0156_pet_age_estimate.sql'));
  await app.end();
  await raw.end();
});

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedMedicalProfile(raw, { profileRowId: 1, petId: A.petId, ownerUserId: A.profileId });
  await raw`
    update pet_medical_profiles set emergency_contact_name = 'Kin Person', emergency_contact_phone = ${KIN_PHONE}
     where pet_id = ${A.petId}`;
  await raw`
    insert into pet_emergency_cards (id, pet_id, owner_user_id, tag_token, show_medical_on_tag, contact_mode, active)
    values (1, ${A.petId}, ${A.profileId}, 'TAG1', true, 'relay', true)`;
  await raw`
    insert into pet_emergency_share_links (id, pet_id, owner_user_id, token, scope)
    values (1, ${A.petId}, ${A.profileId}, 'LINKFULL', 'full'), (2, ${A.petId}, ${A.profileId}, 'LINKBASIC', 'basic')`;
});

afterEach(async () => {
  await resetDb(raw);
  as(null);
  vi.restoreAllMocks();
});

const LEGACY_CASES = ['relay', 'phone', 'email', 'none'].flatMap((mode) =>
  [null, '', '  ', PHONE, EMAIL].map((value) => [mode, value] as [string, string | null]),
);
const publishedBefore = (mode: string, value: string | null) =>
  value && value.trim() && ((mode === 'phone' && !value.includes('@')) || (mode === 'email' && value.includes('@')))
    ? value
    : null;

describe('a card never saved with the switches', () => {
  it.each(LEGACY_CASES)('%s / %s reads publicly exactly as before, with no new keys', async (mode, value) => {
    await setMode(mode, value);
    const published = publishedBefore(mode, value);
    expect(await publicContact()).toEqual({
      mode,
      value: published,
      accepts_message: mode === 'relay' || ((mode === 'phone' || mode === 'email') && !published),
    });
  });

  it('is not rewritten by opening it or by saving other settings', async () => {
    await setMode('phone', PHONE);
    await ownerCard();
    await save({ show_medical_on_tag: false });
    await save({ show_emergency_contact_on_tag: true });
    await save({ active: true });
    expect(await stored()).toEqual({ contact_mode: 'phone', contact_value: PHONE, ...UNSET });
  });

  it.each(LEGACY_CASES)(
    '%s / %s: what the owner is shown is what the first switch save starts from, and nothing public changes',
    async (mode, value) => {
      await setMode(mode, value);
      const shown = await ownerCard();
      const expected = Object.fromEntries(NEW_COLUMNS.map((c) => [c, shown[c]]));
      expect(expected.contact_phone_enabled).toBe(mode === 'phone');
      expect(expected.contact_email_enabled).toBe(mode === 'email');
      const before = await publicContact();

      // Saving one switch with the value it already shows, through either of two different switches.
      for (const field of ['contact_message_enabled', 'contact_phone_enabled']) {
        await setMode(mode, value); // back to a card without a switch choice
        expect(await newColumns()).toEqual(UNSET);
        const saved = await save({ [field]: expected[field] });
        expect(await newColumns()).toEqual(expected);
        expect(Object.fromEntries(NEW_COLUMNS.map((c) => [c, saved[c]]))).toEqual(expected);
        const after = await publicContact();
        expect(after.value).toEqual(before.value);
        expect(after.accepts_message).toEqual(before.accepts_message);
        expect(after.phone).toEqual(mode === 'phone' ? before.value : null);
        expect(after.email).toEqual(mode === 'email' ? before.value : null);
      }
    },
  );
});

describe('the two switches', () => {
  const choose = (phoneOn: boolean, emailOn: boolean, messageOn = true) =>
    save({
      contact_phone_enabled: phoneOn,
      contact_email_enabled: emailOn,
      contact_message_enabled: messageOn,
      contact_phone: PHONE,
      contact_email: EMAIL,
    });

  it.each([
    ['both', true, true, true, 'phone', PHONE, PHONE, EMAIL],
    ['phone only', true, false, true, 'phone', PHONE, PHONE, null],
    ['email only', false, true, true, 'email', EMAIL, null, EMAIL],
    ['both, message switch off', true, true, false, 'phone', PHONE, PHONE, EMAIL],
  ])(
    '%s: shows only what is on, and no message form',
    async (_name, phoneOn, emailOn, messageOn, mode, value, phone, email) => {
      await choose(phoneOn, emailOn, messageOn);
      expect(await publicContact()).toEqual({ mode, value, accepts_message: false, phone, email });
      expect(await stored()).toMatchObject({ contact_mode: mode, contact_value: value });
      for (const path of PATHS) {
        const text = await publicText(path);
        expect(text.includes(PHONE), path).toBe(phone !== null);
        expect(text.includes(EMAIL), path).toBe(email !== null);
      }
      expect(await vetLinkHasKin()).toBe(true);
      expect(await finderMessageAccepted()).toBe(false);
    },
  );

  it.each([
    ['private message', true, 'relay'],
    ['no contact', false, 'none'],
  ])('neither, %s: publishes nothing and the vet link has no emergency contact', async (_name, messageOn, mode) => {
    await choose(true, true);
    await choose(false, false, messageOn);
    expect(await publicContact()).toEqual({ mode, value: null, accepts_message: messageOn, phone: null, email: null });
    for (const path of PATHS) {
      const text = await publicText(path);
      expect(text).not.toContain(PHONE);
      expect(text).not.toContain(EMAIL);
    }
    expect(await vetLinkHasKin()).toBe(false);
    expect(await finderMessageAccepted()).toBe(messageOn);
    // The owner keeps what was typed, for the next time a switch goes on.
    expect(await ownerCard()).toMatchObject({ contact_phone: PHONE, contact_email: EMAIL });
  });

  it.each([
    ['nothing saved', '', ''],
    ['each value in the other field', EMAIL, PHONE],
    ['only spaces', '  ', '  '],
  ])('both on with %s: publishes nothing and offers the message form', async (_name, phone, email) => {
    await save({ contact_phone_enabled: true, contact_email_enabled: true, contact_phone: phone, contact_email: email });
    expect(await publicContact()).toMatchObject({ value: null, accepts_message: true, phone: null, email: null });
    for (const path of PATHS) {
      const text = await publicText(path);
      expect(text).not.toContain(PHONE);
      expect(text).not.toContain(EMAIL);
    }
    expect(await finderMessageAccepted()).toBe(true);
    expect(await vetLinkHasKin()).toBe(true);
  });

  it.each([
    ['phone', '', EMAIL, 'email', EMAIL],
    ['phone', EMAIL, EMAIL, 'email', EMAIL],
    ['email', PHONE, '', 'phone', PHONE],
  ])(
    'both on and the %s one unusable (%s / %s): shows the other, no message form',
    async (_bad, phone, email, mode, value) => {
      await save({ contact_phone_enabled: true, contact_email_enabled: true, contact_phone: phone, contact_email: email });
      expect(await publicContact()).toEqual({
        mode,
        value,
        accepts_message: false,
        phone: mode === 'phone' ? value : null,
        email: mode === 'email' ? value : null,
      });
      expect(await finderMessageAccepted()).toBe(false);
    },
  );

  it('turning a channel off, or clearing its value, removes it everywhere', async () => {
    await choose(true, true);
    await save({ contact_phone_enabled: false });
    for (const path of PATHS) expect(await publicText(path)).not.toContain(PHONE);
    expect(await publicContact()).toMatchObject({ mode: 'email', value: EMAIL, phone: null, email: EMAIL });

    await save({ contact_email: '' });
    for (const path of PATHS) expect(await publicText(path)).not.toContain(EMAIL);
    expect(await publicContact()).toMatchObject({ value: null, accepts_message: true });
    expect(await stored()).toMatchObject({ contact_value: '', contact_email: '' });
  });

  it('from "no contact", switching a channel on and off again returns to "no contact"', async () => {
    await setMode('none', null);
    await save({ contact_phone_enabled: true });
    await save({ contact_phone: PHONE });
    expect(await publicContact()).toMatchObject({ mode: 'phone', value: PHONE, phone: PHONE, email: null });
    await save({ contact_phone_enabled: false });
    expect(await publicContact()).toMatchObject({ mode: 'none', value: null, accepts_message: false });
  });

  it('survives opening the card and saving other settings', async () => {
    await choose(true, true);
    await ownerCard();
    await save({ show_medical_on_tag: false });
    await save({ show_emergency_contact_on_tag: true });
    expect(await publicContact()).toMatchObject({ phone: PHONE, email: EMAIL });
  });
});

describe('an app build without the switches, after a choice made with them', () => {
  beforeEach(async () => {
    await save({ contact_phone_enabled: true, contact_email_enabled: true, contact_phone: PHONE, contact_email: EMAIL });
  });

  it.each([
    [{ contact_mode: 'none' }, { mode: 'none', value: null, accepts_message: false }],
    [{ contact_mode: 'relay' }, { mode: 'relay', value: null, accepts_message: true }],
    // The same mode the card already shows: choosing it again means that one channel only.
    [{ contact_mode: 'phone' }, { mode: 'phone', value: PHONE, accepts_message: false }],
    [{ contact_mode: 'email' }, { mode: 'email', value: null, accepts_message: true }],
    [{ contact_value: OTHER_PHONE }, { mode: 'phone', value: OTHER_PHONE, accepts_message: false }],
  ])('%o takes effect and nothing from the earlier choice stays public', async (body, contact) => {
    const card = await save(body);
    expect(await newColumns()).toEqual(UNSET);
    expect(await publicContact()).toEqual(contact);
    for (const path of PATHS) expect(await publicText(path)).not.toContain(EMAIL);
    expect(card.contact_email_enabled).toBe(contact.mode === 'email');
    expect(card.contact_phone_enabled).toBe(contact.mode === 'phone');
    expect(await vetLinkHasKin()).toBe(contact.mode === 'phone' || contact.mode === 'email');
    expect(await finderMessageAccepted()).toBe(contact.accepts_message);
  });

  it('a save from the previous web version (which always names both columns) never shows more', async () => {
    await asApp(A.profileId, (tx) => tx`
      update pet_emergency_cards
         set contact_mode = coalesce(${null}, contact_mode), contact_value = coalesce(${null}, contact_value),
             show_medical_on_tag = false
       where id = 1`);
    expect(await publicContact()).toEqual({ mode: 'phone', value: PHONE, accepts_message: false });
  });

  it('one request cannot carry both shapes; one statement naming both is read as the older one', async () => {
    as(A);
    const before = await stored();
    const res = await patch({ contact_mode: 'none', contact_phone_enabled: true });
    expect(res.status).toBe(400);
    expect(await stored()).toEqual(before);

    await raw`update pet_emergency_cards set contact_mode = 'none', contact_email_enabled = true where id = 1`;
    expect(await stored()).toEqual({ contact_mode: 'none', contact_value: PHONE, ...UNSET });
  });

  it('and the switches work again afterwards', async () => {
    await save({ contact_mode: 'none' });
    await save({ contact_email_enabled: true, contact_email: EMAIL });
    expect(await publicContact()).toMatchObject({ mode: 'email', value: EMAIL, phone: null, email: EMAIL });
  });
});

describe('only the owner', () => {
  beforeEach(async () => {
    await seedUser(raw, { authUserId: FAMILY, profileId: FAMILY, username: 'familymember' });
    await raw`insert into pet_caregivers (pet_id, owner_user_id, grantee_user_id, role, status)
              values (${A.petId}, ${A.profileId}, ${FAMILY}, 'family', 'active')`;
  });

  it.each([
    ['a stranger', B.authUserId],
    ['a family member', FAMILY],
  ])('%s cannot change the switches', async (_who, authUserId) => {
    as(authUserId);
    const res = await patch({ contact_phone_enabled: true, contact_phone: OTHER_PHONE });
    expect(res.status).toBe(404);
    expect(await newColumns()).toEqual(UNSET);
  });

  it('a family member reads the card without any contact field', async () => {
    await save({ contact_phone_enabled: true, contact_phone: PHONE });
    as(FAMILY);
    const res = await api.request(`/emergency-card?petId=${A.petId}`);
    const { card } = await res.json();
    for (const field of [...NEW_COLUMNS, 'contact_mode', 'contact_value', 'tag_token']) {
      expect(card).not.toHaveProperty(field);
    }
  });

  it('row security: as pawpi_app only the owner updates a row', async () => {
    const write = (userId: number | null) =>
      asApp(userId, (tx) => tx`update pet_emergency_cards set contact_phone_enabled = true returning id`);
    expect(await write(B.profileId)).toHaveLength(0);
    expect(await write(null)).toHaveLength(0);
    expect(await newColumns()).toEqual(UNSET);
    expect(await write(A.profileId)).toHaveLength(1);
    expect((await stored()).contact_phone_enabled).toBe(true);
  });

  it('rejects wrong types', async () => {
    as(A);
    for (const body of [{ contact_phone_enabled: 'yes' }, { contact_email_enabled: null }, { contact_phone: 5 }]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect(await newColumns()).toEqual(UNSET);
  });
});

describe('new web code on a database without 0152', () => {
  const removeMigration = async () => {
    await raw.unsafe('drop trigger pet_emergency_cards_contact_1_from_mode on pet_emergency_cards');
    await raw.unsafe('drop trigger pet_emergency_cards_contact_2_to_mode on pet_emergency_cards');
    await raw.unsafe('drop function app_emergency_contact_from_mode()');
    await raw.unsafe('drop function app_emergency_contact_to_mode()');
    await raw.unsafe(migration0146); // the assembler as it was
    await raw.unsafe(`alter table pet_emergency_cards ${NEW_COLUMNS.map((c) => `drop column ${c}`).join(', ')}`);
  };

  it('loads and saves as before; the switches are reported unavailable and change nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await removeMigration();
    try {
      await setMode('phone', PHONE);
      const card = await ownerCard();
      expect(card).toMatchObject({ contact_mode: 'phone', contact_value: PHONE, ...UNSET });

      const refused = await patch({ contact_email_enabled: true, show_medical_on_tag: false });
      expect(refused.status).toBe(503);
      expect((await refused.json()).code).toBe('contact_channels_unavailable');
      const [row] = await raw`select show_medical_on_tag as medical, contact_mode from pet_emergency_cards where id = 1`;
      expect(row).toMatchObject({ medical: true, contact_mode: 'phone' });

      expect(await save({ contact_mode: 'relay' })).toMatchObject({ contact_mode: 'relay', ...UNSET });
      expect(await publicContact()).toEqual({ mode: 'relay', value: null, accepts_message: true });
      expect(await finderMessageAccepted()).toBe(true);
      expect(await save({ show_medical_on_tag: false })).toMatchObject({ show_medical_on_tag: false });
    } finally {
      await raw.unsafe(migration0152);
    }
  });
});

describe('the migration and its verify script', () => {
  const failing = async (tx: Sql, script = verify0152) =>
    (await tx.unsafe<{ ord: number; check_name: string; detail: string; status: string }[]>(script))
      .filter((r) => r.status !== 'PASS')
      .map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);

  it('re-applying it changes no row, and every verify row reads PASS (0146 and 0122 too)', async () => {
    await save({ contact_phone_enabled: true, contact_email_enabled: true, contact_phone: PHONE, contact_email: EMAIL });
    await raw`insert into pet_emergency_cards (id, pet_id, owner_user_id, tag_token, contact_mode, contact_value)
              values (2, ${B.petId}, ${B.profileId}, 'TAG2', 'email', ${EMAIL})`;
    const all = () => raw`select * from pet_emergency_cards order by id`;
    const before = await all();
    await raw.unsafe(migration0152);
    await raw.unsafe(migration0152);
    expect(await all()).toEqual(before);
    expect((await raw.unsafe(verify0152)).length).toBe(VERIFY_ROWS);
    expect(await failing(raw)).toEqual([]);
    expect(await failing(raw, readVerify('verify_0146.sql'))).toEqual([]);
    expect(await failing(raw, readVerify('verify_0122.sql'))).toEqual([]);
  });

  it('a card inserted with switch fields is filled in the same way', async () => {
    await raw`insert into pet_emergency_cards (id, pet_id, owner_user_id, tag_token, contact_email_enabled, contact_email)
              values (2, ${B.petId}, ${B.profileId}, 'TAG2', true, ${EMAIL})`;
    const [row] = await raw`select * from pet_emergency_cards where id = 2`;
    expect(row).toMatchObject({
      contact_mode: 'email', contact_value: EMAIL, contact_phone_enabled: false, contact_message_enabled: true,
    });
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

  it('the verify script can fail (each change rolled back)', async () => {
    expect(await brokenBy(['drop trigger pet_emergency_cards_contact_1_from_mode on pet_emergency_cards'])).toEqual([3]);
    expect(
      await brokenBy(['alter table pet_emergency_cards disable trigger pet_emergency_cards_contact_2_to_mode']),
    ).toEqual([4]);
    expect(await brokenBy(['grant execute on function app_emergency_contact_to_mode() to public'])).toEqual([6]);
    expect(await brokenBy([migration0146])).toEqual([8]);
    expect(
      await brokenBy([
        'alter table pet_emergency_cards disable trigger user',
        `update pet_emergency_cards set contact_phone_enabled = true, contact_email_enabled = false,
           contact_message_enabled = true, contact_mode = 'relay' where id = 1`,
      ]),
    ).toEqual([3, 4, 11]);
  });
});
