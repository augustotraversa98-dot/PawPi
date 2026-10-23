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

// Perf audit 2026-10-23 (F6.1): many components, ONE native read and ONE listener.
describe("shared store (no per-instance native call)", () => {
  it("50 mounted hooks cost one native read and one listener; they all update together", async () => {
    let handler;
    const read = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const remove = jest.fn();
    const listen = jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_e, cb) => {
      handler = cb;
      return { remove };
    });

    // RN's jest setup already provides these as mock fns, so spyOn returns the SAME fn: drop earlier tests' calls.
    read.mockClear();
    listen.mockClear();

    const hooks = Array.from({ length: 50 }, () => renderHook(() => useReducedMotion()));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(listen).toHaveBeenCalledTimes(1);

    act(() => handler(true));
    expect(hooks.every((h) => h.result.current === true)).toBe(true);

    // A component mounted later reads the live value immediately, with no flash of `false` and no new native call.
    const late = renderHook(() => useReducedMotion());
    expect(late.result.current).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);

    hooks.forEach((h) => h.unmount());
    late.unmount();
    expect(remove).toHaveBeenCalledTimes(1); // last unsubscribe tears the listener down
  });

  it("a read that resolves after the last unmount is ignored", async () => {
    let resolve;
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise((r) => (resolve = r)));
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: jest.fn() });
    const first = renderHook(() => useReducedMotion());
    first.unmount();
    resolve(true);
    await Promise.resolve();
    const second = renderHook(() => useReducedMotion());
    expect(second.result.current).toBe(false);
  });
});
