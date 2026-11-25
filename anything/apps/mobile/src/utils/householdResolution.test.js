// Another member logged it: which of this phone's instances are done (persistent types only).
import { fetchResolvedIds, resolutionCandidates } from "./householdResolution";
import { generateRemindersFromRoutine } from "./reminderGenerator";

const NOW = new Date(2026, 5, 10, 12, 0, 0);
const wellness = {
  id: "100",
  petId: "7",
  type: "wellness_check",
  isActive: true,
  notificationEnabled: true,
  createdAt: new Date(2026, 5, 1).toISOString(),
  wellnessCheckItems: [
    { checkType: "general", frequency: "daily", preferredTime: "20:00", reminderEnabled: true },
    { checkType: "weight", frequency: "daily", preferredTime: "21:00", reminderEnabled: true },
  ],
};
const feeding = {
  id: "200",
  petId: "7",
  type: "feeding",
  isActive: true,
  notificationEnabled: true,
  meals: [{ id: "m", name: "Dinner", time: "20:00", frequency: "daily", reminderEnabled: true }],
};
const serve = (byPath) => {
  global.fetch = jest.fn(async (url) => {
    const path = String(url).split("/api/health/")[1].split("?")[0];
    const body = byPath[path];
    if (body === undefined) return { ok: true, json: async () => ({ logs: [], photoChecks: [] }) };
    if (body === null) return { ok: false, status: 500 };
    return { ok: true, json: async () => body };
  });
};

beforeEach(() => jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }).setSystemTime(NOW));
afterEach(() => jest.useRealTimers());

const generated = () => [wellness, feeding].flatMap((r) => generateRemindersFromRoutine(r));
const generalToday = () =>
  generated().find((r) => r.type === "wellness_check" && r.checkType === "general");
const weightToday = () =>
  generated().find((r) => r.type === "wellness_check" && r.checkType === "weight");
const scheduledDay = "2026-06-10";

it("only persistent types are candidates: feeding is left alone", () => {
  const candidates = resolutionCandidates(generated(), [wellness, feeding]);
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.every((r) => r.type === "wellness_check")).toBe(true);
});

it("a wellness log for today's item resolves that instance and no other", async () => {
  serve({
    "wellness-logs": {
      logs: [{ routine_id: 100, wellness_check_item_index: 0, values_json: { scheduledDate: scheduledDay } }],
    },
  });
  const { resolved, complete } = await fetchResolvedIds(7, resolutionCandidates(generated(), [wellness]));
  expect(complete).toBe(true);
  expect([...resolved]).toEqual([generalToday().id]);
});

it("a weigh-in today resolves today's weight check, not tomorrow's", async () => {
  serve({ "weight-logs": { logs: [{ logged_at: NOW.toISOString() }] } });
  const { resolved } = await fetchResolvedIds(7, resolutionCandidates(generated(), [wellness]));
  expect([...resolved]).toEqual([weightToday().id]);
});

it("asks only for the logs the instances need", async () => {
  serve({});
  await fetchResolvedIds(7, resolutionCandidates(generated(), [wellness]));
  const asked = global.fetch.mock.calls.map(([u]) => String(u).split("?")[0]).sort();
  expect(asked).toEqual(["/api/health/weight-logs", "/api/health/wellness-logs"]);
});

it("nothing persistent, nothing fetched", async () => {
  serve({});
  await fetchResolvedIds(7, resolutionCandidates(generateRemindersFromRoutine(feeding), [feeding]));
  expect(global.fetch).not.toHaveBeenCalled();
});

it("a failed read resolves nothing from it and says the answer is incomplete", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  serve({ "wellness-logs": null, "weight-logs": { logs: [{ logged_at: NOW.toISOString() }] } });
  const { resolved, complete } = await fetchResolvedIds(7, resolutionCandidates(generated(), [wellness]));
  expect(complete).toBe(false);
  expect([...resolved]).toEqual([weightToday().id]);
});

it("a snoozed PAST instance is a candidate too", () => {
  const evening = new Date(2026, 5, 10, 20, 30);
  const upcoming = generateRemindersFromRoutine(wellness).filter((r) => r.id !== generalToday().id);
  const later = new Date(2026, 5, 10, 22).toISOString();
  const ids = resolutionCandidates(upcoming, [wellness], { [generalToday().id]: later }, evening).map((r) => r.id);
  expect(ids).toContain(generalToday().id);
});
