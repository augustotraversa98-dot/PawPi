// The ~48-alarm budget (PR5b 1C): soonest first across all dogs, capped, snoozes and the daily nudge never evicted.
import { selectAlarmsToArm, ROUTINE_ALARM_BUDGET, IOS_PENDING_LIMIT } from "./alarmBudget";

const MIN = 60_000;
const candidate = (n, extra = {}) => ({ id: `reminder_${n}`, fireAt: n * MIN, ...extra });
const pend = (identifier) => ({ identifier, content: { data: {} } });
const many = (count, from = 1) => Array.from({ length: count }, (_, i) => candidate(from + i));
const ids = (list) => list.map((c) => c.id);

describe("selectAlarmsToArm", () => {
  it("arms everything when there is room", () => {
    const { arm, cancel } = selectAlarmsToArm({ candidates: many(5) });
    expect(arm).toHaveLength(5);
    expect(cancel).toEqual([]);
  });

  it("takes the SOONEST ones, across dogs, whatever order they come in", () => {
    const dogA = many(40, 100); // later
    const dogB = many(40, 1); // sooner
    const { arm } = selectAlarmsToArm({ candidates: [...dogA, ...dogB] });
    expect(arm).toHaveLength(ROUTINE_ALARM_BUDGET);
    expect(ids(arm)).toEqual([...ids(dogB), ...ids(dogA.slice(0, 8))]);
  });

  it("never arms more than the budget, and leaves room under the iOS limit", () => {
    const { arm } = selectAlarmsToArm({ candidates: many(200) });
    expect(arm).toHaveLength(48);
    expect(IOS_PENDING_LIMIT - arm.length).toBeGreaterThanOrEqual(16);
  });

  it("cancels the known alarms that no longer make the cut", () => {
    const candidates = many(60);
    const pending = [pend("reminder_1"), pend("reminder_55"), pend("reminder_60")];
    const { cancel } = selectAlarmsToArm({
      candidates,
      pending,
      knownIds: new Set(ids(candidates)),
    });
    expect(cancel).toEqual(["reminder_55", "reminder_60"]);
  });

  it("cancels a known reminder that may not ring any more (done, off, muted)", () => {
    const { cancel } = selectAlarmsToArm({
      candidates: [],
      pending: [pend("reminder_3")],
      knownIds: new Set(["reminder_3"]),
    });
    expect(cancel).toEqual(["reminder_3"]);
  });

  it("a snooze is never evicted, even when it fires last", () => {
    const snooze = candidate(10_000, { snoozed: true });
    const { arm } = selectAlarmsToArm({ candidates: [...many(100), snooze] });
    expect(ids(arm)).toContain(snooze.id);
    expect(arm).toHaveLength(49); // the snooze on top of the 48
  });

  it("the daily nudge and other notifications are never cancelled and keep their place", () => {
    const others = [pend("pawpi-daily-return"), pend("telehealth_1_2"), pend("UUID-streak")];
    const candidates = many(100);
    const { arm, cancel } = selectAlarmsToArm({
      candidates,
      pending: [...others],
      knownIds: new Set(ids(candidates)),
    });
    expect(cancel).toEqual([]);
    expect(arm).toHaveLength(48);
    expect(arm.length + others.length).toBeLessThanOrEqual(IOS_PENDING_LIMIT);
  });

  it("many other notifications shrink the room, so the total never passes 64", () => {
    const others = Array.from({ length: 30 }, (_, i) => pend(`other-${i}`));
    const { arm } = selectAlarmsToArm({ candidates: many(100), pending: others });
    expect(arm.length + others.length).toBe(IOS_PENDING_LIMIT);
  });

  it("alarms of a dog not read yet are left alone and use up the budget", () => {
    const unknown = Array.from({ length: 20 }, (_, i) => pend(`reminder_other_${i}`));
    const candidates = many(100);
    const { arm, cancel } = selectAlarmsToArm({
      candidates,
      pending: unknown,
      knownIds: new Set(ids(candidates)),
    });
    expect(cancel).toEqual([]);
    expect(arm).toHaveLength(48 - 20);
  });

  it("an earlier snooze this phone no longer holds is protected and not counted against the 48", () => {
    const { arm, cancel } = selectAlarmsToArm({
      candidates: many(100),
      pending: [pend("reminder_old")],
      snoozedIds: new Set(["reminder_old"]),
    });
    expect(cancel).toEqual([]);
    expect(arm).toHaveLength(48);
  });

  it("never returns a negative number of slots", () => {
    const unknown = Array.from({ length: 80 }, (_, i) => pend(`reminder_x_${i}`));
    expect(selectAlarmsToArm({ candidates: many(3), pending: unknown }).arm).toEqual([]);
  });
});
