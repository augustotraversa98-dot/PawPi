import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  providersKey,
  bookingsKey,
  bookingsPrefixKey,
  bookingsUrl,
  useProviders,
  useProviderBookings,
  useBookingAction,
} from "./useProviders";

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
