// Contract for useServicesDiscover: GETs /api/services/discover, builds the query string from
// { q, category, neighborhood, lat, lng, radius }, returns items[], throws on !ok, and OMITS
// category when it is "all". fetch is mocked; no network.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useServicesDiscover } from "./useServicesDiscover";

function makeWrapper(client) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function lastUrl() {
  const calls = global.fetch.mock.calls;
  return calls[calls.length - 1][0];
}

afterEach(() => jest.restoreAllMocks());

test("no params → bare endpoint, returns items[]", async () => {
  const items = [{ type: "provider", id: 1, name: "A" }];
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ items }) }));

  const { result } = renderHook(() => useServicesDiscover(), {
    wrapper: makeWrapper(makeClient()),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(lastUrl()).toBe("/api/services/discover");
  expect(result.current.data).toBe(items);
});

test("passes category + neighborhood + geo; omits category='all'", async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ items: [] }) }));

  const { result, rerender } = renderHook(
    (props) => useServicesDiscover(props),
    {
      wrapper: makeWrapper(makeClient()),
      initialProps: { category: "cafe", neighborhood: "Palermo", lat: -34.6, lng: -58.4 },
    },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const url = lastUrl();
  expect(url).toContain("category=cafe");
  expect(url).toContain("neighborhood=Palermo");
  expect(url).toContain("lat=-34.6");
  expect(url).toContain("lng=-58.4");

  // category "all" is a sentinel for "both sources" → not sent as a filter.
  rerender({ category: "all" });
  await waitFor(() => expect(lastUrl()).not.toContain("category="));
});

test("throws when the response is not ok", async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
  const { result } = renderHook(() => useServicesDiscover({ category: "vet" }), {
    wrapper: makeWrapper(makeClient()),
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error.message).toMatch(/failed to fetch discovery/i);
});
