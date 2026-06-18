// RLS for ticket 2.44 — community forum — proven on the REAL tables AS pawpi_app.
//
// 0047 adds forum_threads / forum_comments / forum_votes with:
//   • threads + comments: READ by any authed user; INSERT/UPDATE/DELETE by the AUTHOR only.
//   • votes: the voter reads ONLY their own; NO direct write policy — votes are cast solely
//     through the forum_vote() SECURITY DEFINER helper, which pins the caller, upserts one
//     vote per (user,target), and recomputes the target's score (bypassing the author-only
//     thread/comment UPDATE policy a non-author voter could not satisfy).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedForumThread,
  seedForumComment,
  seedForumVote,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };   // author
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };  // other user
const D = { authUserId: 4, profileId: 4, username: 'ownerd', petId: 4, petName: 'Duke' };   // third voter
const THREAD = 1;
const COMMENT = 1;

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

// A authors a thread + a comment on it.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedOwnerWithPet(raw, D);
  await seedForumThread(raw, { threadId: THREAD, authorUserId: A.profileId });
  await seedForumComment(raw, { commentId: COMMENT, threadId: THREAD, authorUserId: A.profileId });
});

describe('RLS 2.44 — forum_threads / forum_comments read + author-write', () => {
  it('any authed user reads threads + comments (public community)', async () => {
    for (const uid of [A.profileId, B.profileId, D.profileId]) {
      await asApp(uid, async (tx) => {
        expect(ids(await tx`select id from forum_threads`)).toEqual([THREAD]);
        expect(ids(await tx`select id from forum_comments`)).toEqual([COMMENT]);
      });
    }
  });

  it('no identity → zero (deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from forum_threads`).toHaveLength(0);
    });
  });

  it('the author (A) creates a thread; a non-author cannot forge one as A', async () => {
    await asApp(A.profileId, async (tx) => {
      const created = await tx`
        insert into forum_threads (id, author_user_id, title) values (50, ${A.profileId}, 'mine')
        returning id`;
      expect(created).toHaveLength(1);
    });
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into forum_threads (author_user_id, title) values (${A.profileId}, 'forged')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('only the author edits/soft-deletes their thread; others touch ZERO', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update forum_threads set title = 'hijacked' returning id`).toHaveLength(0);
      expect(await tx`update forum_threads set deleted_at = now() returning id`).toHaveLength(0);
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`update forum_threads set title = 'renamed' returning id`).toHaveLength(1);
    });
  });

  it('only the author edits/soft-deletes their comment', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update forum_comments set body = 'x' returning id`).toHaveLength(0);
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`update forum_comments set deleted_at = now() returning id`).toHaveLength(1);
    });
  });

  it('any authed user can comment (author = self)', async () => {
    await asApp(B.profileId, async (tx) => {
      const c = await tx`
        insert into forum_comments (id, thread_id, author_user_id, body)
        values (50, ${THREAD}, ${B.profileId}, 'nice') returning id`;
      expect(c).toHaveLength(1);
    });
  });
});

describe('RLS 2.44 — forum_votes one-per-user + forum_vote() helper', () => {
  it('a voter reads ONLY their own votes', async () => {
    await seedForumVote(raw, { voteId: 1, userId: B.profileId, targetType: 'thread', targetId: THREAD, value: 1 });
    await seedForumVote(raw, { voteId: 2, userId: D.profileId, targetType: 'thread', targetId: THREAD, value: 1 });
    await asApp(B.profileId, async (tx) => {
      expect(ids(await tx`select id from forum_votes`)).toEqual([1]);
    });
  });

  it('a direct INSERT into forum_votes is denied (no write policy) — votes go via the helper', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into forum_votes (user_id, target_type, target_id, value)
        values (${B.profileId}, 'thread', ${THREAD}, 1)`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('forum_vote() upserts one vote per user and recomputes the thread score', async () => {
    // B upvotes (score 1), D upvotes (score 2), B re-votes -1 (idempotent: still one B row → score 0).
    await asApp(B.profileId, async (tx) => {
      const [{ forum_vote: s1 }] = await tx`select forum_vote('thread', ${THREAD}, 1)`;
      expect(s1).toBe(1);
    });
    await asApp(D.profileId, async (tx) => {
      const [{ forum_vote: s2 }] = await tx`select forum_vote('thread', ${THREAD}, 1)`;
      expect(s2).toBe(2);
    });
    await asApp(B.profileId, async (tx) => {
      const [{ forum_vote: s3 }] = await tx`select forum_vote('thread', ${THREAD}, -1)`;
      expect(s3).toBe(0); // B flipped +1 → -1, D still +1: (-1)+(+1) = 0
    });
    // exactly two vote rows (B + D), never duplicated.
    const [{ n }] = await raw`select count(*)::int as n from forum_votes where target_type='thread' and target_id=${THREAD}`;
    expect(n).toBe(2);
    const [{ score }] = await raw`select score from forum_threads where id = ${THREAD}`;
    expect(score).toBe(0);
  });

  it('forum_vote(...,0) clears the caller vote and updates the score', async () => {
    await asApp(B.profileId, async (tx) => {
      await tx`select forum_vote('comment', ${COMMENT}, 1)`;
      const [{ forum_vote: cleared }] = await tx`select forum_vote('comment', ${COMMENT}, 0)`;
      expect(cleared).toBe(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from forum_votes where target_type='comment'`;
    expect(n).toBe(0);
    const [{ score }] = await raw`select score from forum_comments where id = ${COMMENT}`;
    expect(score).toBe(0);
  });

  it('forum_vote() with no identity raises', async () => {
    await expect(
      asApp(null, (tx) => tx`select forum_vote('thread', ${THREAD}, 1)`),
    ).rejects.toThrow(/no identity/i);
  });
});
