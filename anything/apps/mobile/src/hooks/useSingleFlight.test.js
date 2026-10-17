import { renderHook } from "@testing-library/react-native";
import useSingleFlight from "./useSingleFlight";

describe("useSingleFlight", () => {
  test("ignores a second run while the first is pending — even across a re-render — then allows the next", async () => {
    const { result, rerender } = renderHook(() => useSingleFlight());
    let release;
    const fn = jest.fn(() => new Promise((r) => (release = r)));
    const first = result.current(fn);
    rerender({}); // the re-render the first tap causes
    const second = await result.current(fn); // double tap
    expect(second).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    release("done");
    expect(await first).toBe("done");
    const third = result.current(fn);
    expect(fn).toHaveBeenCalledTimes(2);
    release("again");
    await third;
  });

  test("releases the lock when the handler throws", async () => {
    const { result } = renderHook(() => useSingleFlight());
    await expect(result.current(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(result.current(async () => "ok")).resolves.toBe("ok");
  });
});
