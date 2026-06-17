// Contract for the owner-facing provider hooks (discovery + booking):
//   - useDiscoverProviders keys on ["providers","discover",type], hits
//     /api/providers/discover?type=, returns providers[], throws on !ok;
//   - useProviderProfile keys on ["providers","public",slug], is disabled with
//     no slug, hits /api/providers/public/[slug], returns {provider,...};
//   - useBookProvider POSTs to /api/providers/[id]/book with the body (providerId
//     stripped), surfaces backend error messages, and on success invalidates the
//     two pet-scoped keys the appointment surfaces through.
// fetch is mocked; no network, no DB.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useDiscoverProviders,
  useProviderProfile,
  useBookProvider,
  useDaycareStays,
  useBookDaycareStay,
} from "./useProviders";

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

function lastFetchUrl() {
  const calls = global.fetch.mock.calls;
  return calls[calls.length - 1][0];
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useDiscoverProviders", () => {
  test("fetches published providers for the given type and returns the array", async () => {
    const providers = [{ id: 1, slug: "happy-paws", name: "Happy Paws" }];
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ providers }),
    }));

    const { result } = renderHook(() => useDiscoverProviders("vet"), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lastFetchUrl()).toBe("/api/providers/discover?type=vet");
    expect(result.current.data).toBe(providers);
  });

  test("throws when the response is not ok", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));

    const { result } = renderHook(() => useDiscoverProviders("vet"), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toMatch(/failed to fetch providers/i);
  });
});

describe("useProviderProfile", () => {
  test("is disabled (no fetch) until a slug is provided", async () => {
    global.fetch = jest.fn();

    const { result } = renderHook(() => useProviderProfile(undefined), {
      wrapper: makeWrapper(makeClient()),
    });

    // enabled:false → stays pending/idle, never fetches.
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("fetches the public profile by slug and returns {provider,locations,services}", async () => {
    const payload = {
      provider: { id: 3, slug: "happy-paws", name: "Happy Paws" },
      locations: [{ id: 8, name: "Main St" }],
      services: [{ id: 5, name: "Checkup", price_cents: 5000 }],
    };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => payload }));

    const { result } = renderHook(() => useProviderProfile("happy-paws"), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lastFetchUrl()).toBe("/api/providers/public/happy-paws");
    expect(result.current.data).toEqual(payload);
  });

  test("throws when the slug 404s (draft/unknown)", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));

    const { result } = renderHook(() => useProviderProfile("nope"), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toMatch(/failed to fetch provider/i);
  });
});

describe("useBookProvider", () => {
  test("POSTs to /api/providers/[id]/book with the body (providerId stripped)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ appointment: { id: 99 } }),
    }));

    const { result } = renderHook(() => useBookProvider(), {
      wrapper: makeWrapper(makeClient()),
    });

    await act(async () => {
      await result.current.mutateAsync({
        providerId: 3,
        petId: 7,
        service_id: 5,
        provider_location_id: 8,
        appointment_date: "2026-07-01",
        appointment_time: "09:30",
        reason_for_visit: "Checkup",
      });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/book",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          petId: 7,
          service_id: 5,
          provider_location_id: 8,
          appointment_date: "2026-07-01",
          appointment_time: "09:30",
          reason_for_visit: "Checkup",
        }),
      }),
    );
  });

  test("surfaces the backend error message on a non-ok response", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "You do not own this pet" }),
    }));

    const { result } = renderHook(() => useBookProvider(), {
      wrapper: makeWrapper(makeClient()),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          providerId: 3,
          petId: 7,
          appointment_date: "2026-07-01",
          appointment_time: "09:30",
        });
      }),
    ).rejects.toThrow(/do not own this pet/i);
  });

  test("invalidates the pet-scoped appointment keys on success", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ appointment: { id: 99 } }),
    }));

    const client = makeClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useBookProvider(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        providerId: 3,
        petId: 7,
        appointment_date: "2026-07-01",
        appointment_time: "09:30",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vet-appointments", 7],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vet-appointment-reminders", 7],
    });
  });
});

describe("useDaycareStays (ticket 2.8)", () => {
  test("is disabled until a pet id is known", async () => {
    global.fetch = jest.fn();
    const { result } = renderHook(() => useDaycareStays(undefined), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("fetches the owner's stays for a pet and returns the array", async () => {
    const stays = [{ id: 1, status: "booked", report_cards: [], vaccine_status: { passed: true } }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ stays }) }));
    const { result } = renderHook(() => useDaycareStays(55), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/pets/55/daycare-stays");
    expect(result.current.data).toBe(stays);
  });
});

describe("useBookDaycareStay (ticket 2.8)", () => {
  test("POSTs to /api/pets/[id]/daycare-stays with the body (petId stripped)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ stay: { id: 9 }, vaccine_status: { passed: true } }),
    }));
    const { result } = renderHook(() => useBookDaycareStay(), {
      wrapper: makeWrapper(makeClient()),
    });
    await act(async () => {
      await result.current.mutateAsync({
        petId: 55,
        provider_id: 100,
        start_date: "2026-08-01",
        end_date: "2026-08-03",
        feeding_instructions: "Two cups",
      });
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/pets/55/daycare-stays",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          provider_id: 100,
          start_date: "2026-08-01",
          end_date: "2026-08-03",
          feeding_instructions: "Two cups",
        }),
      }),
    );
  });

  test("surfaces the backend 'fully booked' message on overbook (409)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "The facility is fully booked for those dates" }),
    }));
    const { result } = renderHook(() => useBookDaycareStay(), {
      wrapper: makeWrapper(makeClient()),
    });
    await expect(
      act(async () => {
        await result.current.mutateAsync({
          petId: 55,
          provider_id: 100,
          start_date: "2026-08-01",
          end_date: "2026-08-03",
        });
      }),
    ).rejects.toThrow(/fully booked/i);
  });

  test("invalidates the owner's daycare-stays key on success", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ stay: { id: 9 }, vaccine_status: { passed: true } }),
    }));
    const client = makeClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useBookDaycareStay(), {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({
        petId: 55,
        provider_id: 100,
        start_date: "2026-08-01",
        end_date: "2026-08-03",
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["daycare-stays", "owner", 55],
    });
  });
});
