// How many REQUESTS does the alarm refresh send? (night run #7, item 2.) The refresh itself is pinned in useReminderReconcile.test.jsx
// with a stubbed store; this file runs the REAL hook, routines store and reminders store and counts what reaches `fetch`, per dog, for
//   • app launch (pet select + every other dog once), and
//   • each return to the app (after a real trip to the background),
// for a dog with only feeding routines (no persistent task) and for the worst case (all four persistent sources).
// The numbers are written into docs/night-run/2026-11-27/REPORT.md; the assertions pin them so a future change cannot add requests unseen.

import { renderHook, act } from "@testing-library/react-native";
import { AppState } from "react-native";

const mockPending = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async (req) => {
    const i = mockPending.findIndex((p) => p.identifier === req.identifier);
    if (i >= 0) mockPending.splice(i, 1);
    mockPending.push({ identifier: req.identifier, content: req.content, trigger: req.trigger });
    return req.identifier;
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockPending.slice()),
  cancelScheduledNotificationAsync: jest.fn(async (id) => {
    const i = mockPending.findIndex((p) => p.identifier === id);
    if (i >= 0) mockPending.splice(i, 1);
  }),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));

let mockPets;
let mockCurrent;
jest.mock("./usePetProfile", () => ({
  usePetProfile: () => ({ data: mockPets }),
  useCurrentPet: () => ({ data: mockCurrent }),
}));

import { useReminderReconcile, FOREGROUND_MIN_GAP_MS } from "./useReminderReconcile";
import useRoutinesStore from "@/store/routinesStore";
import useRemindersStore from "@/store/remindersStore";
import { resetPetAccessMemory } from "@/store/petAccessStore";
import { queryClient } from "@/utils/queryClient";
import useReminderMuteStore, { whenReminderMutesReady } from "@/store/reminderMuteStore";
import { useAuthStore } from "@/utils/auth/store";

const NOW = new Date(2026, 5, 10, 12, 0, 0);

const feeding = (petId) => ({
  id: petId * 10 + 1,
  pet_id: petId,
  routine_type: "feeding",
  is_active: true,
  title: "Meals",
  notification_enabled: true,
  feeding_schedule: [{ id: `m${petId}`, name: "Dinner", time: "20:00", frequency: "daily", reminderEnabled: true }],
});
// The four routine types whose instances the household can resolve (utils/householdResolution): each adds one log read.
const persistent = (petId) => [
  {
    id: petId * 10 + 2,
    pet_id: petId,
    routine_type: "wellness_check",
    is_active: true,
    title: "Wellness",
    notification_enabled: true,
    wellness_check_schedule: [
      { checkType: "general", frequency: "daily", preferredTime: "20:00", reminderEnabled: true },
      { checkType: "weight", frequency: "daily", preferredTime: "20:00", reminderEnabled: true },
    ],
  },
  {
    id: petId * 10 + 3,
    pet_id: petId,
    routine_type: "medical_care",
    is_active: true,
    title: "Care",
    notification_enabled: true,
    medical_care_details: {
      medicalCareItems: [
        { id: `c${petId}`, type: "vaccine", name: "Rabies", nextDue: "2026-06-20", reminderEnabled: true, active: true },
      ],
    },
  },
  {
    id: petId * 10 + 4,
    pet_id: petId,
    routine_type: "photo_check",
    is_active: true,
    title: "Photos",
    notification_enabled: true,
    photo_check_details: {
      photoCheckSchedule: [{ bodyArea: "eyes", frequency: "daily", preferredTime: "20:00", reminderEnabled: true }],
    },
  },
];

