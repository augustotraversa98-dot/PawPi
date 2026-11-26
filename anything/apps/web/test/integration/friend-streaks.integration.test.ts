// A friend's current streak (migration 0155), through the REAL Hono router on real Postgres as pawpi_app
// (FORCE RLS).
//
// Proves: only a FRIEND of one of the viewer's own dogs (follow / accepted friendship / active pack) is
// returned; never the viewer's own dog, across a block, or for a banned owner; only a TRUE current streak
// of 7 or more (same missed-day, rest, pause, freeze and time-zone rules as app_advance_care_streak,
// without writing); only the pet id and the number come back; the endpoint answers "not available" on a
// database without the function; re-applying the migration is harmless; verify_0155 reads all PASS.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const VIEWER = { authUserId: 1, profileId: 1, username: "viewer", petId: 1, petName: "Rex" };
const FRIEND = { authUserId: 2, profileId: 2, username: "friend", petId: 2, petName: "Bella" };
const OTHER = { authUserId: 3, profileId: 3, username: "other", petId: 3, petName: "Coco" };
const DEFAULT_TZ = "America/Buenos_Aires";

const MIGRATION = path.join(MIGRATIONS_DIR, "0155_friend_streaks.sql");
const VERIFY = path.join(MIGRATIONS_DIR, "..", "verify_0155.sql");

let raw: Sql;
let api: any;
const as = (u: { authUserId: number }) => {
  authState.session = { user: { id: u.authUserId } };
};

async function fetchStreaks(ids: Array<number | string>) {
  const res = await api.request(`/posts/friend-streaks?petIds=${ids.join(",")}`);
  return { status: res.status, body: await res.json() };
}
// { [petId]: streak } as the signed-in viewer sees it.
async function seen(...ids: number[]) {
  const { status, body } = await fetchStreaks(ids.length ? ids : [FRIEND.petId]);
  expect(status).toBe(200);
  expect(body.available).toBe(true);
  return Object.fromEntries(body.streaks.map((s: any) => [s.pet_id, s.streak]));
}

type Streak = {
  count?: number;
  daysAgo?: number | null; // last_closed_day = owner's local today - daysAgo
  freezes?: number;
  pausedDaysAgo?: number | null; // paused_until = owner's local today - pausedDaysAgo
  tz?: string;
};
async function setStreak(
  who: { petId: number; profileId: number },
  { count = 10, daysAgo = 1, freezes = 0, pausedDaysAgo = null, tz = DEFAULT_TZ }: Streak = {},
) {
  await raw`delete from pet_streaks where pet_id = ${who.petId}`;
  await raw`
    insert into pet_streaks
      (pet_id, owner_user_id, current_count, longest_count, last_closed_day, freezes_available, paused_until)
    values (
      ${who.petId}, ${who.profileId}, ${count}, ${count},
      (now() at time zone ${tz})::date - ${daysAgo}::int, ${freezes},
      (now() at time zone ${tz})::date - ${pausedDaysAgo}::int
    )`;
}
async function restDay(who: { petId: number; profileId: number }, daysAgo: number) {
  await raw`
    insert into pet_care_days (pet_id, owner_user_id, day, rest_day)
    values (${who.petId}, ${who.profileId}, (now() at time zone ${DEFAULT_TZ})::date - ${daysAgo}::int, true)`;
}
const follow = (from: number, to: number) =>
  raw`insert into pet_follows (follower_pet_id, followed_pet_id) values (${from}, ${to})`;
const friendship = (status: string, from = VIEWER, to = FRIEND) =>
  raw`insert into pet_friendships (requester_user_id, receiver_user_id, requester_pet_id, receiver_pet_id, status)
      values (${from.profileId}, ${to.profileId}, ${from.petId}, ${to.petId}, ${status})`;
const pack = (status: string, from = VIEWER, to = FRIEND) =>
  raw`insert into pet_pack_streaks (requester_user_id, receiver_user_id, requester_pet_id, receiver_pet_id, status)
      values (${from.profileId}, ${to.profileId}, ${from.petId}, ${to.petId}, ${status})`;

