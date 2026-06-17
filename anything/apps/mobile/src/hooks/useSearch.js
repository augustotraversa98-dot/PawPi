import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

// Debounce a fast-changing value (the search box text) so we don't fire a request
// per keystroke.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// Real Search across pets, owners, and providers (ticket 2.25). Disabled until the
// (debounced) query is at least 2 chars — a short query returns nothing, no fallback.
export function useSearch(query) {
  const q = (query || "").trim();
  return useQuery({
    queryKey: ["search", q],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json(); // { pets, owners, providers }
    },
    enabled: q.length >= 2,
    staleTime: 1000 * 30,
  });
}
