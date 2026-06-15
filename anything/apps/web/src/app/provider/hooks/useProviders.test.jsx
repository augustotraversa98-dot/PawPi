import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  providersKey,
  providerKey,
  bookingsKey,
  bookingsPrefixKey,
  bookingsUrl,
  servicesKey,
  servicesUrl,
  serviceUrl,
  locationsKey,
  locationsUrl,
  locationUrl,
  useProviders,
  useProviderBookings,
  useBookingAction,
  useCreateProvider,
  useProvider,
  useUpdateProviderProfile,
  useSetProviderStatus,
  useProviderServices,
  useCreateService,
  useUpdateService,
  useDeactivateService,
  useProviderLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "./useProviders";
import { useProviderSelection } from "../store/providerSelection";

// Hooks talk to the already-built backend over the global relative-fetch
// override. Here fetch is mocked at the global boundary — no live DB / network.

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

function mockFetch(body, { ok = true, status = 200 } = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("query key + url builders", () => {
  it("providers key is stable", () => {
    expect(providersKey()).toEqual(["providers"]);
  });

  it("bookings key includes provider id and status (default all)", () => {
    expect(bookingsKey(5)).toEqual(["provider-bookings", "5", "all"]);
    expect(bookingsKey(5, "requested")).toEqual([
      "provider-bookings",
      "5",
      "requested",
    ]);
    expect(bookingsPrefixKey(5)).toEqual(["provider-bookings", "5"]);
  });

  it("bookings url omits the query when no status, adds it when present", () => {
    expect(bookingsUrl(7)).toBe("/api/providers/7/bookings");
    expect(bookingsUrl(7, "confirmed")).toBe(
      "/api/providers/7/bookings?booking_status=confirmed",
    );
  });

  it("provider key includes the id as a string", () => {
    expect(providerKey(7)).toEqual(["provider", "7"]);
    expect(providerKey()).toEqual(["provider", ""]);
  });

  it("services key + urls are scoped to the provider", () => {
    expect(servicesKey(7)).toEqual(["provider-services", "7"]);
    expect(servicesKey()).toEqual(["provider-services", ""]);
    expect(servicesUrl(7)).toBe("/api/providers/7/services");
    expect(serviceUrl(7, 12)).toBe("/api/providers/7/services/12");
  });

  it("locations key + urls are scoped to the provider", () => {
    expect(locationsKey(7)).toEqual(["provider-locations", "7"]);
    expect(locationsKey()).toEqual(["provider-locations", ""]);
    expect(locationsUrl(7)).toBe("/api/providers/7/locations");
    expect(locationUrl(7, 5)).toBe("/api/providers/7/locations/5");
  });
});

describe("useProviderServices", () => {
  it("GETs the services url and returns the services array", async () => {
    mockFetch({ services: [{ id: 1, name: "Checkup", active: true }] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProviderServices(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/7/services",
      undefined,
    );
    expect(result.current.data).toEqual([
      { id: 1, name: "Checkup", active: true },
    ]);
  });

  it("is disabled (does not fetch) without a provider id", () => {
    mockFetch({ services: [] });
    const { wrapper } = makeWrapper();
    renderHook(() => useProviderServices(null), { wrapper });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("useCreateService", () => {
  it("POSTs the body and invalidates ['provider-services', id]", async () => {
    mockFetch({ service: { id: 9, name: "Grooming" } }, { status: 201 });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateService(3), { wrapper });

    result.current.mutate({ name: "Grooming", price_cents: 5000 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/services",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Grooming", price_cents: 5000 }),
      }),
    );
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["provider-services", "3"],
    });
  });

  it("surfaces a 400 validation message", async () => {
    mockFetch(
      { error: "price_cents must be a non-negative integer" },
      { ok: false, status: 400 },
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateService(3), { wrapper });

    result.current.mutate({ name: "Bad", price_cents: -1 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe(
      "price_cents must be a non-negative integer",
    );
  });
});

describe("useUpdateService", () => {
  it("PATCHes the serviceId with the remaining changes", async () => {
    mockFetch({ service: { id: 9, name: "Renamed" } });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateService(3), { wrapper });

    result.current.mutate({ serviceId: 9, name: "Renamed" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/services/9",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["provider-services", "3"],
    });
  });

  it("reactivates a service via PATCH { active: true }", async () => {
    mockFetch({ service: { id: 9, active: true } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateService(3), { wrapper });

    result.current.mutate({ serviceId: 9, active: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/services/9",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ active: true }),
      }),
    );
  });
});

describe("useDeactivateService", () => {
  it("DELETEs the service (soft delete) and invalidates the list", async () => {
    mockFetch({ service: { id: 9, active: false } });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeactivateService(3), { wrapper });

    result.current.mutate(9);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/services/9",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["provider-services", "3"],
    });
  });
});

describe("useProviderLocations", () => {
  it("GETs the locations url and returns the locations array", async () => {
    mockFetch({ locations: [{ id: 1, name: "Main clinic" }] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProviderLocations(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/7/locations",
      undefined,
    );
    expect(result.current.data).toEqual([{ id: 1, name: "Main clinic" }]);
  });

  it("is disabled (does not fetch) without a provider id", () => {
    mockFetch({ locations: [] });
    const { wrapper } = makeWrapper();
    renderHook(() => useProviderLocations(null), { wrapper });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("useCreateLocation", () => {
  it("POSTs the body and invalidates ['provider-locations', id]", async () => {
    mockFetch({ location: { id: 5, name: "Branch" } }, { status: 201 });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateLocation(3), { wrapper });

    result.current.mutate({
      name: "Branch",
      hours_json: { mon: { open: "09:00", close: "17:00" } },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/locations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Branch",
          hours_json: { mon: { open: "09:00", close: "17:00" } },
        }),
      }),
    );
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["provider-locations", "3"],
    });
  });
});

