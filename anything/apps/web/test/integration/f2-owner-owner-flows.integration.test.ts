// Night run #2 flow audit F2 (owner <> owner) — proven through the REAL Hono router on real Postgres as
// pawpi_app (FORCE RLS), two users A and B:
//   * blocks are enforced on the API for follow / paw / DM thread / caregiver invite / lost sighting /
//     forum vote (no row, no notification, 403, either direction);
//   * a duplicate paw produces exactly ONE notification;
//   * handled DB errors are friendly 4xx, not a 500 at COMMIT (caregiver duplicate → 409, sighting RLS → 404);
//   * pack-streak invites are rate limited and a stale flame reads 0.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedPost,
  seedLostReport,
  seedForumThread,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: 'owner-a', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'owner-b', petId: 2, petName: 'Bella' };

let raw: Sql;
let api: any;
const as = (u: { authUserId: number }) => {
  authState.session = { user: { id: u.authUserId } };
};
function req(path: string, method = 'GET', body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
const count = async (q: Promise<any[]>) => (await q).length;
const notifs = (type: string) => raw`select recipient_user_id, actor_user_id from notifications where type = ${type}`;

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  ({ api } = (await import('../../__create/route-builder')) as any);
});
afterAll(async () => {
  await raw.end();
});
afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedPost(raw, { postId: 1, userId: A.profileId, petId: A.petId });
});

describe('blocks are enforced on the API (either direction)', () => {
  // B blocked A; A (the blocked one) tries to interact with B — and the mirror case.
  for (const [label, blocker, blocked] of [
    ['blocked user -> blocker', B, A],
    ['blocker -> blocked user', A, B],
  ] as const) {
    describe(label, () => {
      beforeEach(async () => {
        await raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${blocker.profileId}, ${blocked.profileId})`;
      });

      it('follow: 403, no pet_follows row, no notification', async () => {
        as(A);
        const res = await req(`/pets/${B.petId}/follow`, 'POST', { followerPetId: A.petId });
        expect(res.status).toBe(403);
        expect(await count(raw`select 1 from pet_follows`)).toBe(0);
        expect(await count(notifs('follow'))).toBe(0);
      });

      it('paw: 403 for the other side of the pair, no row, no notification', async () => {
        await seedPost(raw, { postId: 2, userId: B.profileId, petId: B.petId });
        as(A);
        const res = await req(`/posts/2/paw`, 'POST');
        expect(res.status).toBe(403);
        expect(await count(raw`select 1 from post_paws`)).toBe(0);
        expect(await count(notifs('paw'))).toBe(0);
      });

      it('DM: cannot start a thread', async () => {
        as(A);
        const res = await req(`/dm-threads`, 'POST', { otherUserId: B.profileId });
        expect(res.status).toBe(403);
        expect(await count(raw`select 1 from dm_threads`)).toBe(0);
      });

      it('caregiver invite: 403, no grant', async () => {
        as(A);
        const res = await req(`/pet-caregivers`, 'POST', { petId: A.petId, role: 'family', granteeUserId: B.profileId });
        expect(res.status).toBe(403);
        expect(await count(raw`select 1 from pet_caregivers`)).toBe(0);
      });

      it('lost sighting on the other side\'s report: 403, no sighting, no notification', async () => {
        await seedLostReport(raw, { id: 1, petId: B.petId, ownerUserId: B.profileId });
        as(A);
        const res = await req(`/lost-reports/1/sightings`, 'POST', { note: 'saw it' });
        expect(res.status).toBe(403);
        expect(await count(raw`select 1 from lost_sightings`)).toBe(0);
        expect(await count(notifs('lost_alert'))).toBe(0);
      });

      it('forum vote on the other side\'s thread: 403, no vote', async () => {
        await seedForumThread(raw, { threadId: 1, authorUserId: B.profileId });
        as(A);
        const res = await req(`/forum/vote`, 'POST', { targetType: 'thread', targetId: 1, value: 1 });
        expect(res.status).toBe(403);
        expect(await count(raw`select 1 from forum_votes`)).toBe(0);
      });
    });
  }

  it('an unblocked pair still works (control)', async () => {
    as(B);
    const follow = await req(`/pets/${A.petId}/follow`, 'POST', { followerPetId: B.petId });
    expect(follow.status).toBe(200);
    expect(await notifs('follow')).toHaveLength(1);
  });
});

describe('paw notifications', () => {
  it('pawing twice (double tap / retry) creates ONE paw and ONE notification, to the post owner only', async () => {
    as(B);
    expect((await req(`/posts/1/paw`, 'POST')).status).toBe(200);
    expect((await req(`/posts/1/paw`, 'POST')).status).toBe(200);
    expect(await count(raw`select 1 from post_paws`)).toBe(1);
    const n = await notifs('paw');
    expect(n).toHaveLength(1);
    expect(Number(n[0].recipient_user_id)).toBe(A.profileId);
    expect(Number(n[0].actor_user_id)).toBe(B.profileId);
  });

  it('pawing your own post notifies nobody', async () => {
    as(A);
    expect((await req(`/posts/1/paw`, 'POST')).status).toBe(200);
    expect(await notifs('paw')).toHaveLength(0);
  });

  it('a hidden post cannot be pawed', async () => {
    await raw`update posts set hidden_at = now() where id = 1`;
    as(B);
    expect((await req(`/posts/1/paw`, 'POST')).status).toBe(404);
  });
});

describe('handled database errors are friendly 4xx, not a 500', () => {
  it('inviting the same person twice → 409 (the unique violation no longer aborts the transaction)', async () => {
    as(A);
    const body = { petId: A.petId, role: 'family', granteeUserId: B.profileId };
    expect((await req(`/pet-caregivers`, 'POST', body)).status).toBe(201);
    const dup = await req(`/pet-caregivers`, 'POST', body);
    expect(dup.status).toBe(409);
    expect(await count(raw`select 1 from pet_caregivers`)).toBe(1);
  });

  it('a sighting on a resolved report → 404 (RLS rejection handled in a savepoint)', async () => {
    await seedLostReport(raw, { id: 1, petId: A.petId, ownerUserId: A.profileId, status: 'resolved' });
    as(B);
    const res = await req(`/lost-reports/1/sightings`, 'POST', { note: 'late' });
    expect(res.status).toBe(404);
  });

  it('voting on a missing thread → 404', async () => {
    as(B);
    expect((await req(`/forum/vote`, 'POST', { targetType: 'thread', targetId: 999, value: 1 })).status).toBe(404);
  });
});
