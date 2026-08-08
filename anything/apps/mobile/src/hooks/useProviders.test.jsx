// Contract for the owner-facing provider hooks (discovery + booking):
//   - useDiscoverProviders hits /api/providers/discover, returns providers[], throws
//     on !ok. A string arg is the capability (?capability=); an options object adds
//     the Services Hub P1 params (?lat/&lng/&radius/&q). Back-compat: string form.
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
  useProviderAvailability,
  useBookProvider,
  useDaycareStays,
  useBookDaycareStay,
  useSittingVisits,
  useMySittingVisits,
  useLogSittingVisit,
  useCreateProvider,
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
  test("string arg fetches published providers by capability and returns the array", async () => {
    const providers = [{ id: 1, slug: "happy-paws", name: "Happy Paws" }];
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ providers }),
    }));

    const { result } = renderHook(() => useDiscoverProviders("vet"), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lastFetchUrl()).toBe("/api/providers/discover?capability=vet");
    expect(result.current.data).toBe(providers);
  });

  test("options object builds the geo + search query string (P1)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ providers: [] }),
    }));

    const { result } = renderHook(
      () =>
        useDiscoverProviders({
          capability: "shop",
          lat: -34.6,
          lng: -58.4,
          radius: 5,
          q: "paws",
        }),
      { wrapper: makeWrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lastFetchUrl()).toBe(
      "/api/providers/discover?capability=shop&lat=-34.6&lng=-58.4&radius=5&q=paws",
    );
  });

  test("no args → bare discover URL (no params)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ providers: [] }),
    }));

    const { result } = renderHook(() => useDiscoverProviders({}), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/providers/discover");
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

describe("useProviderAvailability (PR-1 contract)", () => {
  test("is disabled until providerId + from + to are known", async () => {
    global.fetch = jest.fn();
    const { result } = renderHook(
      () => useProviderAvailability(undefined, { from: "2026-06-01", to: "2026-06-30" }),
      { wrapper: makeWrapper(makeClient()) },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("builds the from/to/capability query and returns { time_zone, availability }", async () => {
    const payload = {
      time_zone: "America/Argentina/Buenos_Aires",
      availability: [
        {
          date: "2026-06-15",
          slots: [
            { start: "2026-06-15T12:00:00.000Z", end: "2026-06-15T12:30:00.000Z" },
          ],
        },
      ],
    };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => payload }));

    const { result } = renderHook(
      () =>
        useProviderAvailability(100, {
          from: "2026-06-01",
          to: "2026-06-30",
          capability: "vet",
        }),
      { wrapper: makeWrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe(
      "/api/providers/100/availability?from=2026-06-01&to=2026-06-30&capability=vet",
    );
    expect(result.current.data).toEqual(payload);
  });

  test("adds staff_user_id when supplied", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ time_zone: "UTC", availability: [] }),
    }));
    const { result } = renderHook(
      () =>
        useProviderAvailability(100, {
          from: "2026-06-01",
          to: "2026-06-30",
          capability: "vet",
          staffUserId: 7,
        }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe(
      "/api/providers/100/availability?from=2026-06-01&to=2026-06-30&capability=vet&staff_user_id=7",
    );
  });

  test("throws when the response is not ok", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    const { result } = renderHook(
      () => useProviderAvailability(100, { from: "2026-06-01", to: "2026-06-30" }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toMatch(/failed to fetch availability/i);
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
    // The owner hub's My Activity (useMyBookings) must refresh so the new booking shows at once.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["my-bookings", "owner"],
    });
  });
});

