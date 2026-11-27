// Directory opening hours: the converter (supabase/seed/directory/hours.mjs) and the one-off conversion of rows
// already stored in Google's format (normalize_hours.mjs), run against the migrated throwaway Postgres.
//
// What this proves: Google's text becomes the shape the app reads (and the app's open-now helper agrees with it);
// anything ambiguous is left empty and reported, never guessed; the stored-row conversion writes only to listings
// still unclaimed whose hours are unchanged, and a second run changes nothing.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb } from './db';
import { normalizeGoogleHours, readDay } from '../../../../../supabase/seed/directory/hours.mjs';
import {
  NORMALIZE_SQL,
  planConversion,
} from '../../../../../supabase/seed/directory/normalize_hours.mjs';
import { runStatement, toSqlScript } from '../../../../../supabase/seed/directory/lib.mjs';
import { deriveOpenNow } from '../../src/app/provider/lib/openNow';

// Google puts a narrow no-break space between a number and a.m./p.m.
const g = (text: string) => text.replace(/ (?=[ap]\.m\.)/g, ' ');
const range = (open: string, close: string) => ({ open, close });

describe('readDay', () => {
  it.each([
    ['9 a.m.–9 p.m.', range('09:00', '21:00')],
    ['10:30 a.m.–1:15 p.m.', range('10:30', '13:15')],
    // A start with no a.m./p.m. takes the end's.
    ['1–10 p.m.', range('13:00', '22:00')],
    ['12–2 p.m.', range('12:00', '14:00')],
    ['12–6 a.m.', range('00:00', '06:00')],
    ['9–11 a.m.', range('09:00', '11:00')],
    // Split days.
    ['10 a.m.–1 p.m., 4–8 p.m.', [range('10:00', '13:00'), range('16:00', '20:00')]],
    [
      '12–8:30 a.m., 9:30 a.m.–1:30 p.m., 5 p.m.–12 a.m.',
      [range('00:00', '08:30'), range('09:30', '13:30'), range('17:00', '00:00')],
    ],
    // Midnight and past it.
    ['10 a.m.–12 a.m.', range('10:00', '00:00')],
    ['6 p.m.–2 a.m.', range('18:00', '02:00')],
    ['12 p.m.–1:30 a.m.', range('12:00', '01:30')],
    ['Cerrado', 'closed'],
    ['Abierto las 24 horas', range('00:00', '24:00')],
  ])('%s', (text, expected) => {
    expect(readDay(text)).toEqual(expected);
    expect(readDay(g(text))).toEqual(expected);
  });

  it.each([
    '',
    'Con cita previa',
    'Horario no disponible',
    '9–18',
    '9 a.m.',
    '9 a.m.–9 a.m.',
    // Would start after it ends, and nothing says it runs past midnight.
    '9–1 p.m.',
    // Past midnight into the afternoon is not believed.
    '9 p.m.–1 p.m.',
    '13 a.m.–2 p.m.',
    '9:75 a.m.–2 p.m.',
    // Overlapping, out of order, or a range after one that runs past midnight.
    '9 a.m.–2 p.m., 1–8 p.m.',
    '4–8 p.m., 10 a.m.–1 p.m.',
    '6 p.m.–2 a.m., 3–5 a.m.',
    '10 a.m.–1 p.m., Con cita',
    '9 a.m.–1 p.m. (feriado)',
  ])('refuses "%s"', (text) => {
    expect(readDay(text)).toBeNull();
  });

  it('refuses a value that is not text', () => {
    expect(readDay(null)).toBeNull();
    expect(readDay(['9 a.m.–1 p.m.'])).toBeNull();
  });
});