let requests; // [{ petId, kind }]
let appState;
const serve = (rowsByPet) => {
  requests = [];
  global.fetch = jest.fn(async (url) => {
    const u = new URL(String(url), "http://x");
    const petId = Number(u.searchParams.get("petId"));
    const kind = u.pathname.replace(/^\/api\//, "");
    requests.push({ petId, kind });
    if (kind === "routines") return { ok: true, json: async () => ({ routines: rowsByPet[petId] ?? [] }) };
    return { ok: true, json: async () => ({ logs: [], photoChecks: [] }) };
  });
};
const perDog = () => {
  const out = {};
  for (const r of requests) (out[r.petId] ??= []).push(r.kind);
  return out;
};
const counts = () => Object.fromEntries(Object.entries(perDog()).map(([id, kinds]) => [id, kinds.length]));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }).setSystemTime(NOW);
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockPending.length = 0;
  queryClient.clear();
  resetPetAccessMemory();
  useRoutinesStore.setState({ routines: [], initialized: false, loading: false, error: null });
  useRemindersStore.setState({ reminders: [], snoozes: {}, resolvedByPet: {} });
  appState = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, handler) => {
    appState = handler;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  });
};
const returnToApp = async () => {
  jest.setSystemTime(Date.now() + FOREGROUND_MIN_GAP_MS + 1000);
  await act(async () => {
    appState("background");
    appState("active");
  });
  await settle();
};

const OWN = (id) => ({ id, name: `Dog${id}`, is_shared: false });

test("a dog with only feeding routines: 1 request at launch, 1 per return to the app", async () => {
  mockPets = [OWN(1)];
  mockCurrent = mockPets[0];
  serve({ 1: [feeding(1)] });
  renderHook(() => useReminderReconcile());
  await settle();
  expect(counts()).toEqual({ 1: 1 });
  requests.length = 0;
  await returnToApp();
  expect(counts()).toEqual({ 1: 1 });
  expect(perDog()[1]).toEqual(["routines"]);
});

test("worst case (wellness + weight + medical care + photo checks): 5 requests per dog, at launch and at each return", async () => {
  mockPets = [OWN(1)];
  mockCurrent = mockPets[0];
  serve({ 1: [feeding(1), ...persistent(1)] });
  renderHook(() => useReminderReconcile());
  await settle();
  expect(perDog()[1].slice().sort()).toEqual(
    ["health/medical-care-logs", "health/photo-checks", "health/weight-logs", "health/wellness-logs", "routines"].sort(),
  );
  requests.length = 0;
  await returnToApp();
  expect(counts()).toEqual({ 1: 5 });
});

test("three dogs, worst case: 15 requests at launch and 15 per return; the requests scale with the dogs, not with the returns' timing", async () => {
  mockPets = [OWN(1), OWN(2), OWN(3)];
  mockCurrent = mockPets[0];
  serve({ 1: [feeding(1), ...persistent(1)], 2: [feeding(2), ...persistent(2)], 3: [feeding(3), ...persistent(3)] });
  renderHook(() => useReminderReconcile());
  await settle();
  expect(counts()).toEqual({ 1: 5, 2: 5, 3: 5 });
  requests.length = 0;
  await returnToApp();
  expect(counts()).toEqual({ 1: 5, 2: 5, 3: 5 });
});

test("returns closer together than FOREGROUND_MIN_GAP_MS send nothing", async () => {
  mockPets = [OWN(1), OWN(2)];
  mockCurrent = mockPets[0];
  serve({ 1: [feeding(1), ...persistent(1)], 2: [feeding(2), ...persistent(2)] });
  renderHook(() => useReminderReconcile());
  await settle();
  await returnToApp();
  requests.length = 0;
  await act(async () => {
    appState("background");
    appState("active");
  });
  await settle();
  expect(requests).toEqual([]);
});

test("one of the three dogs has reminders switched OFF and is not on screen: its 5 requests are gone, launch and every return (15 -> 10)", async () => {
  useAuthStore.setState({ auth: { jwt: "a", user: { id: 1 } } });
  useReminderMuteStore.setState({ mutedByUser: { 1: ["3"] } });
  await useReminderMuteStore.persist.rehydrate();
  await whenReminderMutesReady();
  useReminderMuteStore.setState({ mutedByUser: { 1: ["3"] } });
  try {
    mockPets = [OWN(1), OWN(2), OWN(3)];
    mockCurrent = mockPets[0];
    serve({ 1: [feeding(1), ...persistent(1)], 2: [feeding(2), ...persistent(2)], 3: [feeding(3), ...persistent(3)] });
    renderHook(() => useReminderReconcile());
    await settle();
    expect(counts()).toEqual({ 1: 5, 2: 5 });
    requests.length = 0;
    await returnToApp();
    expect(counts()).toEqual({ 1: 5, 2: 5 });
  } finally {
    useReminderMuteStore.setState({ mutedByUser: {} });
  }
});
