// Bug fix — Getting-started items frozen on a "celebrated" account.
//
// The activation reads (usePetSocialProfile for post count, useHasReminder for
// reminders) used to be gated on the GLOBAL, one-shot `celebrated` flag
// (activationPetId = celebrated ? null : petId). On any account that had ever
// completed the checklist once, that disabled the queries — so the "Share your
// first post" and "Set your first reminder" items stayed permanently unticked
// even when the active pet genuinely had posts/reminders. The reads must run for
// the active pet whenever there is one, regardless of `celebrated`.
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockSocialProfileSpy = jest.fn();

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  // Simulate a returning user who already saw the celebration once.
  getItem: jest.fn(async () => "1"),
  setItem: jest.fn(async () => {}),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Mango" } }),
}));
jest.mock("@/hooks/useFetchHealthData", () => ({
  useFoodLogs: () => ({ data: { logs: [] } }),
}));
jest.mock("@/hooks/usePetSocialProfile", () => ({
  usePetSocialProfile: (petId) => {
    mockSocialProfileSpy(petId);
    // A pet that DOES have posts — the item must reflect this.
    return { data: { stats: { totalPosts: 3 } } };
  },
}));
jest.mock("@/utils/notifications", () => ({
  getNotificationPermissionGranted: jest.fn(async () => false),
  requestNotificationPermissions: jest.fn(async () => false),
  ensureDailyReturnReminder: jest.fn(),
}));

import { useGettingStarted } from "./useGettingStarted";

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockSocialProfileSpy.mockClear();
  // useHasReminder hits /api/routines?petId= — this pet HAS a routine.
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ routines: [{ id: 1 }] }),
  }));
});

afterEach(() => jest.restoreAllMocks());

test("activation reads run for the active pet even when the account is celebrated", async () => {
  const { result } = renderHook(() => useGettingStarted(), { wrapper });

  // The social-profile read is called with the REAL active pet id (7), never the
  // null that the old `celebrated`-gate forced.
  await waitFor(() => expect(mockSocialProfileSpy).toHaveBeenCalledWith(7));
  expect(mockSocialProfileSpy).not.toHaveBeenCalledWith(null);

  // And the derived items reflect reality: post done (totalPosts>0) and reminder
  // done (routine exists), instead of being frozen unticked.
  await waitFor(() => {
    const items = Object.fromEntries(
      result.current.activation.items.map((i) => [i.key, i.done]),
    );
    expect(items.post).toBe(true);
    expect(items.reminder).toBe(true);
  });
});
