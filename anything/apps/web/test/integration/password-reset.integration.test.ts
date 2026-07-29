// Password reset (migration 0069) — proven on the REAL tables acting AS pawpi_app.
// Companion to legal-consent / the RLS suites. Covers the self-service reset flow:
//   password_reset_tokens — FORCE RLS with NO owner read or write path. The requester is by
//                           definition logged OUT, so app.current_user_id is unset for the whole
//                           flow and no owner policy could ever be satisfied. The only writers are
//                           the two SECURITY DEFINER helpers; reads are admin-only, and only ever
//                           expose sha256 hashes.
//
// Pattern mirrors the sibling suites: a raw superuser client seeds; a second porsager client
// AS pawpi_app (NOBYPASSRLS) runs every assertion inside a per-tx identity stamp.
//
// The four behaviours the ticket calls out are the four `describe`s below: a valid unexpired token
// works ONCE, a second use fails, an expired token fails, and another user's account is untouched.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import crypto from 'node:crypto';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };   // resets
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };  // bystander
const C = { authUserId: 3, profileId: 3, username: 'ownerc', petId: 3, petName: 'Coco' };   // admin

const OLD_HASH_A = 'argon2:owner-a-old-password';
const OLD_HASH_B = 'argon2:owner-b-old-password';
const NEW_HASH_A = 'argon2:owner-a-new-password';

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

/** The route's hashing: the DB only ever sees sha256(raw token). */
const sha = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Mint a token through the DEFINER helper, exactly as the route does. Returns the raw token. */
async function issueToken(
  authUserId: number,
  { minutes = 30, token = crypto.randomBytes(32).toString('base64url') } = {},
): Promise<string> {
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  await asApp(null, (tx) => tx`
    select app_create_password_reset_token(${authUserId}, ${sha(token)}, ${expiresAt}, null, 'vitest')
  `);
  return token;
}

/** Consume through the DEFINER helper, as the route does. Returns the auth_users.id or null. */
async function consume(token: string, passwordHash: string): Promise<number | null> {
  const rows = await asApp(null, (tx) => tx<{ auth_user_id: number | null }[]>`
    select app_consume_password_reset_token(${sha(token)}, ${passwordHash}) as auth_user_id
  `);
  return rows[0]?.auth_user_id ?? null;
}

const passwordOf = async (authUserId: number) => {
  const rows = await raw<{ password: string | null }[]>`
    select password from auth_accounts where "userId" = ${authUserId} and provider = 'credentials'
  `;
  return rows[0]?.password ?? null;
};

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
    max: 1,
    onnotice: () => {},
  });
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedOwnerWithPet(raw, C);
  await raw`update user_profiles set role = 'admin' where id = ${C.profileId}`;

  // Credentials logins for A and B (what sign-up's linkAccount writes), plus a live session each.
  await raw`
    insert into auth_accounts ("userId", type, provider, "providerAccountId", password)
    values (${A.authUserId}, 'credentials', 'credentials', ${String(A.authUserId)}, ${OLD_HASH_A}),
           (${B.authUserId}, 'credentials', 'credentials', ${String(B.authUserId)}, ${OLD_HASH_B})
  `;
  await raw`
    insert into auth_sessions ("userId", expires, "sessionToken")
    values (${A.authUserId}, now() + interval '30 days', 'session-a'),
           (${B.authUserId}, now() + interval '30 days', 'session-b')
  `;
});

