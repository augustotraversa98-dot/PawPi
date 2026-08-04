// useProviderListFilter: the shared client-side search/sort over the fetched providers.
// Covers the DEFAULT (legacy) matching over name/bio/provider_type AND the optional
// options.extraText that broadens matching (e.g. by service type) WITHOUT changing the
// no-options behavior legacy callers rely on.

import { renderHook, act } from "@testing-library/react-native";
import { useProviderListFilter } from "./ProviderListControls";

const PROVIDERS = [
  // name/bio/provider_type all lack "vet"; only its capability set says it's a vet.
  { id: 1, name: "Happy Paws", bio: "Caring clinic", capabilities: ["vet"] },
  { id: 2, name: "Vet Central", bio: "Full service", capabilities: ["shop"] },
];

test("no options: matches name/bio/provider_type only (extra-text provider is NOT found)", () => {
  const { result } = renderHook(() => useProviderListFilter(PROVIDERS));

  // "vet" hits provider 2 by NAME, but NOT provider 1 (its name/bio lack "vet";
  // capabilities are not searched without extraText).
  act(() => result.current.setQuery("vet"));
  const ids = result.current.filtered.map((p) => p.id);
  expect(ids).toEqual([2]);
});

test("options.extraText broadens matching to the service type", () => {
  const extraText = (p) => (Array.isArray(p.capabilities) ? p.capabilities : []);
  const { result } = renderHook(() =>
    useProviderListFilter(PROVIDERS, { extraText }),
  );

  // Now "vet" also matches provider 1 via its capability slug — provider 2 still matches
  // by name. Order is preserved (relevance = input order).
  act(() => result.current.setQuery("vet"));
  const ids = result.current.filtered.map((p) => p.id);
  expect(ids).toEqual([1, 2]);
});

test("matching stays case-insensitive with extraText", () => {
  const extraText = (p) => (Array.isArray(p.capabilities) ? p.capabilities : []);
  const { result } = renderHook(() =>
    useProviderListFilter(PROVIDERS, { extraText }),
  );
  act(() => result.current.setQuery("VET"));
  expect(result.current.filtered.map((p) => p.id)).toEqual([1, 2]);
});

test("empty query returns every provider (both with and without extraText)", () => {
  const withOpts = renderHook(() =>
    useProviderListFilter(PROVIDERS, { extraText: (p) => p.capabilities }),
  );
  const withoutOpts = renderHook(() => useProviderListFilter(PROVIDERS));
  expect(withOpts.result.current.filtered).toHaveLength(2);
  expect(withoutOpts.result.current.filtered).toHaveLength(2);
});

// ── sort options (Suggested / Top rated / Most reviewed / Nearest) ────────────────
// Incoming order is deliberately NOT already sorted, so each assertion proves the sort
// actually reordered (and that "Suggested" leaves the incoming order untouched).
const SORTABLE = [
  { id: 1, avg_rating: 3.1, review_count: 40, distance_km: 9.2 },
  { id: 2, avg_rating: 4.9, review_count: 2, distance_km: 0.8 },
  { id: 3, avg_rating: null, review_count: null, distance_km: null }, // missing everything
];
const idsFor = (sortKey) => {
  const { result } = renderHook(() => useProviderListFilter(SORTABLE));
  act(() => result.current.setSort(sortKey));
  return result.current.filtered.map((p) => p.id);
};

test("Suggested (relevance): keeps the incoming order, no reorder", () => {
  const { result } = renderHook(() => useProviderListFilter(SORTABLE));
  // default sort is "relevance"
  expect(result.current.sort).toBe("relevance");
  expect(result.current.filtered.map((p) => p.id)).toEqual([1, 2, 3]);
});

test("Top rated: avg_rating desc, null rating sinks to the bottom", () => {
  expect(idsFor("rating")).toEqual([2, 1, 3]); // 4.9, 3.1, null
});

test("Most reviewed: review_count desc, null count sinks to the bottom", () => {
  expect(idsFor("reviews")).toEqual([1, 2, 3]); // 40, 2, null
});

test("Nearest: distance_km asc, missing distance sorts last", () => {
  expect(idsFor("nearest")).toEqual([2, 1, 3]); // 0.8, 9.2, null
});

test("Nearest: two missing distances keep their incoming order (stable, both last)", () => {
  const list = [
    { id: 1, distance_km: 5 },
    { id: 2 }, // undefined distance
    { id: 3, distance_km: null }, // null distance
    { id: 4, distance_km: 1.2 },
  ];
  const { result } = renderHook(() => useProviderListFilter(list));
  act(() => result.current.setSort("nearest"));
  // 1.2, 5, then the two missing in incoming order (2 before 3)
  expect(result.current.filtered.map((p) => p.id)).toEqual([4, 1, 2, 3]);
});

test("a null rating still sinks BELOW a provider rated exactly 0 (0 > null→-1)", () => {
  const list = [
    { id: 1, avg_rating: null },
    { id: 2, avg_rating: 0 },
  ];
  const { result } = renderHook(() => useProviderListFilter(list));
  act(() => result.current.setSort("rating"));
  expect(result.current.filtered.map((p) => p.id)).toEqual([2, 1]);
});
