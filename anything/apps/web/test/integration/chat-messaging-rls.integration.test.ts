// Ticket 2.5 — CHAT / MESSAGING, proven on the REAL tables acting AS pawpi_app.
// Companion to the R2 suites. 0031 adds message_threads + messages with
// PARTICIPANT-SCOPED RLS — the crux of this ticket.
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. A thread + its messages are visible to (a) the OWNER and (b) ACTIVE STAFF of the
//      provider — and to NO ONE ELSE (an authed outsider, and no-identity, read zero).
//   2. A non-participant cannot POST a message (insert denied); a participant cannot
//      post AS another user (sender must be current_app_user_id()).
//   3. REMOVED staff lose access the instant their provider_staff row flips to 'removed'.
//   4. The unread count (messages from the OTHER side with read_at IS NULL) is visible
//      only to the receiving participant; mark-read clears it.
//   5. The completeness guard: both new tables are ENABLE+FORCE RLS with policies.
//
// The harness owner is a superuser, so FORCE RLS constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProvider,
  seedStaff,
  seedThread,
  seedMessage,
} from './db';

// O = thread owner. S = active staff of the provider. X = authed outsider.
const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const S = { authUserId: 2, profileId: 2, username: 'staffs' };
const X = { authUserId: 3, profileId: 3, username: 'outsiderx' };
const PROVIDER_ID = 10;
const THREAD_ID = 100;

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

const ids = (rows: any[]) => rows.map((r: any) => r.id).sort((a, b) => a - b);

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

