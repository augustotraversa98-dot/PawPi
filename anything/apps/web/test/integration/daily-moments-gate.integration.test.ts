// Daily-moments gate — another owner's Daily moments stay hidden until the viewer has
// posted their own daily moment today. Proven on REAL Postgres through the real router
// (a client-only hide can be bypassed, so the API itself must withhold the rows).
//
//   GET /api/pets/[id]/profile  → posts: [] + momentsLocked while the viewer has not posted
//   GET /api/posts/history      → posts: [] + locked       "
//   GET /api/posts/owner-posted-today  → the Feed's lock; same query, same answer

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const AUTHOR = { authUserId: 1, profileId: 1, username: 'author', petId: 1, petName: 'Rex' };
const VIEWER = { authUserId: 2, profileId: 2, username: 'viewer', petId: 2, petName: 'Mango' };

let raw: Sql;
let app: Sql;
let api: any;

const as = (o: { authUserId: number }) => {
  authState.session = { user: { id: o.authUserId } };
};
const get = (path: string) => api.request(path);

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
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  ({ api } = (await import('../../__create/route-builder')) as any);

  await resetDb(raw);
  await seedOwnerWithPet(raw, AUTHOR);
  await seedOwnerWithPet(raw, VIEWER);
  // Both owners share one fixed timezone so "today" is the same calendar day for the
  // post_date the test stamps and the day the route computes.
  await raw`update user_profiles set timezone = 'UTC' where id in (${AUTHOR.profileId}, ${VIEWER.profileId})`;
  // The author has a daily moment today (the thing the viewer must not see yet).
  await raw`
    insert into posts (user_id, pet_id, image_url, caption, is_daily_update, post_date)
    values (${AUTHOR.profileId}, ${AUTHOR.petId}, 'https://cdn.example/author.jpg', 'secret',
            true, (now() at time zone 'UTC')::date)`;
});

afterAll(async () => {
  await resetDb(raw);
  authState.session = null;
  await app.end();
  await raw.end();
});