// The function itself, as pawpi_app, with (or without) a request identity.
async function callAs(profileId: number | null, ids: number[]) {
  return raw.begin(async (tx) => {
    await tx`set local role pawpi_app`;
    if (profileId != null) {
      await tx`select set_config('app.current_user_id', ${String(profileId)}, true)`;
    }
    return tx`select * from app_friend_streaks(${ids}::int[])`;
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => {
  await raw.end();
});
beforeEach(async () => {
  for (const u of [VIEWER, FRIEND, OTHER]) await seedOwnerWithPet(raw, u);
  as(VIEWER);
});
afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

describe("who is a friend", () => {
  beforeEach(async () => {
    await setStreak(FRIEND, { count: 12 });
  });

  it("a dog the viewer's dog FOLLOWS shows its number, and nothing but the pet id and the number", async () => {
    await follow(VIEWER.petId, FRIEND.petId);
    const { status, body } = await fetchStreaks([FRIEND.petId]);
    expect(status).toBe(200);
    expect(body).toEqual({ available: true, streaks: [{ pet_id: FRIEND.petId, streak: 12 }] });
  });

  it("a stranger shows nothing, and so does a dog that only follows the viewer", async () => {
    expect(await seen()).toEqual({});
    await follow(FRIEND.petId, VIEWER.petId);
    expect(await seen()).toEqual({});
  });

  it("an accepted friendship counts in either direction; a pending one does not", async () => {
    await friendship("pending");
    expect(await seen()).toEqual({});
    await raw`delete from pet_friendships`;
    await friendship("accepted");
    expect(await seen()).toEqual({ [FRIEND.petId]: 12 });
    await raw`delete from pet_friendships`;
    await friendship("accepted", FRIEND, VIEWER);
    expect(await seen()).toEqual({ [FRIEND.petId]: 12 });
  });

  it("an ACTIVE pack counts in either direction; a pending or ended one does not", async () => {
    for (const status of ["pending", "ended"]) {
      await raw`delete from pet_pack_streaks`;
      await pack(status);
      expect(await seen()).toEqual({});
    }
    await raw`delete from pet_pack_streaks`;
    await pack("active");
    expect(await seen()).toEqual({ [FRIEND.petId]: 12 });
    await raw`delete from pet_pack_streaks`;
    await pack("active", FRIEND, VIEWER);
    expect(await seen()).toEqual({ [FRIEND.petId]: 12 });
  });

  it("never the viewer's own dog, even when another of their dogs follows it", async () => {
    await raw`insert into pets (id, owner_user_id, name, handle) values (11, ${VIEWER.profileId}, 'Luna', 'viewer-luna')`;
    await setStreak({ petId: 11, profileId: VIEWER.profileId }, { count: 30 });
    await setStreak(VIEWER, { count: 30 });
    await follow(VIEWER.petId, 11);
    await follow(11, VIEWER.petId);
    expect(await seen(VIEWER.petId, 11)).toEqual({});
  });

  it("a follow from ANY of the viewer's own dogs counts", async () => {
    await raw`insert into pets (id, owner_user_id, name, handle) values (11, ${VIEWER.profileId}, 'Luna', 'viewer-luna')`;
    await follow(11, FRIEND.petId);
    expect(await seen()).toEqual({ [FRIEND.petId]: 12 });
  });

  it("answers a whole list in one call and returns only the dogs that qualify", async () => {
    await setStreak(OTHER, { count: 50 }); // not a friend
    await follow(VIEWER.petId, FRIEND.petId);
    expect(await seen(FRIEND.petId, OTHER.petId, VIEWER.petId, 999)).toEqual({ [FRIEND.petId]: 12 });
  });

  it("someone else's friendships do not open anything for this viewer", async () => {
    await follow(OTHER.petId, FRIEND.petId);
    await friendship("accepted", OTHER, FRIEND);
    expect(await seen()).toEqual({});
    as(OTHER);
    expect(await seen()).toEqual({ [FRIEND.petId]: 12 });
  });
});

describe("blocks and bans", () => {
  beforeEach(async () => {
    await setStreak(FRIEND, { count: 12 });
    await follow(VIEWER.petId, FRIEND.petId);
    await friendship("accepted");
    await pack("active");
  });

  it.each([
    ["the viewer blocked the owner", VIEWER.profileId, FRIEND.profileId],
    ["the owner blocked the viewer", FRIEND.profileId, VIEWER.profileId],
  ])("nothing when %s", async (_label, blocker, blocked) => {
    await raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${blocker}, ${blocked})`;
    expect(await seen()).toEqual({});
    // An undone block (soft delete) shows it again.
    await raw`update user_blocks set deleted_at = now()`;
    expect(await seen()).toEqual({ [FRIEND.petId]: 12 });
  });

  it("nothing when a friendship row between the two owners is marked blocked", async () => {
    await raw`delete from pet_friendships`;
    await friendship("blocked", FRIEND, VIEWER);
    expect(await seen()).toEqual({});
  });

  it("nothing for a banned owner", async () => {
    await raw`update user_profiles set banned_at = now() where id = ${FRIEND.profileId}`;
    expect(await seen()).toEqual({});
  });
});

describe("the TRUE current streak", () => {
  beforeEach(async () => {
    await follow(VIEWER.petId, FRIEND.petId);
  });

  it("7 or more shows; 6 shows nothing", async () => {
    await setStreak(FRIEND, { count: 6 });
    expect(await seen()).toEqual({});
    await setStreak(FRIEND, { count: 7 });
    expect(await seen()).toEqual({ [FRIEND.petId]: 7 });
  });

  it("closed today or yesterday is alive; a missed day with no freeze is broken", async () => {
    await setStreak(FRIEND, { daysAgo: 0 });
    expect(await seen()).toEqual({ [FRIEND.petId]: 10 });
    await setStreak(FRIEND, { daysAgo: 1 });
    expect(await seen()).toEqual({ [FRIEND.petId]: 10 });
    await setStreak(FRIEND, { daysAgo: 2 });
    expect(await seen()).toEqual({});
    await setStreak(FRIEND, { daysAgo: 200, freezes: 2 });
    expect(await seen()).toEqual({});
  });

  it("banked freezes cover exactly that many missed days", async () => {
    await setStreak(FRIEND, { daysAgo: 3, freezes: 2 });
    expect(await seen()).toEqual({ [FRIEND.petId]: 10 });
    await setStreak(FRIEND, { daysAgo: 4, freezes: 2 });
    expect(await seen()).toEqual({});
  });

  it("rest days and a pause are never misses", async () => {
    await setStreak(FRIEND, { daysAgo: 4 });
    await restDay(FRIEND, 3);
    await restDay(FRIEND, 2);
    expect(await seen()).toEqual({}); // yesterday is still a miss
    await restDay(FRIEND, 1);
    expect(await seen()).toEqual({ [FRIEND.petId]: 10 });

    await raw`delete from pet_care_days`;
    await setStreak(FRIEND, { daysAgo: 20, pausedDaysAgo: 1 });
    expect(await seen()).toEqual({ [FRIEND.petId]: 10 });
    await setStreak(FRIEND, { daysAgo: 20, pausedDaysAgo: 2 });
    expect(await seen()).toEqual({});
  });

  it("the day boundary is the OWNER's time zone", async () => {
    // These two zones are 25 hours apart, so their calendar dates always differ.
    const west = "Pacific/Pago_Pago";
    const east = "Pacific/Kiritimati";
    await setStreak(FRIEND, { daysAgo: 1, tz: west });
    await raw`update user_profiles set timezone = ${west} where id = ${FRIEND.profileId}`;
    await raw`update user_profiles set timezone = ${east} where id = ${VIEWER.profileId}`;
    expect(await seen()).toEqual({ [FRIEND.petId]: 10 });
    await raw`update user_profiles set timezone = ${east} where id = ${FRIEND.profileId}`;
    expect(await seen()).toEqual({});
  });

  it("a reset run is hidden until a repair brings it back to 7 or more", async () => {
    await setStreak(FRIEND, { count: 1, daysAgo: 0 });
    await raw`update pet_streaks set pre_reset_count = 9, reset_at = now() where pet_id = ${FRIEND.petId}`;
    expect(await seen()).toEqual({});
    await raw`select app_repair_care_streak(${FRIEND.petId}, ${FRIEND.profileId})`;
    expect(await seen()).toEqual({ [FRIEND.petId]: 10 });
  });

  it("never changes the stored streak (read-only)", async () => {
    await setStreak(FRIEND, { daysAgo: 3, freezes: 2 });
    const before = await raw`select * from pet_streaks`;
    await seen();
    expect(await raw`select * from pet_streaks`).toEqual(before);
    expect(await raw`select * from pet_care_days`).toHaveLength(0);
  });

  it.each([
    [{ daysAgo: 1, freezes: 0 }, [] as number[]],
    [{ daysAgo: 3, freezes: 2 }, []],
    [{ daysAgo: 3, freezes: 1 }, []],
    [{ daysAgo: 5, freezes: 1 }, [4, 3, 2]],
    [{ daysAgo: 5, freezes: 2 }, [3, 2]],
    [{ daysAgo: 6, freezes: 0, pausedDaysAgo: 3 }, [2, 1]],
    [{ daysAgo: 6, freezes: 0, pausedDaysAgo: 3 }, [1]],
  ])("agrees with app_advance_care_streak on %o (rest days %o)", async (state, rest) => {
    await setStreak(FRIEND, state);
    for (const d of rest) await restDay(FRIEND, d);
    const shown = (await seen())[FRIEND.petId] != null;
    // What closing today's ring would do to the same stored state: continue the run, or reset it.
    const [after] = await raw`
      select current_count from app_advance_care_streak(
        ${FRIEND.petId}, ${FRIEND.profileId}, (now() at time zone ${DEFAULT_TZ})::date)`;
    expect(shown).toBe(after.current_count === 11);
  });
});

describe("the database function and the endpoint", () => {
  beforeEach(async () => {
    await setStreak(FRIEND, { count: 12 });
    await follow(VIEWER.petId, FRIEND.petId);
  });

  it("as pawpi_app: the identity decides; no identity returns nothing", async () => {
    expect(await callAs(VIEWER.profileId, [FRIEND.petId])).toEqual([{ pet_id: FRIEND.petId, streak: 12 }]);
    expect(await callAs(OTHER.profileId, [FRIEND.petId])).toEqual([]);
    expect(await callAs(null, [FRIEND.petId])).toEqual([]);
  });

  it("the viewer still cannot read the friend's streak row directly (own-row policy unchanged)", async () => {
    const rows = await raw.begin(async (tx) => {
      await tx`set local role pawpi_app`;
      await tx`select set_config('app.current_user_id', ${String(VIEWER.profileId)}, true)`;
      return tx`select * from pet_streaks where pet_id = ${FRIEND.petId}`;
    });
    expect(rows).toEqual([]);
  });

  it("needs a session; ignores junk ids; an empty list is an empty answer", async () => {
    expect((await fetchStreaks(["abc", "-1", "0", "99999999999"])).body).toEqual({ available: true, streaks: [] });
    expect((await fetchStreaks(["abc", FRIEND.petId])).body.streaks).toEqual([{ pet_id: FRIEND.petId, streak: 12 }]);
    authState.session = null;
    expect((await fetchStreaks([FRIEND.petId])).status).toBe(401);
  });

  it("before the migration: 200, available false, no streaks; re-applying it (twice) restores it", async () => {
    const text = await readFile(MIGRATION, "utf8");
    await raw`drop function app_friend_streaks(integer[])`;
    try {
      const { status, body } = await fetchStreaks([FRIEND.petId]);
      expect(status).toBe(200);
      expect(body).toEqual({ available: false, streaks: [] });
    } finally {
      await raw.unsafe(text);
    }
    await raw.unsafe(text);
    expect(await seen()).toEqual({ [FRIEND.petId]: 12 });
  });

  it("verify_0155.sql reads all PASS", async () => {
    const rows = await raw.unsafe(await readFile(VERIFY, "utf8"));
    expect(rows).toHaveLength(5);
    expect(rows.filter((r: any) => r.status !== "PASS")).toEqual([]);
  });
});
