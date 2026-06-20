// UGC Moderation T1 (migration 0065) — proven on the REAL tables acting AS pawpi_app.
// Companion to the RLS suites. Covers the Guideline 1.2 moderation primitives:
//   content_reports — reporter reads/writes ONLY their own rows (cross-user denied);
//   user_blocks     — blocker reads/writes/soft-deletes ONLY their own; live-pair unique;
//   hidden_at / banned_at — written ONLY by the admin SECURITY DEFINER helpers, which are
//                    app_is_admin()-gated (non-admin → exception); a hide flips open reports
//                    to 'actioned'; app_user_is_blocked is symmetric.
//
// Pattern mirrors rls-gap-closure: a raw superuser client seeds; a second porsager client
// AS pawpi_app (NOBYPASSRLS) runs every assertion inside a per-tx identity stamp.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedPost } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };   // author
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };  // reporter / blocker
const C = { authUserId: 3, profileId: 3, username: 'ownerc', petId: 3, petName: 'Coco' };   // admin
const D = { authUserId: 4, profileId: 4, username: 'ownerd', petId: 4, petName: 'Duke' };   // unrelated
const POST_ID = 10;

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

beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedOwnerWithPet(raw, C);
  await seedOwnerWithPet(raw, D);
  await raw`update user_profiles set role = 'admin' where id = ${C.profileId}`;
  await seedPost(raw, { postId: POST_ID, userId: A.profileId, petId: A.petId });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('UGC T1 — content_reports (as pawpi_app)', () => {
  it('a reporter (B) inserts their OWN report; reporter is pinned to B', async () => {
    const created = await asApp(B.profileId, (tx) => tx`
      insert into content_reports (reporter_user_id, target_type, target_id, reason, details)
      values (${B.profileId}, 'post', ${POST_ID}, 'spam', 'looks like spam')
      returning id, reporter_user_id, status
    `);
    expect(created).toHaveLength(1);
    expect(created[0].reporter_user_id).toBe(B.profileId);
    expect(created[0].status).toBe('open');
  });

  it('B cannot forge a report attributed to ANOTHER reporter (A) — WITH CHECK reject', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into content_reports (reporter_user_id, target_type, target_id, reason)
        values (${A.profileId}, 'post', ${POST_ID}, 'spam')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a bad target_type is rejected by the CHECK', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into content_reports (reporter_user_id, target_type, target_id)
        values (${B.profileId}, 'not_a_type', ${POST_ID})
      `),
    ).rejects.toThrow(/content_reports_target_type_check/i);
  });

  it('the reporter reads ONLY their own reports; a different user sees ZERO', async () => {
    await asApp(B.profileId, (tx) => tx`
      insert into content_reports (reporter_user_id, target_type, target_id, reason)
      values (${B.profileId}, 'post', ${POST_ID}, 'spam')
    `);
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from content_reports`).toHaveLength(1);
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select id from content_reports`).toHaveLength(0);
    });
  });

  it('no identity → INSERT reject and SELECT zero (deny-by-default)', async () => {
    await expect(
      asApp(null, (tx) => tx`
        insert into content_reports (reporter_user_id, target_type, target_id)
        values (${B.profileId}, 'post', ${POST_ID})
      `),
    ).rejects.toThrow(/row-level security/i);
    await asApp(null, async (tx) => {
      expect(await tx`select id from content_reports`).toHaveLength(0);
    });
  });

  it('a non-admin pawpi_app cannot directly UPDATE report status (no policy → 0 rows)', async () => {
    await asApp(B.profileId, (tx) => tx`
      insert into content_reports (reporter_user_id, target_type, target_id, reason)
      values (${B.profileId}, 'post', ${POST_ID}, 'spam')
    `);
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update content_reports set status = 'dismissed' returning id`).toHaveLength(0);
    });
    const [{ status }] = await raw`select status from content_reports limit 1`;
    expect(status).toBe('open');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('UGC T1 — user_blocks (as pawpi_app)', () => {
  it('A blocks B; the row is pinned to blocker A', async () => {
    const created = await asApp(A.profileId, (tx) => tx`
      insert into user_blocks (blocker_user_id, blocked_user_id)
      values (${A.profileId}, ${B.profileId})
      returning id, blocker_user_id, blocked_user_id
    `);
    expect(created).toHaveLength(1);
    expect(created[0].blocker_user_id).toBe(A.profileId);
    expect(created[0].blocked_user_id).toBe(B.profileId);
  });

  it('A cannot forge a block attributed to ANOTHER blocker (B) — WITH CHECK reject', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into user_blocks (blocker_user_id, blocked_user_id)
        values (${B.profileId}, ${A.profileId})
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('self-block is rejected by the CHECK', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into user_blocks (blocker_user_id, blocked_user_id)
        values (${A.profileId}, ${A.profileId})
      `),
    ).rejects.toThrow(/user_blocks_not_self/i);
  });

  it('blocker reads own blocks; the blocked user does NOT see the block', async () => {
    await asApp(A.profileId, (tx) => tx`
      insert into user_blocks (blocker_user_id, blocked_user_id)
      values (${A.profileId}, ${B.profileId})
    `);
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select id from user_blocks`).toHaveLength(1);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from user_blocks`).toHaveLength(0);
    });
  });

  it('a second LIVE block of the same pair violates the partial-unique index', async () => {
    await asApp(A.profileId, (tx) => tx`
      insert into user_blocks (blocker_user_id, blocked_user_id) values (${A.profileId}, ${B.profileId})
    `);
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into user_blocks (blocker_user_id, blocked_user_id) values (${A.profileId}, ${B.profileId})
      `),
    ).rejects.toThrow(/idx_user_blocks_live_pair|duplicate key/i);
  });

  it('unblock = soft-delete by the blocker; a re-block is then allowed', async () => {
    const [{ id }] = await asApp(A.profileId, (tx) => tx`
      insert into user_blocks (blocker_user_id, blocked_user_id)
      values (${A.profileId}, ${B.profileId}) returning id
    `);
    // blocker soft-deletes (unblock)
    await asApp(A.profileId, async (tx) => {
      expect(await tx`update user_blocks set deleted_at = now() where id = ${id} returning id`).toHaveLength(1);
    });
    // the pair is now free → re-block succeeds
    const reblock = await asApp(A.profileId, (tx) => tx`
      insert into user_blocks (blocker_user_id, blocked_user_id)
      values (${A.profileId}, ${B.profileId}) returning id
    `);
    expect(reblock).toHaveLength(1);
  });

  it('a non-blocker (B) cannot UPDATE/DELETE A\'s block (0 rows)', async () => {
    await asApp(A.profileId, (tx) => tx`
      insert into user_blocks (blocker_user_id, blocked_user_id) values (${A.profileId}, ${B.profileId})
    `);
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update user_blocks set deleted_at = now() returning id`).toHaveLength(0);
      expect(await tx`delete from user_blocks returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from user_blocks where deleted_at is null`;
    expect(n).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('UGC T1 — app_user_is_blocked (symmetric read helper)', () => {
  it('returns true in BOTH directions for a live block; false for an unrelated pair', async () => {
    await raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${A.profileId}, ${B.profileId})`;
    await asApp(A.profileId, async (tx) => {
      const [{ ab }] = await tx`select app_user_is_blocked(${A.profileId}, ${B.profileId}) as ab`;
      const [{ ba }] = await tx`select app_user_is_blocked(${B.profileId}, ${A.profileId}) as ba`;
      const [{ ad }] = await tx`select app_user_is_blocked(${A.profileId}, ${D.profileId}) as ad`;
      expect(ab).toBe(true);
      expect(ba).toBe(true);
      expect(ad).toBe(false);
    });
  });

  it('a soft-deleted (unblocked) block no longer counts', async () => {
    await raw`insert into user_blocks (blocker_user_id, blocked_user_id, deleted_at) values (${A.profileId}, ${B.profileId}, now())`;
    await asApp(A.profileId, async (tx) => {
      const [{ ab }] = await tx`select app_user_is_blocked(${A.profileId}, ${B.profileId}) as ab`;
      expect(ab).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('UGC T1 — moderation helpers are admin-gated (DEFINER)', () => {
  it('a non-admin (B) calling app_moderate_hide is rejected; the post stays visible', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`select app_moderate_hide('post', ${POST_ID})`),
    ).rejects.toThrow(/not authorized/i);
    const [{ hidden_at }] = await raw`select hidden_at from posts where id = ${POST_ID}`;
    expect(hidden_at).toBeNull();
  });

  it('an admin (C) hides the post: hidden_at is set AND open reports flip to actioned', async () => {
    await asApp(B.profileId, (tx) => tx`
      insert into content_reports (reporter_user_id, target_type, target_id, reason)
      values (${B.profileId}, 'post', ${POST_ID}, 'harassment')
    `);
    const [{ app_moderate_hide: n }] = await asApp(C.profileId, (tx) =>
      tx`select app_moderate_hide('post', ${POST_ID})`,
    );
    expect(n).toBe(1);
    const [{ hidden_at }] = await raw`select hidden_at from posts where id = ${POST_ID}`;
    expect(hidden_at).not.toBeNull();
    const [{ status }] = await raw`select status from content_reports where target_id = ${POST_ID} limit 1`;
    expect(status).toBe('actioned');
  });

  it('an admin (C) can unhide (clear hidden_at)', async () => {
    await asApp(C.profileId, (tx) => tx`select app_moderate_hide('post', ${POST_ID})`);
    const [{ app_moderate_unhide: n }] = await asApp(C.profileId, (tx) =>
      tx`select app_moderate_unhide('post', ${POST_ID})`,
    );
    expect(n).toBe(1);
    const [{ hidden_at }] = await raw`select hidden_at from posts where id = ${POST_ID}`;
    expect(hidden_at).toBeNull();
  });

  it('a non-author, non-admin cannot directly set hidden_at on a post (author-only UPDATE → 0 rows)', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update posts set hidden_at = now() where id = ${POST_ID} returning id`).toHaveLength(0);
    });
    const [{ hidden_at }] = await raw`select hidden_at from posts where id = ${POST_ID}`;
    expect(hidden_at).toBeNull();
  });

  it('app_ban_user: non-admin rejected; admin sets banned_at', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`select app_ban_user(${A.profileId})`),
    ).rejects.toThrow(/not authorized/i);
    await asApp(C.profileId, (tx) => tx`select app_ban_user(${B.profileId})`);
    const [{ banned_at }] = await raw`select banned_at from user_profiles where id = ${B.profileId}`;
    expect(banned_at).not.toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// T2 admin-queue DEFINER helpers (extends 0065). Under pawpi_app + FORCE RLS the admin can't
// read other users' reports or change status directly — these helpers are the RLS-correct path.
describe('UGC T2 — admin queue helpers (app_admin_list_reports / app_admin_action_report)', () => {
  beforeEach(async () => {
    await raw`
      insert into content_reports (id, reporter_user_id, target_type, target_id, reason)
      values (100, ${B.profileId}, 'post', ${POST_ID}, 'harassment')
    `;
  });

  it('admin (C) lists the open queue via the DEFINER; a non-admin (B) gets nothing', async () => {
    await asApp(C.profileId, async (tx) => {
      const rows = await tx`select id from app_admin_list_reports('open')`;
      expect(ids(rows)).toEqual([100]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from app_admin_list_reports('open')`).toHaveLength(0);
    });
  });

  it("admin 'hide' action hides the post and flips the report to actioned", async () => {
    await asApp(C.profileId, (tx) => tx`select app_admin_action_report(100, 'hide', false)`);
    const [{ hidden_at }] = await raw`select hidden_at from posts where id = ${POST_ID}`;
    expect(hidden_at).not.toBeNull();
    const [{ status }] = await raw`select status from content_reports where id = 100`;
    expect(status).toBe('actioned');
  });

  it("admin 'dismiss' closes the report without hiding the post", async () => {
    await asApp(C.profileId, (tx) => tx`select app_admin_action_report(100, 'dismiss', false)`);
    const [{ status }] = await raw`select status from content_reports where id = 100`;
    expect(status).toBe('dismissed');
    const [{ hidden_at }] = await raw`select hidden_at from posts where id = ${POST_ID}`;
    expect(hidden_at).toBeNull();
  });

  it("admin 'remove' + ban hides the post AND bans the content author (A)", async () => {
    await asApp(C.profileId, (tx) => tx`select app_admin_action_report(100, 'remove', true)`);
    const [{ hidden_at }] = await raw`select hidden_at from posts where id = ${POST_ID}`;
    expect(hidden_at).not.toBeNull();
    const [{ banned_at }] = await raw`select banned_at from user_profiles where id = ${A.profileId}`;
    expect(banned_at).not.toBeNull();
  });

  it('a non-admin (B) calling app_admin_action_report is rejected', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`select app_admin_action_report(100, 'hide', false)`),
    ).rejects.toThrow(/not authorized/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('UGC T1 — completeness: the two new tables are FORCE-RLS with policies', () => {
  it('content_reports and user_blocks are ENABLE+FORCE RLS with >=1 policy each', async () => {
    const rows = await raw<{ table: string; enabled: boolean; forced: boolean; policies: number }[]>`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname in ('content_reports','user_blocks')
      order by c.relname
    `;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.enabled, `${r.table} ENABLE`).toBe(true);
      expect(r.forced, `${r.table} FORCE`).toBe(true);
      expect(r.policies, `${r.table} policy count`).toBeGreaterThan(0);
    }
  });
});