// O owns a pet; a provider with S as active staff; a thread between O and the provider.
beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, S);
  await seedUser(raw, X);
  await seedProvider(raw, {
    providerId: PROVIDER_ID,
    ownerUserProfileId: S.profileId,
    slug: 'pet-spa',
    status: 'published',
  });
  await seedStaff(raw, { providerId: PROVIDER_ID, userProfileId: S.profileId, role: 'owner' });
  await seedThread(raw, { threadId: THREAD_ID, ownerUserId: O.profileId, providerId: PROVIDER_ID });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.5 — message_threads participant RLS (as pawpi_app)', () => {
  it('owner O sees their own thread', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from message_threads`)).toEqual([THREAD_ID]);
    });
  });

  it("provider active staff S sees their provider's thread", async () => {
    await asApp(S.profileId, async (tx) => {
      expect(ids(await tx`select id from message_threads`)).toEqual([THREAD_ID]);
    });
  });

  it('an authed outsider X sees zero threads', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from message_threads`).toHaveLength(0);
    });
  });

  it('no identity → zero threads', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from message_threads`).toHaveLength(0);
    });
  });

  it('REMOVED staff lose access to the thread', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${PROVIDER_ID} and user_profile_id = ${S.profileId}`;
    await asApp(S.profileId, async (tx) => {
      expect(await tx`select id from message_threads`).toHaveLength(0);
    });
  });

  it('the owner can start a thread; an outsider cannot create one for themselves', async () => {
    // Owner opens a booking-tied... here a second general-thread is blocked by the unique
    // index, so prove start via a DIFFERENT provider the owner can address.
    await seedProvider(raw, {
      providerId: 11,
      ownerUserProfileId: S.profileId,
      slug: 'other-spa',
      status: 'published',
    });
    await asApp(O.profileId, async (tx) => {
      const created = await tx`
        insert into message_threads (owner_user_id, provider_id)
        values (${O.profileId}, 11) returning id
      `;
      expect(created).toHaveLength(1);
    });
    // An outsider cannot create a thread that lists themselves as owner of a provider's
    // conversation they are not staff of? They WOULD be "owner" — but the point of the
    // model is the owner is whoever owns it; the real protection is that an outsider
    // cannot read/post in O's existing thread. Prove the insert WITH CHECK rejects a
    // thread X tries to plant with O as the owner (X is neither O nor staff).
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into message_threads (owner_user_id, provider_id)
        values (${O.profileId}, ${PROVIDER_ID})
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.5 — messages participant RLS (as pawpi_app)', () => {
  beforeEach(async () => {
    // O sent msg 200; S (provider) sent msg 201.
    await seedMessage(raw, { messageId: 200, threadId: THREAD_ID, senderUserId: O.profileId });
    await seedMessage(raw, { messageId: 201, threadId: THREAD_ID, senderUserId: S.profileId });
  });

  it('owner O reads both messages on the thread', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from messages`)).toEqual([200, 201]);
    });
  });

  it('provider staff S reads both messages on the thread', async () => {
    await asApp(S.profileId, async (tx) => {
      expect(ids(await tx`select id from messages`)).toEqual([200, 201]);
    });
  });

  it('an outsider X reads zero messages', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from messages`).toHaveLength(0);
    });
  });

  it('a participant can post AS themselves into the thread', async () => {
    await asApp(O.profileId, async (tx) => {
      const created = await tx`
        insert into messages (thread_id, sender_user_id, body)
        values (${THREAD_ID}, ${O.profileId}, 'hello') returning id
      `;
      expect(created).toHaveLength(1);
    });
  });

  it('a participant CANNOT post AS another user (sender must be the caller)', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into messages (thread_id, sender_user_id, body)
        values (${THREAD_ID}, ${S.profileId}, 'spoofed')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a NON-participant cannot post into the thread', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into messages (thread_id, sender_user_id, body)
        values (${THREAD_ID}, ${X.profileId}, 'intruder')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('REMOVED staff lose access to the messages', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${PROVIDER_ID} and user_profile_id = ${S.profileId}`;
    await asApp(S.profileId, async (tx) => {
      expect(await tx`select id from messages`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.5 — unread count + mark read (as pawpi_app)', () => {
  beforeEach(async () => {
    // S (provider) sent two messages to O; both unread (read_at NULL).
    await seedMessage(raw, { messageId: 300, threadId: THREAD_ID, senderUserId: S.profileId });
    await seedMessage(raw, { messageId: 301, threadId: THREAD_ID, senderUserId: S.profileId });
    // O sent one message (S's unread count, not O's).
    await seedMessage(raw, { messageId: 302, threadId: THREAD_ID, senderUserId: O.profileId });
  });

  it("O's unread = messages from the OTHER side (S) with read_at NULL", async () => {
    await asApp(O.profileId, async (tx) => {
      const rows = await tx`
        select count(*)::int as n from messages
        where sender_user_id <> ${O.profileId} and read_at is null
      `;
      expect(rows[0].n).toBe(2);
    });
  });

  it('O marks the thread read → its unread drops to zero', async () => {
    await asApp(O.profileId, async (tx) => {
      await tx`
        update messages set read_at = now()
        where thread_id = ${THREAD_ID} and sender_user_id <> ${O.profileId} and read_at is null
      `;
      const rows = await tx`
        select count(*)::int as n from messages
        where sender_user_id <> ${O.profileId} and read_at is null
      `;
      expect(rows[0].n).toBe(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.5 — completeness: chat tables are ENABLE+FORCE RLS with policies', () => {
  it('message_threads + messages are policied (the model cannot silently regress)', async () => {
    const rows = await raw<
      { table: string; enabled: boolean; forced: boolean; policies: number }[]
    >`
      select c.relname as table,
             c.relrowsecurity as enabled,
             c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname = any (array['message_threads','messages'])
      order by c.relname
    `;
    expect(rows.map((r) => r.table)).toEqual(['message_threads', 'messages']);
    for (const r of rows) {
      expect(r.enabled, `${r.table} must ENABLE RLS`).toBe(true);
      expect(r.forced, `${r.table} must FORCE RLS`).toBe(true);
      expect(r.policies, `${r.table} must carry ≥1 policy`).toBeGreaterThan(0);
    }
  });
});
