import { queryClient } from './queryClient';

// AUDIT_2026-09 A-02 / A-31: the shared QueryClient must use the v5 option names — a v4
// `cacheTime` is silently ignored by @tanstack/react-query v5 — and bound the retry delay so
// a failing fetch reaches the error state in bounded time.
test('uses v5 option names and a bounded retry policy', () => {
  const { queries } = queryClient.getDefaultOptions();

  expect(queries.gcTime).toBe(1000 * 60 * 30);
  expect(queries.cacheTime).toBeUndefined();
  expect(queries.retry).toBe(1);
  expect(queries.retryDelay).toBe(1500);
  expect(queries.staleTime).toBe(1000 * 60 * 5);
});
