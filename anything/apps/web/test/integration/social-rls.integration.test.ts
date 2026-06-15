// RLS R2b — SOCIAL / PUBLIC-READ table policies proven on the REAL tables, acting
// AS pawpi_app. Companion to pets-rls.integration.test.ts (R2a).
//
// PawPi is a social app: any LOGGED-IN user views other pets' profiles and sees
// other pets' posts in the global feed. So posts / post_paws / post_barks /
// pet_follows are READABLE by any authenticated user, while only the ACTOR may
// WRITE their own rows. pet_friendships is PARTICIPANT-scoped (not public). And
// the `pets` read rule is CORRECTED here: R2a scoped pet reads to owner + provider
// grant/booking, but the social profile read + feed JOIN expose ANY pet to ANY
// signed-in user — so a non-owner authed user now READS any pet (writes stay
// owner-only). Migration 0021 makes all of this real; this file is the proof.
//
// As in R2a we connect a SECOND porsager client AS pawpi_app (NOBYPASSRLS), set
// app.current_user_id per transaction, and assert allowed-vs-ZERO rows. The
// harness owner is a superuser, so FORCE RLS constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedPost,
  seedPaw,
  seedBark,
  seedFollow,
  seedFriendship,
} from './db';

// Three owners, one pet each. Ids explicit so assertions read clearly.
const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const C = { authUserId: 3, profileId: 3, username: 'ownerc', petId: 3, petName: 'Coco' };

// raw = privileged superuser client (seeding / reset). app = the pawpi_app role,
// the real RLS target. Both built once in beforeAll.
let raw: Sql;
let app: Sql;

/** Run `fn` as pawpi_app inside one transaction stamped with `userId` (or no id). */
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

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

