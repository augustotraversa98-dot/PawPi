// Directory enrichment (0162 + supabase/seed/directory) — runs the REAL statements the seed scripts
// execute, against the migrated throwaway Postgres.
//
// What this proves:
//   1. Only listings still claim_status='unclaimed' are written; claimed and pending ones are left
//      exactly as they were (updated_at included).
//   2. Re-running adds nothing: existing bio / website / hours are kept, a service with the same
//      normalised name is skipped.
//   3. No logo_url or image_urls is ever written.
//   4. A price is stored only when the quoted site text is that exact peso amount.
//   5. The --sql script form does the same thing and cannot be broken out of by scraped text.
//   6. 0162: source defaults to 'owner' and rejects other values.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb } from './db';
import { runStatement, toSqlScript } from '../../../../../supabase/seed/directory/lib.mjs';
import {
  BACKFILL_SQL,
  websitePairs,
} from '../../../../../supabase/seed/directory/backfill_website_url.mjs';
import {
  ENRICH_SQL,
  cleanHours,
  normalizeRecord,
  priceCents,
} from '../../../../../supabase/seed/directory/load_enrichment.mjs';

const SITE = 'https://www.vet.example.com/';
let raw: Sql;
const ids: Record<string, number> = {};

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
  // 0124 creates the system directory profile at migration time, so it exists until the first reset.
  let [owner] = await raw`select id from user_profiles where username = 'pawpi_directory'`;
  if (!owner) {
    const [au] = await raw`
      insert into auth_users (name, email) values ('Directory', 'dir@example.com') returning id`;
    [owner] = await raw`
      insert into user_profiles (auth_user_id, username)
      values (${au.id}, 'pawpi_directory') returning id`;
  }
  for (const [ext, claim] of [
    ['open', 'unclaimed'],
    ['taken', 'claimed'],
    ['waiting', 'pending'],
  ]) {
    const [p] = await raw`
      insert into providers (owner_user_profile_id, provider_type, name, slug, status,
                             source, external_source, external_id, claim_status, updated_at)
      values (${owner.id}, 'vet', ${ext}, ${ext}, 'published', 'serpapi_gmaps', 'serpapi_gmaps',
              ${ext}, ${claim}, '2026-01-01T00:00:00Z')
      returning id`;
    await raw`insert into provider_locations (provider_id, name, updated_at)
              values (${p.id}, ${ext}, '2026-01-01T00:00:00Z')`;
    ids[ext] = p.id;
  }
});

// The marks tinyfish_enrich.py adds once it has found the text on the site.
const onSite = { name_on_site: true, description_on_site: true, price_text_on_site: true };

const record = (externalId: string, data: Record<string, unknown> = {}) => ({
  external_id: externalId,
  website_url: SITE,
  outcome: 'success',
  data: {
    bio: 'Clínica veterinaria de barrio con atención de lunes a sábado.',
    bio_on_site: true,
    logo_url: 'https://www.vet.example.com/logo.png',
    services: [
      {
        ...onSite,
        name: 'Consulta clínica',
        description: 'Atención general.',
        price_ars: 15000,
        price_text: '$15.000',
        source_url: `${SITE}servicios`,
        image_urls: ['https://www.vet.example.com/a.jpg'],
      },
      { ...onSite, name: 'consulta  CLINICA', source_url: SITE },
      { ...onSite, name: 'Cirugía', price_ars: 90000, price_text: 'desde $90.000', source_url: SITE },
    ],
    hours: { mon: [{ open: '9:00', close: '18:00' }], sun: 'closed' },
    ...data,
  },
});

const snapshot = async (externalId: string) => {
  const [row] = await raw`
    select p.bio, p.logo_url, p.website_url, p.updated_at::text as updated_at,
           l.hours_json, l.updated_at::text as loc_updated_at,
           (select count(*)::int from provider_services s where s.provider_id = p.id) as services
      from providers p join provider_locations l on l.provider_id = p.id
     where p.external_id = ${externalId}`;
  return row;
};

