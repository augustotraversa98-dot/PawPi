import { QueryClient } from "@tanstack/react-query";

// Single shared QueryClient instance. Exported (rather than created inline in
// _layout) so non-React modules — notably the auth store — can clear it on an
// identity change. RootLayout passes this exact instance to QueryClientProvider,
// so clearing it here empties the cache the whole app reads from.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