// Seed three owners with a pet each. Explicit-id seeds don't advance the identity
// sequences; the write tests that INSERT sequence-driven rows resync as needed.
function seedThreeOwners() {
  beforeEach(async () => {
    await seedOwnerWithPet(raw, A);
    await seedOwnerWithPet(raw, B);
    await seedOwnerWithPet(raw, C);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// pets — the headline R2b GAP-CLOSED proof: a non-owner authed user now READS any
// pet (so the feed JOIN / social profile read survives FORCE RLS), while writes
// stay owner-only. The exhaustive pets matrix lives in pets-rls.integration.test.ts
// (the R2a file, updated for this correction); these three assert the gap is shut.
describe('RLS R2b — pets read-correction gap closed (as pawpi_app)', () => {
  seedThreeOwners();

  it('non-owner B reads owner A\'s pet (feed JOIN / profile read survives)', async () => {
    const rows = await asApp(B.profileId, (tx) => tx`select id from pets order by id`);
    expect(rows.map((r: any) => r.id)).toEqual([A.petId, B.petId, C.petId]);
  });

  it('with NO identity set, FORCE RLS yields zero pets (deny-by-default)', async () => {
    const rows = await asApp(null, (tx) => tx`select id from pets`);
    expect(rows).toHaveLength(0);
  });

  it('B can READ but canNOT UPDATE/DELETE A\'s pet (writes stay owner-only)', async () => {
    const updated = await asApp(B.profileId, (tx) => tx`
      update pets set name = 'Hacked' where id = ${A.petId} returning id
    `);
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from pets where id = ${A.petId} returning id
    `);
    expect(updated).toHaveLength(0);
    expect(deleted).toHaveLength(0);
    const [row] = await raw`select name from pets where id = ${A.petId}`;
    expect(row.name).toBe(A.petName);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// posts — read any authed; write the author (user_id = me).
describe('RLS R2b — posts read-any / write-author (as pawpi_app)', () => {
  seedThreeOwners();
  beforeEach(async () => {
    await seedPost(raw, { postId: 10, userId: A.profileId, petId: A.petId });
    await seedPost(raw, { postId: 20, userId: B.profileId, petId: B.petId });
    await raw`select setval(pg_get_serial_sequence('posts','id'), (select max(id) from posts))`;
  });

  it('any authed user reads ALL posts (global feed)', async () => {
    const rows = await asApp(B.profileId, (tx) => tx`select id from posts order by id`);
    expect(rows.map((r: any) => r.id)).toEqual([10, 20]);
  });

  it('no identity → zero posts', async () => {
    const rows = await asApp(null, (tx) => tx`select id from posts`);
    expect(rows).toHaveLength(0);
  });

  it('author B can INSERT their own post and DELETE it', async () => {
    const inserted = await asApp(B.profileId, (tx) => tx`
      insert into posts (user_id, pet_id, caption)
      values (${B.profileId}, ${B.petId}, 'mine') returning id
    `);
    expect(inserted).toHaveLength(1);
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from posts where id = ${inserted[0].id} returning id
    `);
    expect(deleted).toHaveLength(1);
  });

  it('B canNOT INSERT a post with someone else\'s user_id (WITH CHECK rejects)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into posts (user_id, pet_id, caption)
        values (${A.profileId}, ${A.petId}, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('B canNOT UPDATE or DELETE A\'s post (0 rows; row survives)', async () => {
    const updated = await asApp(B.profileId, (tx) => tx`
      update posts set caption = 'edited' where id = 10 returning id
    `);
    expect(updated).toHaveLength(0);
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from posts where id = 10 returning id
    `);
    expect(deleted).toHaveLength(0);
    const [{ n }] = await raw`select count(*)::int as n from posts where id = 10`;
    expect(n).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// post_paws — read any authed; write the actor (user_id = me).
describe('RLS R2b — post_paws read-any / write-actor (as pawpi_app)', () => {
  seedThreeOwners();
  beforeEach(async () => {
    await seedPost(raw, { postId: 10, userId: A.profileId, petId: A.petId });
    // A paws their own post; the paw row is authored by A.
    await seedPaw(raw, { postId: 10, userId: A.profileId });
  });

  it('any authed user reads ALL paws (counts/lists)', async () => {
    const rows = await asApp(B.profileId, (tx) => tx`select user_id from post_paws where post_id = 10`);
    expect(rows.map((r: any) => r.user_id)).toEqual([A.profileId]);
  });

  it('actor B can paw and unpaw post 10', async () => {
    await asApp(B.profileId, (tx) => tx`insert into post_paws (post_id, user_id) values (10, ${B.profileId})`);
    const [{ n }] = await raw`select count(*)::int as n from post_paws where post_id = 10`;
    expect(n).toBe(2);
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from post_paws where post_id = 10 and user_id = ${B.profileId} returning id
    `);
    expect(deleted).toHaveLength(1);
  });

  it('B canNOT INSERT a paw under A\'s user_id (WITH CHECK rejects)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`insert into post_paws (post_id, user_id) values (10, ${A.profileId})`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('B canNOT DELETE A\'s paw (0 rows; row survives)', async () => {
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from post_paws where post_id = 10 and user_id = ${A.profileId} returning id
    `);
    expect(deleted).toHaveLength(0);
    const [{ n }] = await raw`select count(*)::int as n from post_paws where post_id = 10`;
    expect(n).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// post_barks — read any authed; write the author (user_id = me); pet_id not gated.
describe('RLS R2b — post_barks read-any / write-author (as pawpi_app)', () => {
  seedThreeOwners();
  beforeEach(async () => {
    await seedPost(raw, { postId: 10, userId: A.profileId, petId: A.petId });
    await seedBark(raw, { barkId: 100, postId: 10, userId: A.profileId, petId: A.petId });
    await raw`select setval(pg_get_serial_sequence('post_barks','id'), (select max(id) from post_barks))`;
  });

  it('any authed user reads ALL barks (comments)', async () => {
    const rows = await asApp(B.profileId, (tx) => tx`select id, user_id from post_barks where post_id = 10`);
    expect(rows.map((r: any) => r.id)).toEqual([100]);
  });

  it('author B can comment AS their pet (pet_id not gated) and delete it', async () => {
    const inserted = await asApp(B.profileId, (tx) => tx`
      insert into post_barks (post_id, user_id, pet_id, text)
      values (10, ${B.profileId}, ${B.petId}, 'woof') returning id
    `);
    expect(inserted).toHaveLength(1);
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from post_barks where id = ${inserted[0].id} returning id
    `);
    expect(deleted).toHaveLength(1);
  });

  it('B canNOT INSERT a bark under A\'s user_id (WITH CHECK rejects)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into post_barks (post_id, user_id, pet_id, text)
        values (10, ${A.profileId}, ${A.petId}, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('B canNOT UPDATE or DELETE A\'s bark (0 rows; row survives)', async () => {
    const updated = await asApp(B.profileId, (tx) => tx`
      update post_barks set text = 'edited' where id = 100 returning id
    `);
    expect(updated).toHaveLength(0);
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from post_barks where id = 100 returning id
    `);
    expect(deleted).toHaveLength(0);
    const [{ n }] = await raw`select count(*)::int as n from post_barks where id = 100`;
    expect(n).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// pet_follows — read any authed; write only the FOLLOWER pet's owner.
describe('RLS R2b — pet_follows read-any / owner-of-follower write (as pawpi_app)', () => {
  seedThreeOwners();
  beforeEach(async () => {
    // A's pet already follows B's pet.
    await seedFollow(raw, { followerPetId: A.petId, followedPetId: B.petId });
  });

  it('any authed user reads ALL follows (counts)', async () => {
    const rows = await asApp(C.profileId, (tx) => tx`
      select follower_pet_id, followed_pet_id from pet_follows
    `);
    expect(rows).toEqual([{ follower_pet_id: A.petId, followed_pet_id: B.petId }]);
  });

  it('no identity → zero follows', async () => {
    const rows = await asApp(null, (tx) => tx`select id from pet_follows`);
    expect(rows).toHaveLength(0);
  });

  it('the follower pet\'s owner (B) can follow (B.pet -> C.pet) and unfollow', async () => {
    await asApp(B.profileId, (tx) => tx`
      insert into pet_follows (follower_pet_id, followed_pet_id)
      values (${B.petId}, ${C.petId})
    `);
    const [{ n }] = await raw`
      select count(*)::int as n from pet_follows
      where follower_pet_id = ${B.petId} and followed_pet_id = ${C.petId}
    `;
    expect(n).toBe(1);
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from pet_follows
      where follower_pet_id = ${B.petId} and followed_pet_id = ${C.petId}
      returning id
    `);
    expect(deleted).toHaveLength(1);
  });

  it('a user who does NOT own the follower pet canNOT insert a follow for it (WITH CHECK rejects)', async () => {
    // C tries to make A's pet follow C's pet — C does not own A.petId.
    await expect(
      asApp(C.profileId, (tx) => tx`
        insert into pet_follows (follower_pet_id, followed_pet_id)
        values (${A.petId}, ${C.petId})
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a non-owner of the follower pet canNOT delete its follow (0 rows; row survives)', async () => {
    // B does not own A.petId, so cannot remove A.pet -> B.pet follow.
    const deleted = await asApp(B.profileId, (tx) => tx`
      delete from pet_follows where follower_pet_id = ${A.petId} returning id
    `);
    expect(deleted).toHaveLength(0);
    const [{ n }] = await raw`select count(*)::int as n from pet_follows where follower_pet_id = ${A.petId}`;
    expect(n).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// pet_friendships — PARTICIPANT-scoped read AND write.
describe('RLS R2b — pet_friendships participant-only (as pawpi_app)', () => {
  seedThreeOwners();
  beforeEach(async () => {
    // A (requester) <-> B (receiver), accepted. C is NOT a participant.
    await seedFriendship(raw, {
      requesterUserId: A.profileId,
      receiverUserId: B.profileId,
      requesterPetId: A.petId,
      receiverPetId: B.petId,
    });
  });

  it('both participants (A and B) read the friendship', async () => {
    const asA = await asApp(A.profileId, (tx) => tx`select id from pet_friendships`);
    const asB = await asApp(B.profileId, (tx) => tx`select id from pet_friendships`);
    expect(asA).toHaveLength(1);
    expect(asB).toHaveLength(1);
  });

  it('a non-participant (C) sees ZERO friendships', async () => {
    const rows = await asApp(C.profileId, (tx) => tx`select id from pet_friendships`);
    expect(rows).toHaveLength(0);
  });

  it('no identity → zero friendships', async () => {
    const rows = await asApp(null, (tx) => tx`select id from pet_friendships`);
    expect(rows).toHaveLength(0);
  });

  it('a participant (A) can create a friendship they are part of', async () => {
    const inserted = await asApp(A.profileId, (tx) => tx`
      insert into pet_friendships
        (requester_user_id, receiver_user_id, requester_pet_id, receiver_pet_id, status)
      values (${A.profileId}, ${C.profileId}, ${A.petId}, ${C.petId}, 'pending')
      returning id
    `);
    expect(inserted).toHaveLength(1);
  });

  it('a non-participant (C) canNOT insert a friendship between A and B (WITH CHECK rejects)', async () => {
    await expect(
      asApp(C.profileId, (tx) => tx`
        insert into pet_friendships
          (requester_user_id, receiver_user_id, requester_pet_id, receiver_pet_id, status)
        values (${A.profileId}, ${B.profileId}, ${A.petId}, ${B.petId}, 'pending')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a non-participant (C) canNOT update the A<->B friendship (0 rows; row unchanged)', async () => {
    const updated = await asApp(C.profileId, (tx) => tx`
      update pet_friendships set status = 'blocked' where requester_user_id = ${A.profileId} returning id
    `);
    expect(updated).toHaveLength(0);
    const [row] = await raw`select status from pet_friendships where requester_user_id = ${A.profileId}`;
    expect(row.status).toBe('accepted');
  });
});
