// MOD1 PR2 (migration 0115) — a reported provider_post_comment can be ACTED ON, proven on the
// real tables AS pawpi_app. 0112 made the comment reportable; 0115 makes the admin queue's
// Remove/Ban actually take it down. This test proves the end-to-end:
//   • an admin's app_admin_action_report(report,'remove',ban:true) sets the comment's hidden_at,
//     flips the report to 'actioned', and bans the comment's author;
//   • a guest (no identity) then cannot SELECT the hidden comment (it really disappears);
//   • a non-admin caller is rejected.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedUser, seedProvider } from './db';

const ADMIN = { authUserId: 1, profileId: 1, username: 'modadmin' };
const OWNER = { authUserId: 2, profileId: 2, username: 'bizowner' };
const COMMENTER = { authUserId: 3, profileId: 3, username: 'commenter' };
const REPORTER = { authUserId: 4, profileId: 4, username: 'reporter' };
const PROVIDER_ID = 1;
const POST_ID = 1;
const COMMENT_ID = 1;

let raw: Sql;
let app: Sql;

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

let reportId: number;

beforeEach(async () => {
  await seedUser(raw, ADMIN);
  await seedUser(raw, OWNER);
  await seedUser(raw, COMMENTER);
  await seedUser(raw, REPORTER);
  await raw`update user_profiles set is_admin = true where id = ${ADMIN.profileId}`;
  await seedProvider(raw, {
    providerId: PROVIDER_ID,
    ownerUserProfileId: OWNER.profileId,
    slug: 'the-clinic',
    status: 'published',
  });
  await raw`
    insert into provider_posts (id, provider_id, author_user_id, body)
    values (${POST_ID}, ${PROVIDER_ID}, ${OWNER.profileId}, 'Grand opening!')
  `;
  await raw`
    insert into provider_post_comments (id, post_id, provider_id, author_user_id, body)
    values (${COMMENT_ID}, ${POST_ID}, ${PROVIDER_ID}, ${COMMENTER.profileId}, 'nasty comment')
  `;
  const [r] = await raw`
    insert into content_reports (reporter_user_id, target_type, target_id, reason)
    values (${REPORTER.profileId}, 'provider_post_comment', ${COMMENT_ID}, 'harassment')
    returning id
  `;
  reportId = r.id;
});

describe('moderating a provider_post_comment (as pawpi_app)', () => {
  it('remove+ban hides the comment, flips the report, and bans the author', async () => {
    await asApp(ADMIN.profileId, (tx) =>
      tx`select app_admin_action_report(${reportId}, 'remove', true)`,
    );

    const [comment] = await raw`select hidden_at from provider_post_comments where id = ${COMMENT_ID}`;
    expect(comment.hidden_at).not.toBeNull();

    const [report] = await raw`select status from content_reports where id = ${reportId}`;
    expect(report.status).toBe('actioned');

    const [author] = await raw`select banned_at from user_profiles where id = ${COMMENTER.profileId}`;
    expect(author.banned_at).not.toBeNull();
  });

  it('after removal a guest cannot SELECT the hidden comment (it really disappears)', async () => {
    await asApp(ADMIN.profileId, (tx) =>
      tx`select app_admin_action_report(${reportId}, 'remove', false)`,
    );
    const visible = await asApp(null, (tx) =>
      tx`select id from provider_post_comments where id = ${COMMENT_ID}`,
    );
    expect(visible).toHaveLength(0);
  });

  it('a non-admin caller is rejected', async () => {
    await expect(
      asApp(COMMENTER.profileId, (tx) =>
        tx`select app_admin_action_report(${reportId}, 'remove', false)`,
      ),
    ).rejects.toThrow(/not authorized/i);
  });
});
