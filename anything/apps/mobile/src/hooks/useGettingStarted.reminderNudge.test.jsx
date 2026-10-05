// The Feed's activation state drives the first-reminder nudge: the hook hands the scheduler the ACTIVE
// pet and what it knows about reminders — undefined while the read is loading (so a loading state can
// never arm or cancel anything), false when the pet has no routine, true once it has one.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockArm = jest.fn(async () => []);
jest.mock("@/utils/engagementNotifications", () => ({
  maybeArmReminderSetupNudge: (...a) => mockArm(...a),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => "1"),
  setItem: jest.fn(async () => {}),
}));
let mockPet = { id: 7, name: "Mango" };
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: mockPet }) }));
jest.mock("@/hooks/useFetchHealthData", () => ({ useFoodLogs: () => ({ data: { logs: [] } }) }));
jest.mock("@/hooks/usePetSocialProfile", () => ({ usePetSocialProfile: () => ({ data: undefined }) }));
jest.mock("@/utils/notifications", () => ({
  getNotificationPermissionGranted: jest.fn(async () => true),
  requestNotificationPermissions: jest.fn(async () => true),
  ensureDailyReturnReminder: jest.fn(),
}));

import { useGettingStarted } from "./useGettingStarted";

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const lastCall = () => mockArm.mock.calls[mockArm.mock.calls.length - 1]?.[0];

beforeEach(() => {
  mockArm.mockClear();
  mockPet = { id: 7, name: "Mango" };
});

test("while the routines read is loading the scheduler is told 'unknown' (undefined), never false", async () => {
  global.fetch = jest.fn(() => new Promise(() => {})); // never resolves
  renderHook(() => useGettingStarted(), { wrapper });
  await waitFor(() => expect(mockArm).toHaveBeenCalled());
  expect(mockArm.mock.calls.every(([a]) => a.hasReminder === undefined)).toBe(true);
});

test("a pet with no routine → hasReminder false, for THAT pet, once permission is known", async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ routines: [] }) }));
  renderHook(() => useGettingStarted(), { wrapper });
  await waitFor(() => expect(lastCall()).toMatchObject({ petId: 7, petName: "Mango", hasReminder: false, permissionGranted: true }));
});

test("a pet that has a routine → hasReminder true (the scheduler cancels the nudge)", async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ routines: [{ id: 1 }] }) }));
  renderHook(() => useGettingStarted(), { wrapper });
  await waitFor(() => expect(lastCall()).toMatchObject({ petId: 7, hasReminder: true }));
});

test("no active pet → the scheduler is not called at all", async () => {
  mockPet = undefined;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ routines: [] }) }));
  renderHook(() => useGettingStarted(), { wrapper });
  await new Promise((r) => setTimeout(r, 50));
  expect(mockArm).not.toHaveBeenCalled();
});
