// Contract for useCreateBark (pet-scoped barks, PR #70 mobile follow-up):
//   - the POST body carries the active pet's id as petId (alongside text),
//     read from useCurrentPet() inside the hook so the call site stays
//     mutateAsync(text);
//   - when there is no active pet it surfaces a friendly error and never POSTs.
// fetch + useCurrentPet are mocked; no network, no DB.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateBark } from "./useFeedPosts";

// useCreateBark reads the active pet via useCurrentPet; stub it per test.
const mockUseCurrentPet = jest.fn();
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => mockUseCurrentPet(),
}));

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  mockUseCurrentPet.mockReset();
});

describe("useCreateBark", () => {
  test("POSTs the bark with the active pet's petId in the body", async () => {
    mockUseCurrentPet.mockReturnValue({ data: { id: 4, name: "Phoebe" } });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ bark: { id: 1, pet_id: 4 } }),
    }));

    const { result } = renderHook(() => useCreateBark(7), {
      wrapper: makeWrapper(makeClient()),
    });

    await act(async () => {
      await result.current.mutateAsync("good boy");
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/posts/7/barks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "good boy", petId: 4 }),
      }),
    );
  });

  test("surfaces a friendly error and never POSTs when there is no active pet", async () => {
    mockUseCurrentPet.mockReturnValue({ data: null });
    global.fetch = jest.fn();

    const { result } = renderHook(() => useCreateBark(7), {
      wrapper: makeWrapper(makeClient()),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync("good boy");
      }),
    ).rejects.toThrow(/pet/i);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
