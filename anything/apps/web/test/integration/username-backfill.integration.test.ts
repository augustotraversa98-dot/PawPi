// Migration 0133 — username backfill (night run #2, PR D). Seeds e-mail-derived usernames the old
// code produced, re-runs the migration file against them (the harness already applied it to the empty
// DB), and proves: only e-mail-derived rows change, replacements come from the display/pet name, are
// unique case-insensitively against usernames AND pet handles and reserved words, system accounts and
// neutral usernames are untouched, ids/relationships survive, re-running is a no-op, and verify_0133
// reads all-PASS.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, MIGRATIONS_DIR } from './db';

let raw: Sql;
const MIGRATION = () => readFileSync(join(MIGRATIONS_DIR, '0133_username_backfill.sql'), 'utf8');
const VERIFY = () => readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0133.sql'), 'utf8');

async function user(id: number, email: string, username: string | null, fullName: string | null = null) {
  await raw`insert into auth_users (id, name, email) values (${id}, ${fullName ?? 'x'}, ${email})`;
  await raw`insert into user_profiles (id, auth_user_id, full_name, username) values (${id}, ${id}, ${fullName}, ${username})`;
}
const nameOf = async (id: number) => (await raw`select username from user_profiles where id = ${id}`)[0].username as string;

beforeAll(() => {
  raw = makeTestSql();
});
afterAll(async () => {
  await raw.end();
});
afterEach(async () => {
  await resetDb(raw);
});

