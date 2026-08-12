// Business "daily moments" + video (migration 0087) — a followed business's posts surface in the
// follower's feed. Proven through the REAL Hono router by URL (api.request), against the embedded DB
// as pawpi_app (FORCE RLS like production):
//   • the storefront POST create stores a VIDEO post (media_type='video' + video_url);
//   • GET /api/posts for a FOLLOWER includes that business's posts (image + video) as distinct
//     feed items (item_type='provider_post'), exposing only public business fields + media + counts;
//   • GET /api/posts for a NON-follower does NOT include them.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedProviderWithStaff, seedUser } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: 'shopowner' };
const FOLLOWER = { authUserId: 2, profileId: 2, username: 'follower' };
const STRANGER = { authUserId: 3, profileId: 3, username: 'stranger' };
const PROV = 100;
const SLUG = 'happy-paws';

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });

function apiReq(path: string, method = 'GET', body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

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
  await seedUser(raw, OWNER);
  await seedUser(raw, FOLLOWER);
  await seedUser(raw, STRANGER);
  await seedProviderWithStaff(raw, {
    providerId: PROV,
    ownerUserProfileId: OWNER.profileId,
    staffUserProfileId: OWNER.profileId,
    slug: SLUG,
    staffRole: 'owner',
    providerStatus: 'published',
  });
  await raw`update providers set name = 'Happy Paws', logo_url = 'https://cdn/logo.png' where id = ${PROV}`;
});

// Create an image + a video storefront post through the REAL create route as the owner (staff).
async function seedTwoPosts() {
  authState.session = sessionFor(OWNER.authUserId);
  const imgRes = await apiReq(`/providers/${PROV}/posts`, 'POST', {
    body: 'Fresh grooming slots today',
    image_urls: ['https://cdn/a.png'],
  });
  expect(imgRes.status).toBe(201);

  const vidRes = await apiReq(`/providers/${PROV}/posts`, 'POST', {
    media_type: 'video',
    video_url: 'https://cdn/moment.mp4',
    video_thumbnail_url: 'https://cdn/moment.jpg',
    body: 'New groomer joined us',
  });
  expect(vidRes.status).toBe(201);
  const vidPost = (await vidRes.json()).post;
  // create → the video post carries media_type + video_url through the create response.
  expect(vidPost).toMatchObject({
    media_type: 'video',
    video_url: 'https://cdn/moment.mp4',
    video_thumbnail_url: 'https://cdn/moment.jpg',
  });
  authState.session = null;
  return { imageId: (await imgRes.json()).post.id, videoId: vidPost.id };
}

describe("business daily moments in the follower's feed (real router)", () => {
  it('a follower sees the followed business posts (image + video) as distinct feed items', async () => {
    const { imageId, videoId } = await seedTwoPosts();
    // FOLLOWER follows the provider.
    await raw`insert into provider_follows (follower_user_id, provider_id) values (${FOLLOWER.profileId}, ${PROV})`;

    authState.session = sessionFor(FOLLOWER.authUserId);
    const res = await apiReq('/posts');
    expect(res.status).toBe(200);
    const { posts } = await res.json();

    const biz = posts.filter((p: any) => p.item_type === 'provider_post');
    expect(biz.map((p: any) => p.id).sort()).toEqual([imageId, videoId].sort());

    const video = biz.find((p: any) => p.id === videoId);
    expect(video).toMatchObject({
      media_type: 'video',
      video_url: 'https://cdn/moment.mp4',
      video_thumbnail_url: 'https://cdn/moment.jpg',
      provider_id: PROV,
    });
    // Only PUBLIC business fields are projected — never provider-private data.
    expect(video.provider).toMatchObject({ name: 'Happy Paws', slug: SLUG, logo_url: 'https://cdn/logo.png' });
    expect(video).not.toHaveProperty('author_user_id');
    expect(video.provider).not.toHaveProperty('stripe_account_id');
    // Counts ride along (zero here — no paws/comments yet).
    expect(video).toMatchObject({ paw_count: 0, comment_count: 0 });

    const image = biz.find((p: any) => p.id === imageId);
    expect(image).toMatchObject({ media_type: 'image', video_url: null });
  });

  it('a NON-follower never sees the business posts in the feed', async () => {
    await seedTwoPosts();
    // STRANGER does not follow the provider.
    authState.session = sessionFor(STRANGER.authUserId);
    const res = await apiReq('/posts');
    expect(res.status).toBe(200);
    const { posts } = await res.json();
    expect(posts.some((p: any) => p.item_type === 'provider_post')).toBe(false);
  });

  it('an anonymous viewer never sees business posts', async () => {
    await seedTwoPosts();
    authState.session = null;
    const res = await apiReq('/posts');
    expect(res.status).toBe(200);
    const { posts } = await res.json();
    expect(posts.some((p: any) => p.item_type === 'provider_post')).toBe(false);
  });
});