describe('enrichment load', () => {
  const rows = () => ['open', 'taken', 'waiting'].map((id) => normalizeRecord(record(id)));

  it('writes the unclaimed listing only, with no images and no unverified price', async () => {
    const taken = await snapshot('taken');
    const waiting = await snapshot('waiting');

    const result = await runStatement(raw, ENRICH_SQL, rows());
    expect(result).toMatchObject({
      input_providers: 3,
      still_unclaimed: 1,
      bios_written: 1,
      services_inserted: 2,
      services_with_price: 1,
      hours_written: 1,
    });

    expect(await snapshot('taken')).toEqual(taken);
    expect(await snapshot('waiting')).toEqual(waiting);

    const services = await raw`
      select name, price_cents, source, image_urls, duration_min, deposit_cents
        from provider_services where provider_id = ${ids.open} order by id`;
    expect([...services]).toEqual([
      { name: 'Consulta clínica', price_cents: 1500000, source: 'auto_enriched', image_urls: [], duration_min: null, deposit_cents: null },
      { name: 'Cirugía', price_cents: null, source: 'auto_enriched', image_urls: [], duration_min: null, deposit_cents: null },
    ]);
    const open = await snapshot('open');
    expect(open.logo_url).toBeNull();
    expect(open.bio).toContain('Clínica veterinaria');
    expect(open.hours_json).toEqual({ mon: { open: '09:00', close: '18:00' }, sun: 'closed' });
  });

  it('is idempotent, and never overwrites a bio or hours that already exist', async () => {
    await raw`update providers set bio = 'Existing' where id = ${ids.open}`;
    await raw`update provider_locations set hours_json = ${raw.json({ lunes: '10 a.m.–8 p.m.' })}
               where provider_id = ${ids.open}`;
    await raw`insert into provider_services (provider_id, name) values (${ids.open}, 'CIRUGIA')`;

    const first = await runStatement(raw, ENRICH_SQL, rows());
    expect(first).toMatchObject({ bios_written: 0, services_inserted: 1, hours_written: 0 });
    const second = await runStatement(raw, ENRICH_SQL, rows());
    expect(second).toMatchObject({ bios_written: 0, services_inserted: 0, hours_written: 0 });

    const open = await snapshot('open');
    expect(open.bio).toBe('Existing');
    expect(open.hours_json).toEqual({ lunes: '10 a.m.–8 p.m.' });
    expect(open.services).toBe(2);
  });

  it('writes nothing once the business has claimed the listing', async () => {
    await raw`update providers set claim_status = 'claimed' where id = ${ids.open}`;
    const before = await snapshot('open');
    const result = await runStatement(raw, ENRICH_SQL, rows());
    expect(result).toMatchObject({ still_unclaimed: 0, services_inserted: 0 });
    expect(await snapshot('open')).toEqual(before);
  });

  it('the --sql script form treats hostile scraped text as plain data', async () => {
    const hostile = "x'); drop table provider_services; -- $$ $j$ \\ ; commit;";
    const row = normalizeRecord(
      record('open', { services: [{ ...onSite, name: hostile, source_url: SITE }] }),
    );
    await raw.unsafe(toSqlScript(ENRICH_SQL, [row]));
    const [s] = await raw`select name from provider_services where provider_id = ${ids.open}`;
    expect(s.name).toBe(hostile);
  });
});

describe('website backfill', () => {
  it('fills only empty website_url on unclaimed serpapi listings, once', async () => {
    const csv = ['open', 'taken', 'waiting'].map((id) => ({
      external_source: 'serpapi_gmaps',
      external_id: id,
      website: SITE,
    }));
    csv.push({ external_source: 'osm', external_id: 'open', website: 'https://osm.example.com' });
    csv.push({ external_source: 'serpapi_gmaps', external_id: 'bad', website: 'javascript:alert(1)' });
    const pairs = websitePairs(csv);
    expect(pairs.map((p: { external_id: string }) => p.external_id)).toEqual(['open', 'taken', 'waiting']);

    const taken = await snapshot('taken');
    expect(await runStatement(raw, BACKFILL_SQL, pairs)).toEqual({ updated: 1 });
    expect(await runStatement(raw, BACKFILL_SQL, pairs)).toEqual({ updated: 0 });
    expect((await snapshot('open')).website_url).toBe(SITE);
    expect(await snapshot('taken')).toEqual(taken);
    expect((await snapshot('waiting')).website_url).toBeNull();
  });
});

describe('validation', () => {
  it('stores a price only when the quoted text is that exact peso amount', () => {
    expect(priceCents(15000, '$15.000')).toBe(1500000);
    expect(priceCents(1500.5, 'ARS 1.500,50')).toBe(150050);
    expect(priceCents(8000, '8000 pesos')).toBe(800000);
    expect(priceCents(15000, null)).toBeNull();
    expect(priceCents(15000, '$ 18.000')).toBeNull();
    expect(priceCents(15000, '15.000')).toBeNull();
    expect(priceCents(15000, 'desde $15.000')).toBeNull();
    expect(priceCents(15000, '$15.000 - $20.000')).toBeNull();
    expect(priceCents(50, 'US$ 50')).toBeNull();
    expect(priceCents(1.5, '$1,500')).toBeNull();
    expect(priceCents(0, '$0')).toBeNull();
  });

  it('drops a price with no source page, and a service read on another site', () => {
    const row = normalizeRecord(
      record('open', {
        services: [
          { ...onSite, name: 'Vacunación', price_ars: 9000, price_text: '$9.000' },
          { ...onSite, name: 'Ecografía', source_url: 'https://elsewhere.example.org/x' },
        ],
      }),
    );
    expect(row.services).toEqual([{ name: 'Vacunación', description: null, price_cents: null }]);
  });

  it('writes no text that was not found on the site', () => {
    const row = normalizeRecord(
      record('open', {
        bio_on_site: false,
        services: [
          { ...onSite, name: 'Invented', name_on_site: false, source_url: SITE },
          {
            ...onSite,
            name: 'Baño',
            description: 'A translated description.',
            description_on_site: false,
            price_ars: 9000,
            price_text: '$9.000',
            price_text_on_site: false,
            source_url: SITE,
          },
        ],
      }),
    );
    expect(row.bio).toBeNull();
    expect(row.services).toEqual([{ name: 'Baño', description: null, price_cents: null }]);
  });

  it('ignores unsuccessful reads and half-read hours', () => {
    expect(normalizeRecord({ ...record('open'), outcome: 'blocked' })).toBeNull();
    expect(cleanHours({ mon: [{ open: '9', close: '18:00' }] })).toBeNull();
    expect(cleanHours({ sun: 'closed' })).toBeNull();
  });

  it('0162: source defaults to owner and rejects anything else', async () => {
    const [s] = await raw`
      insert into provider_services (provider_id, name) values (${ids.open}, 'Baño') returning source`;
    expect(s.source).toBe('owner');
    await expect(
      raw`insert into provider_services (provider_id, name, source)
          values (${ids.open}, 'Otro', 'scraped')`,
    ).rejects.toThrow(/provider_services_source_check/);
  });
});
