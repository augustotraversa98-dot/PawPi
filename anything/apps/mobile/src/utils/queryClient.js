import { QueryClient } from "@tanstack/react-query";

// Single shared QueryClient instance. Exported (rather than created inline in
// _layout) so non-React modules — notably the auth store — can clear it on an
// identity change. RootLayout passes this exact instance to QueryClientProvider,
// so clearing it here empties the cache the whole app reads from.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      // v5 name. The previous `cacheTime` (a v4 option) was silently ignored, so unused
      // queries were garbage-collected after the 5-minute default instead of 30 minutes.
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      // One short pause before the single retry. The default exponential delay is fine, but
      // combined with the 15 s fetch deadline (see __create/fetch.ts) a fixed 1.5 s keeps the
      // worst-case time-to-error-state bounded (~32 s) instead of open-ended.
      retryDelay: 1500,
      refetchOnWindowFocus: false,
      // Offline must fail CLOSED (AUDIT_2026-09 A-06). The default 'online' mode pauses an
      // offline query (isLoading=false, data=undefined → every screen renders its EMPTY
      // state) and pauses an offline mutation (its button spins forever). 'offlineFirst'
      // fires the request once so it fails fast into the screens' existing error states,
      // then resumes when connectivity returns (see utils/connectivity.js).
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});