describe('another owner\'s pet — viewer has NOT posted today', () => {
  it('profile: header + stats are returned, the moments are NOT', async () => {
    as(VIEWER);
    const res = await get(`/pets/${AUTHOR.petId}/profile?viewerPetId=${VIEWER.petId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pet.name).toBe('Rex');
    expect(body.stats.totalPosts).toBe(1); // the existing public stat, unchanged
    expect(body.momentsLocked).toBe(true);
    expect(body.posts).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('author.jpg');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('history: no rows', async () => {
    as(VIEWER);
    const body = await (await get(`/posts/history?petId=${AUTHOR.petId}`)).json();
    expect(body).toEqual({ posts: [], locked: true });
  });

  it('owner-posted-today (the Feed lock) agrees: false', async () => {
    as(VIEWER);
    expect((await (await get('/posts/owner-posted-today')).json()).hasPostedToday).toBe(false);
  });

  it('the author\'s own profile is never gated', async () => {
    as(AUTHOR);
    const body = await (await get(`/pets/${AUTHOR.petId}/profile`)).json();
    expect(body.momentsLocked).toBe(false);
    expect(body.posts).toHaveLength(1);
  });
});

describe('another owner\'s pet — viewer HAS posted today', () => {
  it('posting ANY owned pet\'s daily moment unlocks the moments (profile + history)', async () => {
    await raw`
      insert into posts (user_id, pet_id, image_url, is_daily_update, post_date)
      values (${VIEWER.profileId}, ${VIEWER.petId}, 'https://cdn.example/viewer.jpg',
              true, (now() at time zone 'UTC')::date)`;
    as(VIEWER);

    expect((await (await get('/posts/owner-posted-today')).json()).hasPostedToday).toBe(true);

    const profile = await (await get(`/pets/${AUTHOR.petId}/profile?viewerPetId=${VIEWER.petId}`)).json();
    expect(profile.momentsLocked).toBe(false);
    expect(profile.posts).toHaveLength(1);
    expect(profile.posts[0].image_url).toBe('https://cdn.example/author.jpg');

    const history = await (await get(`/posts/history?petId=${AUTHOR.petId}`)).json();
    expect(history.locked).toBeUndefined();
    expect(history.posts).toHaveLength(1);
  });

  it('a post from a PREVIOUS day does not count as posted today', async () => {
    await raw`update posts set post_date = (now() at time zone 'UTC')::date - 1 where user_id = ${VIEWER.profileId}`;
    as(VIEWER);
    const profile = await (await get(`/pets/${AUTHOR.petId}/profile`)).json();
    expect(profile.momentsLocked).toBe(true);
    expect(profile.posts).toEqual([]);
  });
});

// The Feed itself (and Discover) are gated server-side too: a locked viewer must not be able to
// read other owners' photos off GET /api/posts or GET /api/discover. State carried over from the
// block above: the viewer's only post is from YESTERDAY, so they have NOT posted today.
describe('the feed is redacted server-side while locked; discover is a sneak peek', () => {
  it('feed: the other owner\'s post is returned redacted + locked, the viewer\'s own is intact', async () => {
    as(VIEWER);
    const res = await get(`/posts?viewerPetId=${VIEWER.petId}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    const theirs = body.posts.find((p: any) => p.user_id === AUTHOR.profileId);
    expect(theirs).toBeTruthy();
    expect(theirs.locked).toBe(true);
    expect(theirs.image_url).toBeNull();
    expect(theirs.caption).toBeNull();
    expect(theirs.pet_name).toBe('Rex'); // identity stays; WHO is fine, WHAT is not
    expect(JSON.stringify(body)).not.toContain('author.jpg');
    expect(JSON.stringify(body)).not.toContain('secret');

    const mine = body.posts.find((p: any) => p.user_id === VIEWER.profileId);
    expect(mine.image_url).toBe('https://cdn.example/viewer.jpg');
    expect(mine.locked).toBeUndefined();
  });

  it('discover: a locked viewer gets the tile thumbnail (tagged locked) but never video_url — and the screens behind a tile stay gated', async () => {
    // A video moment by the author: poster frame is the tile; the playable file must never ship.
    const [video] = await raw`
      insert into posts (user_id, pet_id, image_url, caption, is_daily_update, post_date,
                         media_type, video_url, video_thumbnail_url)
      values (${AUTHOR.profileId}, ${AUTHOR.petId}, null, 'clip', false, (now() at time zone 'UTC')::date,
              'video', 'https://cdn.example/author-clip.mp4', 'https://cdn.example/author-poster.jpg')
      returning id`;
    try {
      as(VIEWER);
      const body = await (await get('/discover')).json();

      const photo = body.moments.find((m: any) => m.user_id === AUTHOR.profileId && m.image_url);
      expect(photo.locked).toBe(true);
      expect(photo.image_url).toBe('https://cdn.example/author.jpg');
      expect(photo.pet_name).toBe('Rex');

      const clip = body.moments.find((m: any) => m.id === video.id);
      expect(clip.locked).toBe(true);
      expect(clip.video_thumbnail_url).toBe('https://cdn.example/author-poster.jpg');
      expect(JSON.stringify(body)).not.toContain('author-clip.mp4');

      // The viewer's own tile is untagged.
      const mine = body.moments.find((m: any) => m.user_id === VIEWER.profileId);
      expect(mine.locked).toBeUndefined();

      // Everything a tile can open is still server-gated for this same locked viewer.
      const profile = await (await get(`/pets/${AUTHOR.petId}/profile`)).json();
      expect(profile.momentsLocked).toBe(true);
      expect(profile.posts).toEqual([]);
      const history = await (await get(`/posts/history?petId=${AUTHOR.petId}`)).json();
      expect(history).toEqual({ posts: [], locked: true });
      expect(JSON.stringify(profile) + JSON.stringify(history)).not.toContain('author.jpg');
    } finally {
      await raw`delete from posts where id = ${video.id}`;
    }
  });

  it('the author (who posted today) sees their own feed unredacted', async () => {
    as(AUTHOR);
    const body = await (await get(`/posts?viewerPetId=${AUTHOR.petId}`)).json();
    const own = body.posts.find((p: any) => p.user_id === AUTHOR.profileId);
    expect(own.image_url).toBe('https://cdn.example/author.jpg');
    expect(own.locked).toBeUndefined();
  });

  it('once the viewer posts today, the feed + discover return the real media', async () => {
    await raw`update posts set post_date = (now() at time zone 'UTC')::date where user_id = ${VIEWER.profileId}`;
    as(VIEWER);

    const feed = await (await get(`/posts?viewerPetId=${VIEWER.petId}`)).json();
    const theirs = feed.posts.find((p: any) => p.user_id === AUTHOR.profileId);
    expect(theirs.image_url).toBe('https://cdn.example/author.jpg');
    expect(theirs.locked).toBeUndefined();

    const discover = await (await get('/discover')).json();
    const moment = discover.moments.find((m: any) => m.user_id === AUTHOR.profileId);
    expect(moment.image_url).toBe('https://cdn.example/author.jpg');
    expect(moment.locked).toBeUndefined();
  });
});
