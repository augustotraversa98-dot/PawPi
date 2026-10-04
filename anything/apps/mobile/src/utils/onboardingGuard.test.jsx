// onboardingGuard — the onboarding wizard must never be a place an account that already has a
// dog can end up creating another one.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

import {
  accountAlreadyHasPets,
  useLeaveOnboardingIfHasPets,
  APP_HOME,
} from "./onboardingGuard";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

describe("accountAlreadyHasPets", () => {
  test("true only for a 200 with at least one pet", async () => {
    expect(await accountAlreadyHasPets(async () => ok({ pets: [{ id: 1 }] }))).toBe(true);
  });

  test("false for an empty list", async () => {
    expect(await accountAlreadyHasPets(async () => ok({ pets: [] }))).toBe(false);
  });

  test("fails OPEN: network error, 4xx/5xx, or a malformed body never block a new owner", async () => {
    expect(
      await accountAlreadyHasPets(async () => {
        throw new Error("offline");
      }),
    ).toBe(false);
    expect(await accountAlreadyHasPets(async () => ({ ok: false, status: 500 }))).toBe(false);
    expect(await accountAlreadyHasPets(async () => ({ ok: false, status: 401 }))).toBe(false);
    expect(await accountAlreadyHasPets(async () => ok({ nope: true }))).toBe(false);
    expect(
      await accountAlreadyHasPets(async () => ({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      })),
    ).toBe(false);
  });
});

function Probe() {
  useLeaveOnboardingIfHasPets();
  return null;
}

describe("useLeaveOnboardingIfHasPets", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    mockReplace.mockClear();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("an account that already has a dog is sent back to the app", async () => {
    global.fetch = jest.fn(async () => ok({ pets: [{ id: 22, name: "Mila" }] }));
    render(<Probe />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(APP_HOME));
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test("a brand-new owner (no pets) stays in the wizard", async () => {
    global.fetch = jest.fn(async () => ok({ pets: [] }));
    render(<Probe />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("a failed check never redirects (fail-open)", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    });
    render(<Probe />);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("a late answer after unmount does not navigate", async () => {
    let resolve;
    global.fetch = jest.fn(() => new Promise((r) => (resolve = r)));
    const { unmount } = render(<Probe />);
    unmount();
    resolve(ok({ pets: [{ id: 1 }] }));
    await new Promise((r) => setTimeout(r, 20));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