describe('0133 username backfill', () => {
  it('folds accents in display names (UTF8 databases, i.e. Supabase)', async (ctx) => {
    const [{ server_encoding }] = await raw`show server_encoding`;
    if (server_encoding !== 'UTF8') return ctx.skip(); // the harness cluster may be SQL_ASCII on some CI locales
    await user(1, 'maria@x.com', 'maria', 'María López');
    await raw.unsafe(MIGRATION());
    expect(await nameOf(1)).toBe('marialopez');
  });

  it('rewrites only e-mail-derived usernames, from the display name, and leaves everything else alone', async () => {
    await user(1, 'augusto+demo2@pawpi.info', 'augusto+demo2', 'Augusto Traversa'); // contains + (and == local)
    await user(2, 'maria.lopez@gmail.com', 'maria.lopez', 'Maria Lopez'); // == local part
    await user(3, 'maria.lopez@yahoo.com', 'maria.lopez_4821', 'Maria Lopez'); // local + _NNNN
    await user(4, 'jo@x.com', 'jo_1760000000000', null); // local + timestamp, no name
    await user(5, 'pat@x.com', 'luna_lover', 'Pat'); // a chosen/neutral username: NOT e-mail-derived
    await user(6, 'who@x.com', 'pawpi_ab12cd', null); // already neutral
    await user(7, 'welcome@pawpi.system', 'pawpi_welcome', 'PawPi Welcome'); // system
    await user(8, 'raw@mail.com', 'someone@mail.com', 'Sam'); // contains @

    await raw.unsafe(MIGRATION());

    expect(await nameOf(1)).toBe('augustotraversa');
    expect(await nameOf(2)).toBe('marialopez');
    expect(await nameOf(3)).toBe('marialopez2'); // collides with #2 -> deterministic numeric variant
    expect((await nameOf(4)).startsWith('pawpi_')).toBe(true); // no name, no pet -> random neutral
    expect(await nameOf(5)).toBe('luna_lover');
    expect(await nameOf(6)).toBe('pawpi_ab12cd');
    expect(await nameOf(7)).toBe('pawpi_welcome');
    expect(await nameOf(8)).toBe('sam');

    // none of the new names looks like an e-mail
    const all = await raw`select username from user_profiles`;
    for (const { username } of all) expect(username).not.toMatch(/[@+]/);
  });

  it('uses the first pet name when there is no display name, and never collides with usernames, pet handles or reserved words', async () => {
    await user(1, 'a@x.com', 'a', null);
    await raw`insert into pets (id, owner_user_id, name, handle) values (1, 1, 'Admin', 'adminpup')`; // pet name is a reserved word
    await user(2, 'b@x.com', 'b+tag', 'Bella Rose');
    await user(3, 'c@x.com', 'bellarose', null); // an existing, neutral-looking username (c@x.com local = 'c')
    await user(4, 'd@x.com', 'd', 'Rosie');
    await raw`insert into pets (id, owner_user_id, name, handle) values (2, 4, 'Rosie', 'rosie')`; // a pet already holds the handle

    await raw.unsafe(MIGRATION());

    const u1 = await nameOf(1);
    expect(u1).not.toBe('admin'); // reserved -> not chosen
    expect(u1.startsWith('pawpi_') || /^admin\d+$/.test(u1)).toBe(true);
    expect(await nameOf(2)).toBe('bellarose2'); // 'bellarose' belongs to user 3
    expect(await nameOf(4)).toBe('rosie2'); // pet handle 'rosie' blocks the plain name
    expect(await nameOf(3)).toBe('bellarose'); // untouched (not e-mail-derived)

    const dups = await raw`select lower(username) from user_profiles group by 1 having count(*) > 1`;
    expect(dups).toHaveLength(0);
  });

  it('is idempotent: a second run changes nothing and adds no audit rows', async () => {
    await user(1, 'zed+one@x.com', 'zed+one', 'Zed');
    await user(2, 'zed@x.com', 'zed', 'Zed'); // == local part; wants 'zed' but the replacement must not look e-mail-derived
    await raw.unsafe(MIGRATION());
    const first = await raw`select id, username from user_profiles order by id`;
    const auditFirst = await raw`select count(*)::int as n from user_profile_username_backfill_audit`;
    await raw.unsafe(MIGRATION());
    const second = await raw`select id, username from user_profiles order by id`;
    const auditSecond = await raw`select count(*)::int as n from user_profile_username_backfill_audit`;
    expect(second).toEqual(first);
    expect(auditSecond[0].n).toBe(auditFirst[0].n);
    expect(first.map((r) => r.username)).not.toContain('zed'); // user 2's replacement can't be its own e-mail local
  });

  it('keeps ids and relationships intact and records old -> new in the audit table', async () => {
    await user(1, 'e1@x.com', 'e1', 'Ana');
    await user(2, 'e2@x.com', 'e2+x', 'Beto');
    await raw`insert into pets (id, owner_user_id, name, handle) values (1, 1, 'Rex', 'rex'), (2, 2, 'Bo', 'bo99')`;
    await raw`insert into pet_follows (follower_pet_id, followed_pet_id) values (1, 2), (2, 1)`;
    const profilesBefore = (await raw`select count(*)::int as n from user_profiles`)[0].n;

    await raw.unsafe(MIGRATION());

    expect((await raw`select count(*)::int as n from user_profiles`)[0].n).toBe(profilesBefore);
    expect(await raw`select 1 from pet_follows`).toHaveLength(2);
    const audit = await raw`select user_id, old_username, new_username from user_profile_username_backfill_audit order by user_id`;
    expect(audit.map((a) => [a.user_id, a.old_username, a.new_username])).toEqual([
      [1, 'e1', 'ana'],
      [2, 'e2+x', 'beto'],
    ]);
  });

  it('the audit table is owner-readable only and not writable by the app role (RLS forced)', async () => {
    await user(1, 'e1@x.com', 'e1', 'Ana');
    await user(2, 'e2@x.com', 'e2', 'Beto');
    await raw.unsafe(MIGRATION());
    const rows = await raw.begin(async (tx) => {
      await tx`set local role pawpi_app`;
      await tx`select set_config('app.current_user_id', '1', true)`;
      const mine = await tx`select user_id from user_profile_username_backfill_audit`;
      let wrote = true;
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into user_profile_username_backfill_audit (user_id, old_username, new_username) values (1, 'x', 'y')`;
        });
      } catch {
        wrote = false;
      }
      return { mine, wrote };
    });
    expect(rows.mine.map((r: any) => r.user_id)).toEqual([1]); // only my own row
    expect(rows.wrote).toBe(false);
  });

  it('verify_0133.sql reads PASS on every row after the backfill', async () => {
    await user(1, 'a+b@x.com', 'a+b', 'Ana Ruiz');
    await user(2, 'c@x.com', 'c_77', null);
    await raw.unsafe(MIGRATION());
    const rows = await raw.unsafe(VERIFY());
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const r of rows) expect(r.status, r.check_name).toBe('PASS');
  });

  it('is a no-op on an empty database (what the harness / a fresh environment sees)', async () => {
    await raw.unsafe(MIGRATION());
    expect((await raw`select count(*)::int as n from user_profile_username_backfill_audit`)[0].n).toBe(0);
  });
});
