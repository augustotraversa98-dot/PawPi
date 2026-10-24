// Screen-focused polling (perf audit 5.6): a hidden screen (inactive tab, screen under a pushed one) must not
// poll; a focused one does; regaining focus refetches a stale query immediately.
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { NavigationContext } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFocusedPolling, useFocusedQuery } from "./useFocusedPolling";

// A minimal navigation object whose focus we can flip.
function makeNavigation(initial = true) {
  let focused = initial;
  const listeners = { focus: new Set(), blur: new Set() };
  return {
    isFocused: () => focused,
    addListener: (event, cb) => {
      listeners[event].add(cb);
      return () => listeners[event].delete(cb);
    },
    setFocused(next) {
      focused = next;
      listeners[next ? "focus" : "blur"].forEach((cb) => cb());
    },
  };
}

const wrap = (navigation, client) =>
  function Wrapper({ children }) {
    const tree = <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return navigation ? (
      <NavigationContext.Provider value={navigation}>{tree}</NavigationContext.Provider>
    ) : (
      tree
    );
  };

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("useFocusedPolling", () => {
  it("returns the interval while focused and false while hidden, then the interval again", () => {
    const nav = makeNavigation(true);
    const { result } = renderHook(() => useFocusedPolling(30000), { wrapper: wrap(nav, newClient()) });
    expect(result.current).toBe(30000);
    act(() => nav.setFocused(false));
    expect(result.current).toBe(false);
    act(() => nav.setFocused(true));
    expect(result.current).toBe(30000);
  });

  it("starts hidden when the screen is not focused at mount", () => {
    const { result } = renderHook(() => useFocusedPolling(8000), {
      wrapper: wrap(makeNavigation(false), newClient()),
    });
    expect(result.current).toBe(false);
  });

  it("outside a navigator it counts as focused (nothing withheld in tests / standalone use)", () => {
    const { result } = renderHook(() => useFocusedPolling(8000), { wrapper: wrap(null, newClient()) });
    expect(result.current).toBe(8000);
  });
});

describe("useFocusedQuery", () => {
  it("sets no refetchInterval while hidden and the interval while focused", async () => {
    const nav = makeNavigation(false);
    const client = newClient();
    const queryFn = jest.fn(async () => 1);
    const { result } = renderHook(() => useFocusedQuery({ queryKey: ["k"], queryFn }, 30000), {
      wrapper: wrap(nav, client),
    });
    await waitFor(() => expect(result.current.data).toBe(1));
    const observer = client.getQueryCache().find({ queryKey: ["k"] }).observers[0];
    expect(observer.options.refetchInterval).toBe(false);
    act(() => nav.setFocused(true));
    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: ["k"] }).observers[0].options.refetchInterval).toBe(30000),
    );
  });

  it("regaining focus refetches a STALE query right away, but not a fresh one", async () => {
    const nav = makeNavigation(true);
    const client = newClient();
    let n = 0;
    const queryFn = jest.fn(async () => ++n);
    const { result, rerender } = renderHook(
      ({ staleTime }) => useFocusedQuery({ queryKey: ["k2"], queryFn, staleTime }, 30000),
      { wrapper: wrap(nav, client), initialProps: { staleTime: 0 } },
    );
    await waitFor(() => expect(result.current.data).toBe(1));

    act(() => nav.setFocused(false));
    act(() => nav.setFocused(true));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2)); // stale (staleTime 0) -> refetched

    rerender({ staleTime: 60_000 });
    act(() => nav.setFocused(false));
    act(() => nav.setFocused(true));
    await act(async () => {});
    expect(queryFn).toHaveBeenCalledTimes(2); // fresh -> left alone
  });

  it("does not refetch on refocus while disabled", async () => {
    const nav = makeNavigation(true);
    const client = newClient();
    const queryFn = jest.fn(async () => 1);
    renderHook(() => useFocusedQuery({ queryKey: ["k3"], queryFn, enabled: false }, 8000), {
      wrapper: wrap(nav, client),
    });
    act(() => nav.setFocused(false));
    act(() => nav.setFocused(true));
    await act(async () => {});
    expect(queryFn).not.toHaveBeenCalled();
  });
});
