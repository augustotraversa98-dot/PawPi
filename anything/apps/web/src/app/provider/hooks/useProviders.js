import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useProviderSelection } from "../store/providerSelection";

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

// One provider's cache entry — the profile screen reads/invalidates this. The
// shared ["providers"] list is invalidated alongside it so the switcher/shell
// reflect renames + status changes.
export const providerKey = (providerId) => [
  "provider",
  String(providerId ?? ""),
];

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

// Create a provider (onboarding). The caller becomes its 'owner' active staff
// server-side; the row comes back status='draft'. On success we refresh the
// providers list AND select the new provider in the selection store so the shell
// immediately resolves it and lands on the dashboard.
export function useCreateProvider() {
  const queryClient = useQueryClient();
  const setSelectedProviderId = useProviderSelection(
    (s) => s.setSelectedProviderId,
  );
  return useMutation({
    mutationFn: async ({ name, provider_type, bio, logo_url }) => {
      const data = await getJson("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, provider_type, bio, logo_url }),
      });
      return data.provider;
    },
    onSuccess: (provider) => {
      if (provider?.id != null) setSelectedProviderId(provider.id);
      queryClient.invalidateQueries({ queryKey: providersKey() });
    },
  });
}

// One provider with its staff (GET /api/providers/[id]). Disabled until a
// providerId is known. Returns the raw { provider, staff } payload.
export function useProvider(providerId) {
  return useQuery({
    queryKey: providerKey(providerId),
    queryFn: () => getJson(`/api/providers/${providerId}`),
    enabled: providerId != null && providerId !== "",
  });
}

// PATCH provider profile fields. Callers send ONLY the changed fields (the
// backend whitelists name/provider_type/bio/logo_url/slug; 400 if none, 409 if
// the slug is taken — both surface verbatim via getJson). On success refresh the
// list + this provider's cache.
export function useUpdateProviderProfile(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes) => {
      const data = await getJson(`/api/providers/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      return data.provider;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providersKey() });
      queryClient.invalidateQueries({ queryKey: providerKey(providerId) });
    },
  });
}

// Publish / unpublish — the single status toggle (POST .../publish {status}).
// status is 'draft' | 'published'. On success refresh the same caches so the
// shell + profile reflect the new state.
export function useSetProviderStatus(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status) => {
      const data = await getJson(`/api/providers/${providerId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return data.provider;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providersKey() });
      queryClient.invalidateQueries({ queryKey: providerKey(providerId) });
    },
  });
}