describe("useUpdateLocation", () => {
  it("PATCHes the locationId with the remaining changes", async () => {
    mockFetch({ location: { id: 5, name: "Renamed" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateLocation(3), { wrapper });

    result.current.mutate({ locationId: 5, name: "Renamed" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/locations/5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
  });
});

describe("useDeleteLocation", () => {
  it("DELETEs the location (hard delete) and invalidates the list", async () => {
    mockFetch({ success: true });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteLocation(3), { wrapper });

    result.current.mutate(5);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/locations/5",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["provider-locations", "3"],
    });
  });
});

describe("useProviders", () => {
  it("GETs /api/providers and returns the providers array", async () => {
    mockFetch({ providers: [{ id: 1, name: "Happy Paws" }] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProviders(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith("/api/providers", undefined);
    expect(result.current.data).toEqual([{ id: 1, name: "Happy Paws" }]);
  });
});

describe("useProviderBookings", () => {
  it("fetches the bookings url WITH ?booking_status when a status is given", async () => {
    mockFetch({ bookings: [{ id: 10, booking_status: "requested" }] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useProviderBookings(7, "requested"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/7/bookings?booking_status=requested",
      undefined,
    );
    expect(result.current.data).toEqual([
      { id: 10, booking_status: "requested" },
    ]);
  });

  it("fetches the plain bookings url when no status is given", async () => {
    mockFetch({ bookings: [] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProviderBookings(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/7/bookings",
      undefined,
    );
  });

  it("is disabled (does not fetch) without a provider id", () => {
    mockFetch({ bookings: [] });
    const { wrapper } = makeWrapper();
    renderHook(() => useProviderBookings(null), { wrapper });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("useBookingAction", () => {
  it("PATCHes the appointment with {action} for confirm", async () => {
    mockFetch({ booking: { id: 9, booking_status: "confirmed" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBookingAction(3), { wrapper });

    result.current.mutate({ appointmentId: 9, action: "confirm" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/bookings/9",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "confirm" }),
      }),
    );
  });

  it("includes staffUserId in the body for assign", async () => {
    mockFetch({ booking: { id: 9, staff_user_id: 42 } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBookingAction(3), { wrapper });

    result.current.mutate({ appointmentId: 9, action: "assign", staffUserId: 42 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/bookings/9",
      expect.objectContaining({
        body: JSON.stringify({ action: "assign", staffUserId: 42 }),
      }),
    );
  });

  it("invalidates the provider's bookings on success", async () => {
    mockFetch({ booking: { id: 9 } });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useBookingAction(3), { wrapper });

    result.current.mutate({ appointmentId: 9, action: "confirm" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({
      queryKey: ["provider-bookings", "3"],
    });
  });

  it("surfaces the backend message on a 409 illegal transition", async () => {
    mockFetch(
      { error: "Only a requested booking can be confirmed" },
      { ok: false, status: 409 },
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBookingAction(3), { wrapper });

    result.current.mutate({ appointmentId: 9, action: "confirm" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe(
      "Only a requested booking can be confirmed",
    );
  });
});

describe("useCreateProvider", () => {
  beforeEach(() => {
    useProviderSelection.setState({ selectedProviderId: null });
  });

  it("POSTs the entered fields, invalidates ['providers'], and selects the new provider", async () => {
    mockFetch({ provider: { id: 99, name: "New Vet", status: "draft" } }, {
      status: 201,
    });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateProvider(), { wrapper });

    result.current.mutate({ name: "New Vet", provider_type: "vet" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "New Vet",
          provider_type: "vet",
          bio: undefined,
          logo_url: undefined,
        }),
      }),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["providers"] });
    expect(useProviderSelection.getState().selectedProviderId).toBe(99);
  });
});

describe("useProvider", () => {
  it("GETs /api/providers/[id] and returns the { provider, staff } payload", async () => {
    mockFetch({ provider: { id: 3, name: "Happy Paws" }, staff: [] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProvider(3), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith("/api/providers/3", undefined);
    expect(result.current.data).toEqual({
      provider: { id: 3, name: "Happy Paws" },
      staff: [],
    });
  });

  it("is disabled (does not fetch) without a provider id", () => {
    mockFetch({ provider: {} });
    const { wrapper } = makeWrapper();
    renderHook(() => useProvider(null), { wrapper });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("useUpdateProviderProfile", () => {
  it("PATCHes only the changed fields and invalidates the list + this provider", async () => {
    mockFetch({ provider: { id: 3, name: "Renamed" } });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateProviderProfile(3), { wrapper });

    result.current.mutate({ name: "Renamed" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["providers"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["provider", "3"] });
  });

  it("surfaces the 409 slug-in-use message", async () => {
    mockFetch({ error: "slug already in use" }, { ok: false, status: 409 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateProviderProfile(3), { wrapper });

    result.current.mutate({ slug: "taken" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe("slug already in use");
  });
});

describe("useSetProviderStatus", () => {
  it("POSTs { status } to the publish route and invalidates the caches", async () => {
    mockFetch({ provider: { id: 3, status: "published" } });
    const { qc, wrapper } = makeWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetProviderStatus(3), { wrapper });

    result.current.mutate("published");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/3/publish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ status: "published" }),
      }),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["providers"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["provider", "3"] });
  });
});
