import { renderHook, act, waitFor } from "@testing-library/react-native";
import useHandleAvailability, { canSaveHandle } from "./useHandleAvailability";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

const ok = (body) => jest.fn().mockResolvedValue({ ok: true, json: async () => body });

describe("useHandleAvailability", () => {
  test("empty -> idle; bad format -> invalid with a reason, no network", () => {
    global.fetch = jest.fn();
    const { result, rerender } = renderHook(({ h }) => useHandleAvailability(h), {
      initialProps: { h: "" },
    });
    expect(result.current.status).toBe("idle");
    rerender({ h: "ab" });
    expect(result.current.status).toBe("invalid");
    expect(result.current.reason).toBe("too_short");
    rerender({ h: "admin" });
    expect(result.current.reason).toBe("reserved");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("checking -> available once the server clears it; canSaveHandle gate", async () => {
    global.fetch = ok({ available: true });
    const { result } = renderHook(() => useHandleAvailability("@Rex_Daily"));
    expect(result.current.status).toBe("checking");
    expect(canSaveHandle(result.current.status)).toBe(false);
    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(global.fetch.mock.calls[0][0]).toBe(
      "/api/pets/handle-availability?handle=rex_daily",
    );
  });

  test("taken carries the server's free alternatives and blocks saving", async () => {
    global.fetch = ok({ available: false, alternatives: ["rex2", "rex.paws"] });
    const { result } = renderHook(() => useHandleAvailability("rex"));
    await waitFor(() => expect(result.current.status).toBe("taken"));
    expect(result.current.alternatives).toEqual(["rex2", "rex.paws"]);
    expect(canSaveHandle("taken")).toBe(false);
  });

  test("a verdict never applies to a different string (stale 'available' re-locks)", async () => {
    global.fetch = ok({ available: true });
    const { result, rerender } = renderHook(({ h }) => useHandleAvailability(h), {
      initialProps: { h: "rexone" },
    });
    await waitFor(() => expect(result.current.status).toBe("available"));
    rerender({ h: "rextwo" });
    expect(result.current.status).toBe("checking");
  });

  test("network failure -> unverified (save allowed; the server re-checks)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useHandleAvailability("rexone"));
    await waitFor(() => expect(result.current.status).toBe("unverified"));
    expect(canSaveHandle("unverified")).toBe(true);
  });

  test("the pet's own current handle is available without a request; pet_id is sent otherwise", async () => {
    global.fetch = ok({ available: true });
    const own = renderHook(() =>
      useHandleAvailability("Rexy", { petId: 5, currentHandle: "rexy" }),
    );
    expect(own.result.current.status).toBe("available");
    expect(global.fetch).not.toHaveBeenCalled();

    const other = renderHook(() =>
      useHandleAvailability("newname", { petId: 5, currentHandle: "rexy" }),
    );
    await waitFor(() => expect(other.result.current.status).toBe("available"));
    expect(global.fetch.mock.calls[0][0]).toContain("&pet_id=5");
  });

  test("markTaken (save-time 409) flips to taken with fresh alternatives", async () => {
    global.fetch = ok({ available: true });
    const { result } = renderHook(() => useHandleAvailability("rexone"));
    await waitFor(() => expect(result.current.status).toBe("available"));
    act(() => result.current.markTaken("rexone", ["rexone2"]));
    expect(result.current.status).toBe("taken");
    expect(result.current.alternatives).toEqual(["rexone2"]);
  });

  test("debounces: rapid typing sends one request for the final value", async () => {
    jest.useFakeTimers();
    global.fetch = ok({ available: true });
    const { rerender } = renderHook(({ h }) => useHandleAvailability(h), {
      initialProps: { h: "" },
    });
    rerender({ h: "rex" });
    rerender({ h: "rexo" });
    rerender({ h: "rexon" });
    rerender({ h: "rexone" });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(450);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain("handle=rexone");
  });
});
