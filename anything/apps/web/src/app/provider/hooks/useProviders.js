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

// Services + locations (c2b). One cache entry per provider; the create/update/
// delete mutations invalidate the matching key so the management screens refetch.
export const servicesKey = (providerId) => [
  "provider-services",
  String(providerId ?? ""),
];

export const servicesUrl = (providerId) => `/api/providers/${providerId}/services`;

export const serviceUrl = (providerId, serviceId) =>
  `/api/providers/${providerId}/services/${serviceId}`;

export const locationsKey = (providerId) => [
  "provider-locations",
  String(providerId ?? ""),
];

export const locationsUrl = (providerId) =>
  `/api/providers/${providerId}/locations`;

export const locationUrl = (providerId, locationId) =>
  `/api/providers/${providerId}/locations/${locationId}`;

// Staff (c2c). One cache entry per provider; invite/role/remove invalidate it so
// the staff screen + the bookings Assign-by-name picker refetch the named list.
export const staffKey = (providerId) => [
  "provider-staff",
  String(providerId ?? ""),
];

export const staffUrl = (providerId) => `/api/providers/${providerId}/staff`;

export const staffMemberUrl = (providerId, userProfileId) =>
  `/api/providers/${providerId}/staff/${userProfileId}`;

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

// --- services (c2b) ---------------------------------------------------------

// All of a provider's services — active AND inactive (the dashboard manages
// both; discovery filters elsewhere). Disabled until a providerId is known.
export function useProviderServices(providerId) {
  return useQuery({
    queryKey: servicesKey(providerId),
    queryFn: async () => {
      const data = await getJson(servicesUrl(providerId));
      return data.services ?? [];
    },
    enabled: providerId != null && providerId !== "",
  });
}

// Create a service (owner|admin). body { name*, description?, duration_min?,
// price_cents?, deposit_cents?, active? }. Numeric fields are cents/minutes
// integers — the caller converts before passing them in. 400 surfaces verbatim.
export function useCreateService(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(servicesUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKey(providerId) });
    },
  });
}

// Update a service (owner|admin). { serviceId, ...changes } — partial PATCH via
// COALESCE server-side. Also the reactivation path: pass { active: true } to
// reactivate a soft-deleted service. 400/404 surface verbatim.
export function useUpdateService(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, ...changes }) => {
      const data = await getJson(serviceUrl(providerId, serviceId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      return data.service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKey(providerId) });
    },
  });
}

// Deactivate a service (owner|admin) — DELETE is a SOFT delete (sets
// active=false; the row stays so past appointments keep their service link).
// Reactivate via useUpdateService({ active: true }).
export function useDeactivateService(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (serviceId) => {
      const data = await getJson(serviceUrl(providerId, serviceId), {
        method: "DELETE",
      });
      return data.service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKey(providerId) });
    },
  });
}

// --- locations (c2b) --------------------------------------------------------

// A provider's locations. Disabled until a providerId is known.
export function useProviderLocations(providerId) {
  return useQuery({
    queryKey: locationsKey(providerId),
    queryFn: async () => {
      const data = await getJson(locationsUrl(providerId));
      return data.locations ?? [];
    },
    enabled: providerId != null && providerId !== "",
  });
}

// Create a location (owner|admin). body { name?, address?, lat?, lng?,
// hours_json?, phone? }. lat/lng are numbers; hours_json is a free-form object.
export function useCreateLocation(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(locationsUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.location;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationsKey(providerId) });
    },
  });
}

// Update a location (owner|admin). { locationId, ...changes } — partial PATCH.
export function useUpdateLocation(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId, ...changes }) => {
      const data = await getJson(locationUrl(providerId, locationId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      return data.location;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationsKey(providerId) });
    },
  });
}

// Delete a location (owner|admin) — HARD delete (the row is removed). The FK on
// vet_appointments.provider_location_id is ON DELETE SET NULL, so past
// appointments are only unlinked, but the location itself is gone for good.
export function useDeleteLocation(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (locationId) => {
      return getJson(locationUrl(providerId, locationId), { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationsKey(providerId) });
    },
  });
}

// --- staff (c2c) ------------------------------------------------------------

// This provider's staff, JOINED to user_profiles for display names (the new
// dedicated GET — NOT useProvider's nameless staff array). Returns every row
// (active/invited/removed); the screen groups them. Disabled until a providerId.
export function useProviderStaff(providerId) {
  return useQuery({
    queryKey: staffKey(providerId),
    queryFn: async () => {
      const data = await getJson(staffUrl(providerId));
      return data.staff ?? [];
    },
    enabled: providerId != null && providerId !== "",
  });
}

// Invite an existing user by username (owner|admin). body { username, role } with
// role ∈ {admin, staff, vet}. 404 "Invitee not found", 409 "already a member or
// invited" surface verbatim; re-inviting a removed user is just inviting them
// again (the backend flips removed→invited in place).
export function useInviteStaff(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ username, role }) => {
      const data = await getJson(staffUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, role }),
      });
      return data.staff;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKey(providerId) });
    },
  });
}

// Change a member's role (owner|admin). { userProfileId, role } where role ∈
// {admin, staff, vet}. The owner's role is immutable (400). 404 if not a member
// of this provider — all surface verbatim.
export function useUpdateStaffRole(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userProfileId, role }) => {
      const data = await getJson(staffMemberUrl(providerId, userProfileId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      return data.staff;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKey(providerId) });
    },
  });
}

// Remove a member (owner|admin) — SOFT remove (status='removed', kept for history
// + re-invite). The owner cannot be removed (403). 404 if not this provider's
// member — both surface verbatim.
export function useRemoveStaff(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userProfileId) => {
      const data = await getJson(staffMemberUrl(providerId, userProfileId), {
        method: "DELETE",
      });
      return data.staff;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKey(providerId) });
    },
  });
}
