import { QueryClient } from "@tanstack/react-query";

// Single QueryClient for the provider web dashboard. The app's root.tsx mounts
// SessionProvider + the global relative-fetch override but NO QueryClientProvider
// (the account pages don't use react-query), so the provider area brings its own.
// A module-level singleton keeps the cache alive across navigations within the
// dashboard. Created lazily so it never runs during SSR module evaluation.
let client = null;

export function getProviderQueryClient() {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          // Dashboard data is operational; a short stale window + no refetch
          // storm keeps the bookings inbox responsive without hammering the API.
          staleTime: 30_000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return client;
}