describe('normalizeGoogleHours', () => {
  const GOOGLE = {
    jueves: g('9 a.m.–6 p.m.'),
    lunes: g('10 a.m.–1 p.m., 4–8 p.m.'),
    martes: 'Abierto las 24 horas',
    'miércoles': 'Cerrado',
    viernes: g('6 p.m.–2 a.m.'),
    'sábado': g('10 a.m.–2 p.m.'),
    domingo: 'Cerrado',
  };

  it('converts a week to English day keys, Monday first', () => {
    const read = normalizeGoogleHours(GOOGLE);
    expect(read.status).toBe('converted');
    expect(Object.keys(read.hours as object)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(read.problems).toEqual([]);
  });

  it('gives the open-now answers the Google text means', () => {
    const { hours } = normalizeGoogleHours(GOOGLE);
    // 2026-11-23 is a Monday.
    const at = (day: number, h: number, m = 0) => deriveOpenNow(hours, new Date(2026, 10, 23 + day, h, m));
    expect(at(0, 12, 59)).toBe(true);
    expect(at(0, 14)).toBe(false); // the midday break
    expect(at(0, 16)).toBe(true);
    expect(at(0, 20)).toBe(false);
    expect(at(1, 3)).toBe(true); // all day
    expect(at(1, 23, 59)).toBe(true);
    expect(at(2, 0)).toBe(false); // closed, and the all-day Tuesday does not spill into it
    expect(at(4, 23)).toBe(true);
    expect(at(5, 1)).toBe(true); // Friday night into Saturday
    expect(at(5, 3)).toBe(false);
    expect(at(6, 12)).toBe(false);
  });

  it('empties the whole week when one value cannot be read, and says which', () => {
    expect(normalizeGoogleHours({ ...GOOGLE, jueves: 'Con cita previa' })).toEqual({
      status: 'unreadable',
      hours: null,
      problems: [{ day: 'jueves', value: 'Con cita previa' }],
    });
    expect(normalizeGoogleHours({ lunes: 'Cerrado', feriados: 'Cerrado' }).status).toBe('unreadable');
  });

  it('reports no hours as empty and leaves English-keyed hours alone', () => {
    for (const nothing of [null, undefined, {}, [], 'lunes']) {
      expect(normalizeGoogleHours(nothing).status).toBe('empty');
    }
    for (const own of [{ mon: range('09:00', '17:00') }, { fri: ['09:00-19:00'] }]) {
      expect(normalizeGoogleHours(own).status).toBe('other');
    }
  });
});

describe('converting stored rows', () => {
  let raw: Sql;
  const STORED = { lunes: g('10 a.m.–1 p.m., 4–8 p.m.'), 'miércoles': 'Cerrado' };
  const CONVERTED = { mon: [range('10:00', '13:00'), range('16:00', '20:00')], wed: 'closed' };
  const UNREADABLE = { lunes: 'Con cita previa' };
  const LISTINGS: [string, string, Record<string, unknown>][] = [
    ['open', 'unclaimed', STORED],
    ['vague', 'unclaimed', UNREADABLE],
    ['edited', 'unclaimed', { mon: range('08:00', '12:00') }],
    ['taken', 'claimed', STORED],
    ['waiting', 'pending', STORED],
  ];

  beforeAll(() => {
    raw = makeTestSql();
  });
  afterAll(async () => {
    await raw.end();
  });
  afterEach(async () => {
    await resetDb(raw);
  });
  beforeEach(async () => {
    await resetDb(raw);
    const [au] = await raw`insert into auth_users (name, email) values ('D', 'd@example.com') returning id`;
    const [owner] = await raw`
      insert into user_profiles (auth_user_id, username) values (${au.id}, 'hours_owner') returning id`;
    for (const [externalId, claim, hours] of LISTINGS) {
      const [p] = await raw`
        insert into providers (owner_user_profile_id, provider_type, name, slug, status,
                               source, external_source, external_id, claim_status)
        values (${owner.id}, 'vet', ${externalId}, ${externalId}, 'published', 'serpapi_gmaps',
                'serpapi_gmaps', ${externalId}, ${claim})
        returning id`;
      await raw`
        insert into provider_locations (provider_id, name, hours_json, updated_at)
        values (${p.id}, ${externalId}, ${raw.json(hours as any)}, '2026-01-01T00:00:00Z')`;
    }
  });

  const stored = async () =>
    Object.fromEntries(
      (
        await raw`
          select p.external_id, l.hours_json, l.updated_at::text as updated_at
            from provider_locations l join providers p on p.id = l.provider_id`
      ).map((r) => [r.external_id, r]),
    );
  // As if every listing, claimed ones included, were offered for conversion.
  const plan = () =>
    planConversion(LISTINGS.map(([external_id, , hours]) => ({ external_id, name: external_id, hours })));

  it('plans only Google-format rows and lists the unreadable one', () => {
    const { changes, unreadable } = plan();
    expect(changes.map((c: { external_id: string }) => c.external_id).sort()).toEqual([
      'open', 'taken', 'vague', 'waiting',
    ]);
    expect(unreadable).toEqual([
      { external_id: 'vague', name: 'vague', problems: [{ day: 'lunes', value: 'Con cita previa' }] },
    ]);
  });

  it('writes unclaimed listings only, and nothing the second time', async () => {
    const before = await stored();
    const first = await runStatement(raw, NORMALIZE_SQL, plan().changes);
    expect(first).toEqual({ input_rows: 4, updated: 2, emptied: 1 });

    const after = await stored();
    expect(after.open.hours_json).toEqual(CONVERTED);
    expect(after.vague.hours_json).toBeNull();
    for (const untouched of ['edited', 'taken', 'waiting']) expect(after[untouched]).toEqual(before[untouched]);

    expect(await runStatement(raw, NORMALIZE_SQL, plan().changes)).toMatchObject({ updated: 0 });
    expect(await stored()).toEqual(after);
  });

  it('leaves a row whose hours changed since they were read', async () => {
    const { changes } = plan();
    await raw`
      update provider_locations set hours_json = ${raw.json({ lunes: 'Cerrado' })}
      where name = 'open'`;
    await runStatement(raw, NORMALIZE_SQL, changes);
    expect((await stored()).open.hours_json).toEqual({ lunes: 'Cerrado' });
  });

  it('does the same as a pasted SQL script', async () => {
    await raw.unsafe(toSqlScript(NORMALIZE_SQL, plan().changes));
    const after = await stored();
    expect(after.open.hours_json).toEqual(CONVERTED);
    expect(after.vague.hours_json).toBeNull();
    expect(after.taken.hours_json).toEqual(STORED);
  });
});