describe("useCreateProvider", () => {
  test("POSTs to /api/providers with the body and returns the created provider", async () => {
    const provider = { id: 42, name: "Happy Paws", provider_type: "vet", status: "draft" };
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ provider }),
    }));

    const { result } = renderHook(() => useCreateProvider(), {
      wrapper: makeWrapper(makeClient()),
    });

    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync({
        name: "Happy Paws",
        provider_type: "vet",
        bio: "We love pets",
      });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Happy Paws",
          provider_type: "vet",
          bio: "We love pets",
        }),
      }),
    );
    expect(returned).toBe(provider);
  });

  test("forwards the capabilities[] multi-service array in the POST body (ticket 2.15)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ provider: { id: 42, name: "Happy Paws" } }),
    }));

    const { result } = renderHook(() => useCreateProvider(), {
      wrapper: makeWrapper(makeClient()),
    });

    await act(async () => {
      await result.current.mutateAsync({
        name: "Happy Paws",
        provider_type: "vet",
        capabilities: ["vet", "shop"],
      });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Happy Paws",
          provider_type: "vet",
          capabilities: ["vet", "shop"],
        }),
      }),
    );
  });

  test("surfaces the backend error message on a non-ok response", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "name and provider_type are required" }),
    }));

    const { result } = renderHook(() => useCreateProvider(), {
      wrapper: makeWrapper(makeClient()),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ name: "", provider_type: "" });
      }),
    ).rejects.toThrow(/name and provider_type are required/i);
  });

  test("invalidates the useMyProviders key on success", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ provider: { id: 42, name: "Happy Paws" } }),
    }));

    const client = makeClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateProvider(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "Happy Paws", provider_type: "vet" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["providers", "mine"],
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

describe("useSittingVisits (ticket 2.9)", () => {
  test("is disabled until a pet id is known", async () => {
    global.fetch = jest.fn();
    const { result } = renderHook(() => useSittingVisits(undefined), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("fetches the owner's pet visit updates and returns the array", async () => {
    const visits = [{ id: 1, status: "completed", notes: "fed + walked" }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ visits }) }));
    const { result } = renderHook(() => useSittingVisits(55), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/pets/55/sitting-visits");
    expect(result.current.data).toBe(visits);
  });
});

describe("useMySittingVisits (ticket 2.9)", () => {
  test("is disabled until a provider id is known", async () => {
    global.fetch = jest.fn();
    const { result } = renderHook(() => useMySittingVisits(undefined), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("fetches the sitter's OWN assigned visits with an optional status filter", async () => {
    const visits = [{ id: 2, status: "scheduled" }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ visits }) }));
    const { result } = renderHook(
      () => useMySittingVisits(100, { status: "scheduled" }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe(
      "/api/providers/100/sitting-visits?status=scheduled",
    );
    expect(result.current.data).toBe(visits);
  });
});

describe("useLogSittingVisit (ticket 2.9)", () => {
  test("POSTs to /api/providers/[id]/sitting-visits with the body (providerId stripped)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ visit: { id: 9 } }),
    }));
    const { result } = renderHook(() => useLogSittingVisit(), {
      wrapper: makeWrapper(makeClient()),
    });
    await act(async () => {
      await result.current.mutateAsync({
        providerId: 100,
        pet_id: 55,
        notes: "Evening drop-in",
        photo_urls: ["https://cdn/x.jpg"],
      });
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/100/sitting-visits",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          pet_id: 55,
          notes: "Evening drop-in",
          photo_urls: ["https://cdn/x.jpg"],
        }),
      }),
    );
  });

  test("surfaces the backend 403 (needs consent) message", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "No active care-access grant for the required scope" }),
    }));
    const { result } = renderHook(() => useLogSittingVisit(), {
      wrapper: makeWrapper(makeClient()),
    });
    await expect(
      act(async () => {
        await result.current.mutateAsync({ providerId: 100, pet_id: 55 });
      }),
    ).rejects.toThrow(/care-access grant/i);
  });

  test("invalidates the provider's sitting-visits key on success", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ visit: { id: 9 } }),
    }));
    const client = makeClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useLogSittingVisit(), {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ providerId: 100, pet_id: 55 });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["sitting-visits", "provider", 100],
    });
  });
});