// ──────────────────────────────────────────────────────────────────────────────
describe('password reset — a valid unexpired token works', () => {
  it('issues a token with NO app.current_user_id set (the locked-out case)', async () => {
    const token = await issueToken(A.authUserId);
    const rows = await raw`select * from password_reset_tokens where auth_user_id = ${A.authUserId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].used_at).toBeNull();
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    // The raw token is NEVER stored — only its hash.
    expect(rows[0].token_hash).toBe(sha(token));
    expect(rows[0].token_hash).not.toBe(token);
  });

  it('consuming it returns the account and writes the new password hash', async () => {
    const token = await issueToken(A.authUserId);
    expect(await passwordOf(A.authUserId)).toBe(OLD_HASH_A);

    expect(await consume(token, NEW_HASH_A)).toBe(A.authUserId);
    expect(await passwordOf(A.authUserId)).toBe(NEW_HASH_A);
  });

  it('burns the token it consumed', async () => {
    const token = await issueToken(A.authUserId);
    await consume(token, NEW_HASH_A);
    const [row] = await raw`select used_at from password_reset_tokens where token_hash = ${sha(token)}`;
    expect(row.used_at).not.toBeNull();
  });

  it('clears the account’s DB sessions', async () => {
    const token = await issueToken(A.authUserId);
    await consume(token, NEW_HASH_A);
    const rows = await raw`select id from auth_sessions where "userId" = ${A.authUserId}`;
    expect(rows).toHaveLength(0);
  });

  // Social-sign-in accounts (ticket 2.46) have no credentials row. Proving control of the mailbox
  // is the same trust level sign-up uses, so the helper creates one rather than silently no-oping.
  it('creates a credentials login for an account that had none (social sign-in only)', async () => {
    await raw`delete from auth_accounts where "userId" = ${A.authUserId}`;
    const token = await issueToken(A.authUserId);

    expect(await consume(token, NEW_HASH_A)).toBe(A.authUserId);
    const rows = await raw`
      select provider, type, password from auth_accounts where "userId" = ${A.authUserId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('credentials');
    expect(rows[0].password).toBe(NEW_HASH_A);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('password reset — a token works ONCE', () => {
  it('a second use of the same token fails and does not change the password again', async () => {
    const token = await issueToken(A.authUserId);
    expect(await consume(token, NEW_HASH_A)).toBe(A.authUserId);

    expect(await consume(token, 'argon2:attacker-password')).toBeNull();
    expect(await passwordOf(A.authUserId)).toBe(NEW_HASH_A);
  });

  it('consuming one token also burns the account’s OTHER outstanding tokens', async () => {
    const first = await issueToken(A.authUserId);
    const second = await issueToken(A.authUserId);

    expect(await consume(second, NEW_HASH_A)).toBe(A.authUserId);
    // The older link — which someone else may have requested — is dead too.
    expect(await consume(first, 'argon2:attacker-password')).toBeNull();
    expect(await passwordOf(A.authUserId)).toBe(NEW_HASH_A);

    const rows = await raw`
      select used_at from password_reset_tokens where auth_user_id = ${A.authUserId}
    `;
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.used_at !== null)).toBe(true);
  });

  it('an unknown token hash fails', async () => {
    expect(await consume('never-issued', NEW_HASH_A)).toBeNull();
    expect(await passwordOf(A.authUserId)).toBe(OLD_HASH_A);
  });

  it('throttles at 5 tokens per account per hour (returns null, never raises)', async () => {
    for (let i = 0; i < 5; i += 1) await issueToken(A.authUserId);
    const sixth = await asApp(null, (tx) => tx<{ id: string | null }[]>`
      select app_create_password_reset_token(
        ${A.authUserId}, ${sha('one-too-many')}, ${new Date(Date.now() + 60_000).toISOString()}, null, 'vitest'
      ) as id
    `);
    expect(sixth[0].id).toBeNull();
    const [{ n }] = await raw`
      select count(*)::int as n from password_reset_tokens where auth_user_id = ${A.authUserId}
    `;
    expect(n).toBe(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('password reset — an expired token fails', () => {
  it('a token past its expiry cannot be consumed', async () => {
    const token = await issueToken(A.authUserId, { minutes: -1 });
    expect(await consume(token, NEW_HASH_A)).toBeNull();
    expect(await passwordOf(A.authUserId)).toBe(OLD_HASH_A);
  });

  it('an expired token stays UNUSED (it was rejected, not burned) and sessions survive', async () => {
    const token = await issueToken(A.authUserId, { minutes: -1 });
    await consume(token, NEW_HASH_A);
    const [row] = await raw`select used_at from password_reset_tokens where token_hash = ${sha(token)}`;
    expect(row.used_at).toBeNull();
    const sessions = await raw`select id from auth_sessions where "userId" = ${A.authUserId}`;
    expect(sessions).toHaveLength(1);
  });

  it('an expired token does not block a fresh one', async () => {
    await issueToken(A.authUserId, { minutes: -1 });
    const fresh = await issueToken(A.authUserId);
    expect(await consume(fresh, NEW_HASH_A)).toBe(A.authUserId);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('password reset — no other account is touched', () => {
  it('B’s password and session survive A’s reset intact', async () => {
    const token = await issueToken(A.authUserId);
    await consume(token, NEW_HASH_A);

    expect(await passwordOf(B.authUserId)).toBe(OLD_HASH_B);
    const sessions = await raw`select "sessionToken" from auth_sessions where "userId" = ${B.authUserId}`;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionToken).toBe('session-b');
  });

  it('B’s own outstanding token survives A’s reset (the sweep is per-account)', async () => {
    const tokenB = await issueToken(B.authUserId);
    const tokenA = await issueToken(A.authUserId);

    await consume(tokenA, NEW_HASH_A);
    // B's link still works afterwards.
    expect(await consume(tokenB, 'argon2:owner-b-new-password')).toBe(B.authUserId);
    expect(await passwordOf(B.authUserId)).toBe('argon2:owner-b-new-password');
  });

  it('a token issued for B can never reset A (the account comes from the token row)', async () => {
    const tokenB = await issueToken(B.authUserId);
    expect(await consume(tokenB, 'argon2:redirected')).toBe(B.authUserId);
    expect(await passwordOf(A.authUserId)).toBe(OLD_HASH_A);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('password reset — direct pawpi_app access is denied by RLS', () => {
  it('a direct INSERT is rejected with no identity in scope (no insert policy)', async () => {
    await expect(
      asApp(null, (tx) => tx`
        insert into password_reset_tokens (auth_user_id, token_hash, expires_at)
        values (${A.authUserId}, ${sha('forged')}, now() + interval '1 hour')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a direct INSERT is rejected even WITH an identity in scope', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into password_reset_tokens (auth_user_id, token_hash, expires_at)
        values (${A.authUserId}, ${sha('forged')}, now() + interval '1 hour')
      `),
    ).rejects.toThrow(/row-level security/i);
    const [{ n }] = await raw`select count(*)::int as n from password_reset_tokens`;
    expect(n).toBe(0);
  });

  // The one that matters most: a logged-in attacker must not be able to read a pending reset for
  // someone else (or for themselves) and redeem it.
  it('a logged-in NON-admin sees ZERO token rows even though rows exist', async () => {
    await issueToken(A.authUserId);
    const [{ n }] = await raw`select count(*)::int as n from password_reset_tokens`;
    expect(n).toBe(1);

    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id, token_hash from password_reset_tokens`).toHaveLength(0);
    });
    // Not even the account's OWN owner can read it off a session.
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select id from password_reset_tokens`).toHaveLength(0);
    });
    await asApp(null, async (tx) => {
      expect(await tx`select id from password_reset_tokens`).toHaveLength(0);
    });
  });

  it('an UPDATE cannot un-burn a used token', async () => {
    const token = await issueToken(A.authUserId);
    await consume(token, NEW_HASH_A);
    const affected = await asApp(B.profileId, (tx) => tx`
      update password_reset_tokens set used_at = null where token_hash = ${sha(token)}
    `);
    expect(affected.count).toBe(0);
    const [row] = await raw`select used_at from password_reset_tokens where token_hash = ${sha(token)}`;
    expect(row.used_at).not.toBeNull();
  });

  it('an ADMIN SELECT can read the ledger (hashes only)', async () => {
    await issueToken(A.authUserId);
    await asApp(C.profileId, async (tx) => {
      const rows = await tx<{ token_hash: string }[]>`select token_hash from password_reset_tokens`;
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// The Postgres-level claim the forgot-password route's response-uniformity depends on. Without a
// savepoint, one failed query aborts the whole request transaction: the handler's own clean
// Response is discarded because the implicit COMMIT then fails, and withRequestContext answers 500.
// Since the token-minting step only runs for accounts that EXIST, that 500 would have been a
// working account-existence oracle. These two tests prove the difference is real, not assumed.
describe('password reset — a savepoint keeps a poisoned transaction committable', () => {
  it('WITHOUT a savepoint, one failed query poisons the rest of the transaction', async () => {
    // The caller "handles" the error and even returns a value — and the whole begin() still
    // rejects, which is exactly how withRequestContext ends up answering 500 over the top of a
    // handler that had already decided on a clean response.
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.current_user_id', '', true)`;
        await tx`select this_function_does_not_exist()`.catch(() => {});
        return tx`select 1 as ok`.catch(() => 'handled');
      }),
    ).rejects.toThrow();
  });

  it('WITH a savepoint, the same failure rolls back only that far and the tx commits', async () => {
    const rows = await app.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', '', true)`;
      await tx
        .savepoint((sp: Sql) => sp`select this_function_does_not_exist()`)
        .catch(() => {});
      return tx<{ ok: number }[]>`select 1 as ok`;
    });
    expect(rows[0].ok).toBe(1);
  });

  // Why withSavepoint calls runWithTx(sp, fn) instead of just tx.savepoint(() => fn()): opening a
  // savepoint is not enough — the failing query has to be ISSUED ON IT. Run it on the outer handle
  // and the rollback doesn't recover the connection, which is precisely the bug this suite caught
  // (the route was still answering 500 with the savepoint "in place").
  it('a savepoint does NOT help if the query is issued on the OUTER handle', async () => {
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.current_user_id', '', true)`;
        await tx
          .savepoint(() => tx`select this_function_does_not_exist()`)
          .catch(() => {});
        return tx`select 1 as ok`.catch(() => 'handled');
      }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('password reset — completeness: password_reset_tokens is FORCE-RLS with a policy', () => {
  it('is ENABLE+FORCE RLS with exactly the admin SELECT policy', async () => {
    const rows = await raw<{ enabled: boolean; forced: boolean; policies: number }[]>`
      select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p
               where p.schemaname='public' and p.tablename='password_reset_tokens')::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname='password_reset_tokens'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
    expect(rows[0].forced).toBe(true);
    expect(rows[0].policies).toBe(1);
  });

  it('both helpers are SECURITY DEFINER with a pinned search_path', async () => {
    const rows = await raw<{ proname: string; prosecdef: boolean; proconfig: string[] | null }[]>`
      select proname, prosecdef, proconfig
      from pg_proc
      where proname in ('app_create_password_reset_token', 'app_consume_password_reset_token')
        and pronamespace = (select oid from pg_namespace where nspname = 'public')
      order by proname
    `;
    expect(rows).toHaveLength(2);
    for (const fn of rows) {
      expect(fn.prosecdef, `${fn.proname} must be SECURITY DEFINER`).toBe(true);
      expect(fn.proconfig?.join(','), `${fn.proname} must pin search_path`).toContain('search_path=');
    }
  });
});
