// useAdoptableBrowse cache config (adoption browse staleness fix). The pet-owner Adoption
// section must always reflect the current available-dog list — a shelter adds a dog / marks
// one adopted and re-opening (or reconnecting to) the screen shows it. That relies on the
// query being configured staleTime:0 + refetchOnMount so the 5-min global cache
// (utils/queryClient.js) never serves a stale list. Mirrors usePetSocialProfile /
// useTodayDailyUpdate ("always reflect new posts/follows").
//
// useAdoptableBrowse uses no React hooks other than useQuery, so mocking react-query lets us
// call it directly and inspect the exact options it hands to useQuery.

let capturedOptions;
jest.mock("@tanstack/react-query", () => ({
  useQuery: (opts) => {
    capturedOptions = opts;
    return { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
  useInfiniteQuery: () => ({}),
}));

import { useAdoptableBrowse } from "./useProviders";

beforeEach(() => {
  capturedOptions = undefined;
});

describe("useAdoptableBrowse cache config", () => {
  test("is configured staleTime:0 + refetchOnMount + refetchOnReconnect (always fresh)", () => {
    useAdoptableBrowse({ gender: "female" });
    expect(capturedOptions.staleTime).toBe(0);
    expect(capturedOptions.refetchOnMount).toBe(true);
    expect(capturedOptions.refetchOnReconnect).toBe(true);
  });

  test("the query key includes the filter querystring and it stays enabled by default", () => {
    useAdoptableBrowse({ gender: "female" });
    expect(capturedOptions.queryKey).toEqual(["adoption-browse", "gender=female"]);
    expect(capturedOptions.enabled).toBe(true);
  });

  test("honors an explicit enabled:false (the storefront non-shelter gate, 2.97)", () => {
    useAdoptableBrowse({ provider_id: 3 }, { enabled: false });
    expect(capturedOptions.enabled).toBe(false);
    // Still always-fresh so that WHEN it does run (a shelter), it never serves a stale list.
    expect(capturedOptions.staleTime).toBe(0);
    expect(capturedOptions.refetchOnMount).toBe(true);
  });
});
