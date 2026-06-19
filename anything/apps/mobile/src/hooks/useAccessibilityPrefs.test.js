// Accessibility-preference hook tests (ticket 2.77 — Liquid Glass foundation).
// Proves the hooks default to "full effect" (false), reflect the initial OS
// value, and update live when the user toggles the setting — the contract the
// material/motion primitives rely on for their fallbacks.

import { AccessibilityInfo } from "react-native";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import {
  useReducedMotion,
  useReduceTransparency,
} from "./useAccessibilityPrefs";

afterEach(() => jest.restoreAllMocks());

describe("useReducedMotion", () => {
  it("defaults to false and adopts the initial OS value", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });

    const { result } = renderHook(() => useReducedMotion());
    // Before the promise resolves it is the safe default.
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("updates live when the setting changes", async () => {
    let handler;
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation((_event, cb) => {
        handler = cb;
        return { remove: jest.fn() };
      });

    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => handler(true));
    expect(result.current).toBe(true);
  });
});

describe("useReduceTransparency", () => {
  it("stays false when the OS getter is unavailable (e.g. Android)", () => {
    // Simulate a platform without the iOS-only getter (property absent).
    const original = AccessibilityInfo.isReduceTransparencyEnabled;
    AccessibilityInfo.isReduceTransparencyEnabled = undefined;
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });

    try {
      const { result } = renderHook(() => useReduceTransparency());
      expect(result.current).toBe(false);
    } finally {
      AccessibilityInfo.isReduceTransparencyEnabled = original;
    }
  });
});
