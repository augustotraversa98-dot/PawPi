// When are a dog's routines re-read (and so its alarms re-armed) without anybody opening Health?
import { renderHook, act } from "@testing-library/react-native";
import { AppState } from "react-native";

let mockPets;
let mockCurrent;
jest.mock("./usePetProfile", () => ({
  usePetProfile: () => ({ data: mockPets }),
  useCurrentPet: () => ({ data: mockCurrent }),
}));
const mockLoad = jest.fn(async () => []);
jest.mock("@/store/routinesStore", () => ({
  __esModule: true,
  default: { getState: () => ({ loadRoutines: mockLoad }) },
}));

import { useReminderReconcile, FOREGROUND_MIN_GAP_MS } from "./useReminderReconcile";

const OWN = { id: 1, name: "Mango", is_shared: false };
const SHARED = { id: 7, name: "Luna", is_shared: true };
const SHOWN = { silent: true, coalesce: true };
const OTHER = { background: true, coalesce: true };

let appState;
beforeEach(() => {
  mockLoad.mockClear();
  mockLoad.mockImplementation(async () => []);
  mockPets = [OWN];
  mockCurrent = OWN;
  appState = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, handler) => {
    appState = handler;
    return { remove: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());

const mount = () => renderHook(() => useReminderReconcile());
const calls = () => mockLoad.mock.calls;
const foreground = async () => {
  await act(async () => {
    appState("background");
    appState("active");
  });
};

test("on mount and on every pet select the selected dog's routines are read", async () => {
  const view = mount();
  expect(calls()).toEqual([[1, SHOWN]]);
  mockCurrent = { id: 2, name: "Rex" };
  await act(async () => view.rerender());
  expect(calls()[1]).toEqual([2, SHOWN]);
});

test("a newly shared dog is read once, in the background, without selecting it", async () => {
  const view = mount();
  mockPets = [OWN, SHARED];
  await act(async () => view.rerender());
  expect(calls()).toEqual([[1, SHOWN], [7, OTHER]]);
  mockPets = [OWN, { ...SHARED }];
  await act(async () => view.rerender());
  expect(calls()).toHaveLength(2); // once
});

test("an own dog that is not selected is not read on mount", async () => {
  mockPets = [OWN, { id: 2, is_shared: false }];
  mount();
  await act(async () => {});
  expect(calls()).toEqual([[1, SHOWN]]);
});

test("the selected shared dog is read once (not twice)", async () => {
  mockPets = [SHARED];
  mockCurrent = SHARED;
  mount();
  await act(async () => {});
  expect(calls()).toEqual([[7, SHOWN]]);
});

test("a failed read of a new shared dog is retried at the next pets change", async () => {
  mockPets = [OWN, SHARED];
  mockLoad.mockImplementation(async (id) => (id === 7 ? null : []));
  const view = mount();
  await act(async () => {});
  mockLoad.mockImplementation(async () => []);
  mockPets = [OWN, { ...SHARED }];
  await act(async () => view.rerender());
  expect(calls().filter(([id]) => id === 7)).toHaveLength(2);
});

test("a dog that was lost and shared again is read again", async () => {
  mockPets = [OWN, SHARED];
  const view = mount();
  mockPets = [OWN];
  await act(async () => view.rerender());
  mockPets = [OWN, { ...SHARED }];
  await act(async () => view.rerender());
  expect(calls().filter(([id]) => id === 7)).toHaveLength(2);
});

test("coming back to the foreground re-reads the selected dog", async () => {
  mount();
  mockLoad.mockClear();
  await foreground();
  expect(calls()).toEqual([[1, SHOWN]]);
});

test("pulling down the notification centre (inactive → active) does nothing", async () => {
  mount();
  mockLoad.mockClear();
  await act(async () => {
    appState("inactive");
    appState("active");
  });
  expect(calls()).toEqual([]);
});

test("quick app switches are throttled; a later one reads again", async () => {
  let now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  mount();
  mockLoad.mockClear();
  await foreground();
  now += 1000;
  await foreground();
  expect(calls()).toHaveLength(1);
  now += FOREGROUND_MIN_GAP_MS;
  await foreground();
  expect(calls()).toHaveLength(2);
});

test("no dog, nothing to read", async () => {
  mockPets = [];
  mockCurrent = null;
  mount();
  await foreground();
  expect(calls()).toEqual([]);
});
