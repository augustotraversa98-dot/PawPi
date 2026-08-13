// Unit E2 — streak + forgiveness — proven on real Postgres. The streak math lives in the DEFINER
// helpers app_advance_care_streak / app_repair_care_streak (the single source of truth), tested here
// deterministically, plus the route wiring (closing the ring advances the streak; POST repairs it).
//
// Guardrails proven: consecutive closes count up; a missed NON-excused day auto-consumes a banked
// freeze; a gap wider than the bank resets to 1 (then one-tap repair restores it); a rest_day or a
// paused day is NEVER a miss; milestones bank a freeze once (idempotent); advancing twice in a day
// does not double-count.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Call the DEFINER advance helper directly and return the pet_streaks row.
const advance = (pet: number, owner: number, day: string) =>
  raw`select * from app_advance_care_streak(${pet}, ${owner}, ${day}::date)`.then((r: any) => r[0]);
const repair = (pet: number, owner: number) =>
  raw`select * from app_repair_care_streak(${pet}, ${owner})`.then((r: any) => r[0]);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
});

describe("E2 — streak advance (forgiveness math)", () => {
  it("consecutive closes count up; the same day is idempotent", async () => {
    expect((await advance(OWNER.petId, OWNER.profileId, "2026-08-10")).current_count).toBe(1);
    expect((await advance(OWNER.petId, OWNER.profileId, "2026-08-10")).current_count).toBe(1); // idempotent
    expect((await advance(OWNER.petId, OWNER.profileId, "2026-08-11")).current_count).toBe(2);
    const r = await advance(OWNER.petId, OWNER.profileId, "2026-08-12");
    expect(r.current_count).toBe(3);
    expect(r.longest_count).toBe(3);
  });

  it("a missed non-excused day auto-consumes a banked freeze (default 1)", async () => {
    await advance(OWNER.petId, OWNER.profileId, "2026-08-10"); // 1, freezes 1
    const r = await advance(OWNER.petId, OWNER.profileId, "2026-08-12"); // 08-11 missed → bridge
    expect(r.current_count).toBe(2);
    expect(r.freezes_available).toBe(0);
  });

  it("a gap with no freeze resets to 1, and repair restores the run once", async () => {
    await advance(OWNER.petId, OWNER.profileId, "2026-08-10"); // 1, freezes 1
    await advance(OWNER.petId, OWNER.profileId, "2026-08-12"); // 2, freezes 0 (bridged 08-11)
    const reset = await advance(OWNER.petId, OWNER.profileId, "2026-08-14"); // 08-13 missed, no freeze
    expect(reset.current_count).toBe(1);
    expect(reset.pre_reset_count).toBe(2);
    expect(reset.reset_at).not.toBeNull();

    const repaired = await repair(OWNER.petId, OWNER.profileId);
    expect(repaired.current_count).toBe(3); // pre_reset (2) + current (1)
    expect(repaired.reset_at).toBeNull();
    // repair is one-shot: a second call is a no-op
    expect((await repair(OWNER.petId, OWNER.profileId)).current_count).toBe(3);
  });

  it("a rest_day is never a miss", async () => {
    await advance(OWNER.petId, OWNER.profileId, "2026-08-10"); // 1, freezes 1
    await raw`insert into pet_care_days (pet_id, owner_user_id, day, rest_day) values (${OWNER.petId}, ${OWNER.profileId}, '2026-08-11', true)`;
    const r = await advance(OWNER.petId, OWNER.profileId, "2026-08-12"); // 08-11 excused
    expect(r.current_count).toBe(2);
    expect(r.freezes_available).toBe(1); // no freeze consumed
  });

  it("a paused day (<= paused_until) is never a miss", async () => {
    await advance(OWNER.petId, OWNER.profileId, "2026-08-10"); // 1
    await raw`update pet_streaks set paused_until = '2026-08-13' where pet_id = ${OWNER.petId}`;
    const r = await advance(OWNER.petId, OWNER.profileId, "2026-08-14"); // 08-11..08-13 excused by pause
    expect(r.current_count).toBe(2);
    expect(r.freezes_available).toBe(1);
  });

  it("a milestone (7) banks one freeze, once (capped, idempotent)", async () => {
    // Prime the row at 6 with no freezes, then close day 7.
    await raw`insert into pet_streaks (pet_id, owner_user_id, current_count, longest_count, last_closed_day, freezes_available, last_award_count)
              values (${OWNER.petId}, ${OWNER.profileId}, 6, 6, '2026-08-16', 0, 0)`;
    const r = await advance(OWNER.petId, OWNER.profileId, "2026-08-17");
    expect(r.current_count).toBe(7);
    expect(r.freezes_available).toBe(1); // milestone award
    expect(r.last_award_count).toBe(7);
    // same-day re-advance does not re-award
    const again = await advance(OWNER.petId, OWNER.profileId, "2026-08-17");
    expect(again.freezes_available).toBe(1);
  });
});

describe("E2 — streak wired into the ring route", () => {
  beforeEach(() => { authState.session = sessionFor(OWNER.authUserId); });
  const DAY = "2026-08-13";
  const NOON = `${DAY} 12:00:00+00`;

  it("closing the ring via GET advances the streak in the response", async () => {
    await raw`insert into health_walk_logs (pet_id, owner_user_id, start_time) values (${OWNER.petId}, ${OWNER.profileId}, ${NOON})`;
    await raw`insert into posts (user_id, pet_id, is_daily_update, post_date) values (${OWNER.profileId}, ${OWNER.petId}, true, ${DAY})`;
    await raw`insert into health_food_logs (pet_id, owner_user_id, logged_at) values (${OWNER.petId}, ${OWNER.profileId}, ${NOON})`;
    const b = await (await apiReq(`/pets/${OWNER.petId}/care-ring?day=${DAY}`)).json();
    expect(b.ring_closed).toBe(true);
    expect(b.streak?.current_count).toBe(1);
  });

  it("POST repair_streak restores a reset streak", async () => {
    await raw`insert into pet_streaks (pet_id, owner_user_id, current_count, longest_count, pre_reset_count, reset_at)
              values (${OWNER.petId}, ${OWNER.profileId}, 1, 5, 5, now())`;
    const b = await (await apiReq(`/pets/${OWNER.petId}/care-ring`, "POST", { action: "repair_streak" })).json();
    expect(b.streak?.current_count).toBe(6); // 5 + 1
  });
});
