import { runRefresh } from "./useRefresh";

// Tests the refresh state machine that useRefresh delegates to. The hook is a
// thin wrapper (useState + a stable callback), so exercising runRefresh covers
// the behavior that matters: the spinner toggles true→false and onRefresh
// awaits the real refetch(es), even on error.

describe("runRefresh", () => {
  test("toggles refreshing true then false around the refetch", async () => {
    const calls = [];
    const setRefreshing = (v) => calls.push(v);
    const refetch = jest.fn().mockResolvedValue(undefined);

    await runRefresh(refetch, setRefreshing);

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([true, false]);
  });

  test("awaits the refetch before clearing the spinner", async () => {
    const events = [];
    let resolveRefetch;
    const refetch = () =>
      new Promise((resolve) => {
        resolveRefetch = () => {
          events.push("refetch-done");
          resolve();
        };
      });
    const setRefreshing = (v) => {
      if (v === false) events.push("spinner-cleared");
    };

    const promise = runRefresh(refetch, setRefreshing);
    // Spinner must NOT clear until the refetch resolves.
    expect(events).toEqual([]);

    resolveRefetch();
    await promise;

    expect(events).toEqual(["refetch-done", "spinner-cleared"]);
  });

  test("clears the spinner even when a refetch rejects", async () => {
    const calls = [];
    const setRefreshing = (v) => calls.push(v);
    const refetch = jest.fn().mockRejectedValue(new Error("network"));

    await expect(runRefresh(refetch, setRefreshing)).resolves.toBeUndefined();
    expect(calls).toEqual([true, false]);
  });

  test("awaits every refetch when given an array", async () => {
    const calls = [];
    const setRefreshing = (v) => calls.push(v);
    const a = jest.fn().mockResolvedValue(undefined);
    const b = jest.fn().mockResolvedValue(undefined);

    await runRefresh([a, b], setRefreshing);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([true, false]);
  });

  test("ignores nullish entries in the refetch array", async () => {
    const calls = [];
    const setRefreshing = (v) => calls.push(v);
    const a = jest.fn().mockResolvedValue(undefined);

    await runRefresh([a, null, undefined], setRefreshing);

    expect(a).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([true, false]);
  });
});
