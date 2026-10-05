// Launch-request dedupe, part 2 — routines.
//
// Before: GET /api/routines?petId=X was fetched by TWO independent callers at launch — the Feed's
// "set your first reminder" checklist (useHasReminder, key ["routines","exist",X]) and the Health
// tab's routinesStore.loadRoutines — each with its own request.
// Now both go through ["routines", X]: a request already in flight is joined, and what
// loadRoutines reads refreshes the checklist too.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 5, name: "Mango" } }),
}));
jest.mock("@/hooks/useFetchHealthData", () => ({ useFoodLogs: () => ({ data: { logs: [] } }) }));
jest.mock("@/hooks/usePetSocialProfile", () => ({ usePetSocialProfile: () => ({ data: undefined }) }));
jest.mock("@/utils/notifications", () => ({
  ...jest.requireActual("@/utils/notifications"),
  getNotificationPermissionGranted: jest.fn(async () => false),
  requestNotificationPermissions: jest.fn(async () => false),
  ensureDailyReturnReminder: jest.fn(),
}));

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/queryClient";
import useRoutinesStore from "./routinesStore";
import useRemindersStore from "./remindersStore";
import { useGettingStarted } from "@/hooks/useGettingStarted";

const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const row = (id, petId) => ({
  id,
  pet_id: petId,
  routine_type: "feeding",
  is_active: true,
  title: "Feeding",
  frequency: "daily",
  times: ["08:00"],
  days: [],
  notification_enabled: false,
  feeding_schedule: [{ id: `m${id}`, name: "Breakfast", time: "08:00", frequency: "daily", reminderEnabled: false }],
});
const routinesCalls = () => global.fetch.mock.calls.filter(([u]) => String(u).startsWith("/api/routines"));

beforeEach(() => {
  queryClient.clear();
  useRoutinesStore.setState({ routines: [], initialized: false, loading: false, error: null });
  useRemindersStore.setState({ reminders: [], snoozes: {} });
});

test("the Feed checklist read and the Health tab's loadRoutines share ONE request per pet", async () => {
  let release;
  global.fetch = jest.fn(
    () => new Promise((resolve) => {
      release = () => resolve({ ok: true, status: 200, json: async () => ({ routines: [row(1, 5)] }) });
    }),
  );

  // Both mount in the same launch commit: Feed (checklist) + Health (loadRoutines).
  const { result } = renderHook(() => useGettingStarted(), { wrapper });
  const loading = useRoutinesStore.getState().loadRoutines(5);
  await act(async () => {});
  expect(routinesCalls()).toHaveLength(1); // was 2

  await act(async () => {
    release();
    await loading;
  });
  expect(routinesCalls()).toHaveLength(1);

  // The store is populated, and the checklist ticks "first reminder" from the same payload.
  expect(useRoutinesStore.getState().routines.map((r) => r.id)).toEqual(["1"]);
  await waitFor(() => {
    const items = Object.fromEntries(result.current.activation.items.map((i) => [i.key, i.done]));
    expect(items.reminder).toBe(true);
  });
});

test("loadRoutines is still a LIVE read: a second call after the first has finished refetches (edits / pull-to-refresh)", async () => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ routines: [row(1, 5)] }) }));
  await useRoutinesStore.getState().loadRoutines(5);
  await useRoutinesStore.getState().loadRoutines(5);
  expect(routinesCalls()).toHaveLength(2);
});

test("scoping: routines are cached per pet — pet 6 never gets pet 5's rows", async () => {
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({ routines: [String(url).includes("petId=5") ? row(1, 5) : row(2, 6)] }),
  }));
  await useRoutinesStore.getState().loadRoutines(5);
  expect(useRoutinesStore.getState().routines.map((r) => r.petId)).toEqual(["5"]);
  await useRoutinesStore.getState().loadRoutines(6);
  expect(useRoutinesStore.getState().routines.map((r) => r.petId)).toEqual(["6"]);
  expect(routinesCalls().map(([u]) => u)).toEqual(["/api/routines?petId=5", "/api/routines?petId=6"]);
});

test("a failed load still surfaces as an error + empty list (no retry, no mock fallback)", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = jest.fn(async () => ({ ok: false, statusText: "Service Unavailable" }));
  expect(await useRoutinesStore.getState().loadRoutines(5)).toEqual([]);
  expect(useRoutinesStore.getState().error).toContain("Service Unavailable");
  expect(routinesCalls()).toHaveLength(1);
});
