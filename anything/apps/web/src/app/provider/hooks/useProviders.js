import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

// Data hooks for the provider web dashboard. Every hook talks to the already-built
// backend over the global relative-fetch override (root.tsx) — no backend changes.
// Query-key + URL builders are exported so tests can pin the exact contracts.

// --- key / url builders -----------------------------------------------------

export const providersKey = () => ["providers"];

// bookingStatus is part of the key so each filter has its own cache entry; the
// provider id is the shared prefix used for invalidation after a mutation.
export const bookingsKey = (providerId, bookingStatus) => [
  "provider-bookings",
  String(providerId ?? ""),
  bookingStatus ?? "all",
];

export const bookingsPrefixKey = (providerId) => [
  "provider-bookings",
  String(providerId ?? ""),
];

export const bookingsUrl = (providerId, bookingStatus) =>
  bookingStatus
    ? `/api/providers/${providerId}/bookings?booking_status=${encodeURIComponent(
        bookingStatus,
      )}`
    : `/api/providers/${providerId}/bookings`;

// --- fetch helpers ----------------------------------------------------------

// Read JSON and surface the backend's { error } message on a non-2xx so the UI
// can show "Only a requested booking can be confirmed" etc. rather than swallow.
async function getJson(url, init) {
  const res = await fetch(url, init);
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

// --- hooks ------------------------------------------------------------------

// Providers the logged-in user is ACTIVE staff of. [] = belongs to none.
export function useProviders() {
  return useQuery({
    queryKey: providersKey(),
    queryFn: async () => {
      const data = await getJson("/api/providers");
      return data.providers ?? [];
    },
  });
}

// The bookings inbox for a provider, optionally filtered by booking_status.
export function useProviderBookings(providerId, bookingStatus) {
  return useQuery({
    queryKey: bookingsKey(providerId, bookingStatus),
    queryFn: async () => {
      const data = await getJson(bookingsUrl(providerId, bookingStatus));
      return data.bookings ?? [];
    },
    enabled: providerId != null && providerId !== "",
  });
}

// confirm / decline / cancel / assign one booking. staffUserId is only sent when
// provided (required for assign, optional assign-while-confirming). On success we
// invalidate every cached filter for this provider so the inbox reflects the new
// status; errors (400/404/409) propagate with the backend message intact.
export function useBookingAction(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ appointmentId, action, staffUserId }) => {
      const hasStaff =
        staffUserId !== undefined && staffUserId !== null && staffUserId !== "";
      const body = hasStaff ? { action, staffUserId } : { action };
      return getJson(`/api/providers/${providerId}/bookings/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingsPrefixKey(providerId) });
    },
  });
}
