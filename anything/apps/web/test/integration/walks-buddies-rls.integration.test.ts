// RLS for ticket 2.43 — walks with buddies — proven on the REAL tables AS pawpi_app.
// Companion to rls-gap-closure (R2g, the social_walks base policies).
//
// 0046 extends social_walks with map coords (lat/lng/location_name) and adds
// social_walk_invites (owner-issued invitations to a PRIVATE walk). It also TIGHTENS the
// social_walks read policy so a PRIVATE walk is visible only to its owner + invitees, while a
// PUBLIC ('nearby_pets') / friends_only walk stays any-authed readable.
//
// What this proves as pawpi_app (NOBYPASSRLS):
//   • a PUBLIC (nearby_pets) walk is readable by ANY authed user;
//   • a PRIVATE walk is INVISIBLE to a non-invitee, and VISIBLE to its owner + invitee;
//   • social_walk_invites: invitee reads own invite, walk owner reads all invites for the
//     walk, a stranger reads ZERO; only the walk owner can INSERT/DELETE invites; the invitee
//     can accept (UPDATE own status); a stranger cannot forge an invite.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedSocialWalk,
  seedWalkInvite,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };   // walk owner
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };  // invitee
const D = { authUserId: 4, profileId: 4, username: 'ownerd', petId: 4, petName: 'Duke' };   // outsider
const PUBLIC_WALK = 1;
const PRIVATE_WALK = 2;
const INVITE_ID = 1;

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

// A owns a PUBLIC (nearby_pets) walk + a PRIVATE walk; B is invited to the private walk.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedOwnerWithPet(raw, D);
  await seedSocialWalk(raw, {
    walkId: PUBLIC_WALK, petId: A.petId, ownerUserId: A.profileId, visibility: 'nearby_pets',
  });
  await seedSocialWalk(raw, {
    walkId: PRIVATE_WALK, petId: A.petId, ownerUserId: A.profileId, visibility: 'private',
  });
  await seedWalkInvite(raw, {
    inviteId: INVITE_ID, walkId: PRIVATE_WALK, invitedUserId: B.profileId, invitedByUserId: A.profileId,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('RLS 2.43 — social_walks private-visibility (as pawpi_app)', () => {
  it('a PUBLIC walk is readable by any authed user (owner, invitee, outsider)', async () => {
    for (const uid of [A.profileId, B.profileId, D.profileId]) {
      await asApp(uid, async (tx) => {
        const rows = await tx`select id from social_walks where visibility = 'nearby_pets'`;
        expect(ids(rows)).toEqual([PUBLIC_WALK]);
      });
    }
  });

  it('a PRIVATE walk is INVISIBLE to a non-invitee outsider (D)', async () => {
    await asApp(D.profileId, async (tx) => {
      const rows = await tx`select id from social_walks where id = ${PRIVATE_WALK}`;
      expect(rows).toHaveLength(0);
    });
  });

  it('a PRIVATE walk IS visible to its owner (A) and its invitee (B)', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from social_walks where id = ${PRIVATE_WALK}`)).toEqual([PRIVATE_WALK]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(ids(await tx`select id from social_walks where id = ${PRIVATE_WALK}`)).toEqual([PRIVATE_WALK]);
    });
  });

  it('no identity → zero walks (deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from social_walks`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('RLS 2.43 — social_walk_invites SELECT (as pawpi_app)', () => {
  it('the walk owner (A) reads the invite for their walk', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from social_walk_invites`)).toEqual([INVITE_ID]);
    });
  });

  it('the invitee (B) reads their own invite', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(ids(await tx`select id from social_walk_invites`)).toEqual([INVITE_ID]);
    });
  });

  it('an outsider (D) reads ZERO invites', async () => {
    await asApp(D.profileId, async (tx) => {
      expect(await tx`select id from social_walk_invites`).toHaveLength(0);
    });
  });
});

describe('RLS 2.43 — social_walk_invites write (as pawpi_app)', () => {
  it('the walk owner (A) can INSERT an invite for their walk', async () => {
    const created = await asApp(A.profileId, (tx) => tx`
      insert into social_walk_invites (id, social_walk_id, invited_user_id, invited_by_user_id)
      values (99, ${PRIVATE_WALK}, ${D.profileId}, ${A.profileId})
      returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('a stranger (D) CANNOT forge an invite for a walk they do not own', async () => {
    await expect(
      asApp(D.profileId, (tx) => tx`
        insert into social_walk_invites (social_walk_id, invited_user_id, invited_by_user_id)
        values (${PRIVATE_WALK}, ${D.profileId}, ${D.profileId})
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the invitee (B) can accept (UPDATE own status); an outsider (D) updates ZERO', async () => {
    await asApp(B.profileId, async (tx) => {
      const updated = await tx`
        update social_walk_invites set status = 'accepted' where id = ${INVITE_ID} returning id, status
      `;
      expect(updated).toHaveLength(1);
      expect(updated[0].status).toBe('accepted');
    });
    await asApp(D.profileId, async (tx) => {
      expect(await tx`update social_walk_invites set status = 'declined' returning id`).toHaveLength(0);
    });
  });

  it('only the walk owner (A) can DELETE an invite; the invitee (B) deletes ZERO', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`delete from social_walk_invites returning id`).toHaveLength(0);
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`delete from social_walk_invites returning id`).toHaveLength(1);
    });
  });
});
