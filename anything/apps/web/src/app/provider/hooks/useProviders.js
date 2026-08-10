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

// Calendar view (ticket 2.24): the same bookings endpoint with ?view=calendar and a
// [from, to) start_at window. Keyed by the window so each week/day caches separately.
export const bookingsCalendarKey = (providerId, from, to) => [
  "provider-bookings-calendar",
  String(providerId ?? ""),
  from ?? "",
  to ?? "",
];

export const bookingsCalendarUrl = (providerId, from, to) =>
  `/api/providers/${providerId}/bookings?view=calendar&from=${encodeURIComponent(
    from,
  )}&to=${encodeURIComponent(to)}`;

// One provider's cache entry — the profile screen reads/invalidates this. The
// shared ["providers"] list is invalidated alongside it so the switcher/shell
// reflect renames + status changes.
export const providerKey = (providerId) => [
  "provider",
  String(providerId ?? ""),
];

// A provider's capabilities (ticket 2.1). One cache entry per provider; the Profile
// editor reads/writes this. Writes invalidate this key AND ["providers"] so the shell
// nav (which filters sections by the active provider's capabilities) updates at once.
export const capabilitiesKey = (providerId) => [
  "provider-capabilities",
  String(providerId ?? ""),
];

export const capabilitiesUrl = (providerId) =>
  `/api/providers/${providerId}/capabilities`;

// Services + locations (c2b). One cache entry per provider; the create/update/
// delete mutations invalidate the matching key so the management screens refetch.
export const servicesKey = (providerId) => [
  "provider-services",
  String(providerId ?? ""),
];

export const servicesUrl = (providerId) => `/api/providers/${providerId}/services`;

export const serviceUrl = (providerId, serviceId) =>
  `/api/providers/${providerId}/services/${serviceId}`;

// Storefront posts (ticket 2.22). One cache entry per provider; compose/delete
// invalidate it so the storefront composer refetches.
export const postsKey = (providerId) => [
  "provider-posts",
  String(providerId ?? ""),
];

export const postsUrl = (providerId) => `/api/providers/${providerId}/posts`;

export const postUrl = (providerId, postId) =>
  `/api/providers/${providerId}/posts/${postId}`;

export const reviewsKey = (providerId) => [
  "provider-reviews",
  String(providerId ?? ""),
];

export const reviewsUrl = (providerId) =>
  `/api/providers/${providerId}/reviews`;

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

// The caller's own pending provider invitations (the "my invites" read that lets
// an invited user DISCOVER + accept/decline before they are active staff). One
// shared cache entry; accepting/declining invalidates it AND ["providers"].
export const providerInvitesKey = () => ["provider-invites"];

export const providerInvitesUrl = () => `/api/provider-invites`;

export const staffAcceptUrl = (providerId) =>
  `/api/providers/${providerId}/staff/accept`;

// Clinical (c3). The pet record is the consent-gated medical surface; its cache
// entry is keyed by (provider, pet) and invalidated after a successful access
// request or a note/vaccination write so the gate + record re-evaluate.
export const petRecordKey = (providerId, petId) => [
  "pet-record",
  String(providerId ?? ""),
  String(petId ?? ""),
];

export const petRecordUrl = (providerId, petId) =>
  `/api/providers/${providerId}/pets/${petId}/record`;

export const accessRequestsUrl = (providerId) =>
  `/api/providers/${providerId}/access-requests`;

export const petNotesUrl = (providerId, petId) =>
  `/api/providers/${providerId}/pets/${petId}/notes`;

export const petVaccinationsUrl = (providerId, petId) =>
  `/api/providers/${providerId}/pets/${petId}/vaccinations`;

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
    const err = new Error(data?.error || `Request failed (${res.status})`);
    // Attach the HTTP status so callers can branch — the clinical record query
    // treats 403 (no/expired/revoked grant or missing scope) as a first-class UI
    // state and must not auto-retry it.
    err.status = res.status;
    throw err;
  }
  return data;
}

// Chat threads + messages (ticket 2.5). Provider-side inbox keyed by provider id;
// a conversation's messages keyed by thread id. The unread badge keyed per provider.
export const threadsKey = (providerId) => [
  "provider-threads",
  String(providerId ?? ""),
];
export const threadMessagesKey = (threadId) => [
  "thread-messages",
  String(threadId ?? ""),
];
export const threadsUnreadKey = (providerId) => [
  "provider-threads-unread",
  String(providerId ?? ""),
];

// Dashboard analytics (ticket 2.14). One cache entry per provider; the dashboard home reads it.
export const analyticsKey = (providerId) => [
  "provider-analytics",
  String(providerId ?? ""),
];

export const analyticsUrl = (providerId) =>
  `/api/providers/${providerId}/analytics`;

// Sales / payouts / reconciliation (ticket 2.69). One read-only cache entry per provider; the
// Sales dashboard section reads revenue + ledger + payouts + reconciliation from it.
export const salesKey = (providerId) => [
  "provider-sales",
  String(providerId ?? ""),
];

export const salesUrl = (providerId) => `/api/providers/${providerId}/sales`;

// Payment-account connection status (ACTION 2 §1) — whether each rail (MercadoPago /
// Binance) is linked, so the Sales dashboard can show connected/not and gate the connect
// button. Read-only; the endpoint never returns tokens.
export const paymentAccountsKey = (providerId) => [
  "provider-payment-accounts",
  String(providerId ?? ""),
];

export const paymentAccountsUrl = (providerId) =>
  `/api/providers/${providerId}/payment-accounts`;

// Rx fulfillment queue (ticket 2.71) — the dispensing provider's incoming fulfillment orders.
export const rxFulfillmentKey = (providerId) => [
  "provider-rx-fulfillment",
  String(providerId ?? ""),
];

export const rxFulfillmentUrl = (providerId) =>
  `/api/providers/${providerId}/rx-fulfillment-orders`;

// Insurance policies (ticket 2.72) — the insurer's bound/applied policies.
export const insurancePoliciesKey = (providerId) => [
  "provider-insurance-policies",
  String(providerId ?? ""),
];

export const insurancePoliciesUrl = (providerId) =>
  `/api/providers/${providerId}/insurance-policies`;

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

// The dashboard HOME summary (GET /api/providers/[id]/analytics) — revenue, bookings,
// occupancy, rating, top services, all aggregated over ONLY this provider's own rows. Disabled
// until a providerId is known.
export function useProviderAnalytics(providerId) {
  return useQuery({
    queryKey: analyticsKey(providerId),
    queryFn: () => getJson(analyticsUrl(providerId)),
    enabled: providerId != null && providerId !== "",
  });
}

// The Sales section read (GET /api/providers/[id]/sales) — revenue series + totals, ledger,
// payouts, and aggregate reconciliation, all over ONLY this provider's own money rows. Read-only.
// Disabled until a providerId is known.
export function useProviderSales(providerId) {
  return useQuery({
    queryKey: salesKey(providerId),
    queryFn: () => getJson(salesUrl(providerId)),
    enabled: providerId != null && providerId !== "",
  });
}

// Connection status of the payment rails for the active provider (ACTION 2 §1). Used by
// the Sales dashboard's "Payment account" card.
export function usePaymentAccounts(providerId) {
  return useQuery({
    queryKey: paymentAccountsKey(providerId),
    queryFn: () => getJson(paymentAccountsUrl(providerId)),
    enabled: providerId != null && providerId !== "",
  });
}

// Disconnect this provider's MercadoPago account (DELETE .../payment-accounts/mercadopago).
// Clears the stored token + flips status to 'disconnected' so a bad/undecryptable token can
// be replaced by reconnecting. Invalidates the accounts query so the card flips to "connect".
export const mercadopagoAccountUrl = (providerId) =>
  `/api/providers/${providerId}/payment-accounts/mercadopago`;

export function useDisconnectMercadoPago(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      getJson(mercadopagoAccountUrl(providerId), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: paymentAccountsKey(providerId),
      });
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

// Calendar bookings for a [from, to) window (ticket 2.24). Disabled until a
// providerId AND a window are known. Returns the richer grid rows (value/paid/
// location/pet info) — still booking-context only, no medical data.
export function useProviderBookingsCalendar(providerId, from, to) {
  return useQuery({
    queryKey: bookingsCalendarKey(providerId, from, to),
    queryFn: async () => {
      const data = await getJson(bookingsCalendarUrl(providerId, from, to));
      return data.bookings ?? [];
    },
    enabled:
      providerId != null && providerId !== "" && Boolean(from) && Boolean(to),
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

// End a telehealth consult (ticket: telehealth "End consult" gap). The vet's deliberate
// action — PATCHes the EXISTING telehealth session lifecycle endpoint with action='end',
// which the bookings inbox SELECT already surfaced as telehealth_session_id per row
// (BookingsInbox.jsx). Not tied to closing a browser tab: there's no reliable signal for
// that, so this only fires on an explicit click. On success we invalidate the same bookings
// cache as useBookingAction so the row's telehealth_session_status flips to 'ended'.
export function useEndTelehealthConsult(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, summary }) => {
      const body = summary ? { action: "end", summary } : { action: "end" };
      return getJson(
        `/api/providers/${providerId}/telehealth/sessions/${sessionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingsPrefixKey(providerId) });
    },
  });
}

// The Rx fulfillment queue (GET /api/providers/[id]/rx-fulfillment-orders) — incoming orders for a
// `pharmacy`-capable provider. Capability-gated server-side; disabled until a providerId is known.
export function useProviderRxFulfillment(providerId) {
  return useQuery({
    queryKey: rxFulfillmentKey(providerId),
    queryFn: () => getJson(rxFulfillmentUrl(providerId)),
    enabled: providerId != null && providerId !== "",
  });
}

// Provider acts on a fulfillment: set price, accept, advance status, mark fulfilled (which consumes
// a refill on the 2.53 safe path server-side).
export function useRxFulfillmentAction(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, status, price_cents }) => {
      const body = {};
      if (status !== undefined) body.status = status;
      if (price_cents !== undefined) body.price_cents = price_cents;
      return getJson(
        `/api/providers/${providerId}/rx-fulfillment-orders/${orderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rxFulfillmentKey(providerId) });
    },
  });
}

// The insurer's policies (GET /api/providers/[id]/insurance-policies) — applications + bound
// policies. Capability-gated server-side; disabled until a providerId is known.
export function useProviderInsurancePolicies(providerId) {
  return useQuery({
    queryKey: insurancePoliciesKey(providerId),
    queryFn: () => getJson(insurancePoliciesUrl(providerId)),
    enabled: providerId != null && providerId !== "",
  });
}

// Insurer issues/advances a policy: set policy_number/premium/billing/effective, advance status.
// 'active' is payment-driven server-side (never set here).
export function useInsurancePolicyAction(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyId, ...patch }) =>
      getJson(`/api/providers/${providerId}/insurance-policies/${policyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: insurancePoliciesKey(providerId),
      });
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
    mutationFn: async ({ name, provider_type, bio, logo_url, capabilities }) => {
      // capabilities (Phase 3 onboarding multi-select) is optional; when omitted the
      // POST route seeds [provider_type] as today. Only forward it when provided so an
      // undefined value stays absent from the body (never sent as null).
      const body = { name, provider_type, bio, logo_url };
      if (capabilities !== undefined) body.capabilities = capabilities;
      const data = await getJson("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

// Confirm-first enrichment (ticket 2.21): POST .../enrich returns a PROPOSED draft from the
// provider's links. It writes NOTHING — the UI pre-fills the edit form from the draft and the
// provider saves via useUpdateProviderProfile. A clean 503 surfaces when enrichment is unconfigured.
export function useEnrichProvider(providerId) {
  return useMutation({
    mutationFn: async () => {
      const data = await getJson(`/api/providers/${providerId}/enrich`, {
        method: "POST",
      });
      return data; // { draft, sources, applied:false }
    },
  });
}

// Document enrichment (ticket 2.82): POST .../enrich/document with an uploaded file's
// { url, filename, mimeType } returns a PROPOSED { services, products } catalog. Writes NOTHING —
// the provider reviews + applies each row via the existing services / shop-products CRUD. A clean
// 503 surfaces when ENRICHMENT_LLM_KEY is unset.
export function useEnrichProviderDocument(providerId) {
  return useMutation({
    mutationFn: async (file) => {
      const data = await getJson(`/api/providers/${providerId}/enrich/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(file ?? {}),
      });
      return data; // { draft: { services, products }, sources, applied:false }
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

// --- capabilities (ticket 2.1) ----------------------------------------------

// This provider's capabilities (GET .../capabilities → string[]). Any active staff may
// read. Disabled until a providerId is known.
export function useProviderCapabilities(providerId) {
  return useQuery({
    queryKey: capabilitiesKey(providerId),
    queryFn: async () => {
      const data = await getJson(capabilitiesUrl(providerId));
      return data.capabilities ?? [];
    },
    enabled: providerId != null && providerId !== "",
  });
}

// Add (POST { capability }) / remove (DELETE ?capability=) a capability — owner|admin.
// Both invalidate the capabilities cache AND ["providers"] so the shell nav re-filters
// its sections immediately. A 403 (non-admin) / 400 (bad value) surfaces verbatim.
export function useAddCapability(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (capability) => {
      const data = await getJson(capabilitiesUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability }),
      });
      return data.capabilities ?? [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capabilitiesKey(providerId) });
      queryClient.invalidateQueries({ queryKey: providersKey() });
    },
  });
}

export function useRemoveCapability(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (capability) => {
      const data = await getJson(
        `${capabilitiesUrl(providerId)}?capability=${encodeURIComponent(capability)}`,
        { method: "DELETE" },
      );
      return data.capabilities ?? [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capabilitiesKey(providerId) });
      queryClient.invalidateQueries({ queryKey: providersKey() });
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

// --- storefront posts (ticket 2.22) -----------------------------------------

// All of a provider's non-deleted posts (any active staff). Disabled until a
// providerId is known.
export function useProviderPosts(providerId) {
  return useQuery({
    queryKey: postsKey(providerId),
    queryFn: async () => {
      const data = await getJson(postsUrl(providerId));
      return data.posts ?? [];
    },
    enabled: providerId != null && providerId !== "",
  });
}

// Read this provider's reviews for the storefront preview (2b), via the existing public
// reviews endpoint. That endpoint 404s for a DRAFT/unpublished provider (published-gated) —
// which is fine for a read-only preview: on any error we simply resolve to an empty list so
// a draft preview shows the "no reviews yet" state rather than throwing. retry:false so the
// guaranteed draft 404 isn't retried.
export function useProviderReviews(providerId) {
  return useQuery({
    queryKey: reviewsKey(providerId),
    queryFn: async () => {
      try {
        const data = await getJson(reviewsUrl(providerId));
        return data.reviews ?? [];
      } catch {
        return [];
      }
    },
    enabled: providerId != null && providerId !== "",
    retry: false,
  });
}

// Compose a post (any active staff). body { body?, image_urls? } — needs text or
// at least one image; 400 surfaces verbatim.
export function useCreateProviderPost(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(postsUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.post;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postsKey(providerId) });
    },
  });
}

// Soft-delete a post (any active staff).
export function useDeleteProviderPost(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId) => {
      await getJson(postUrl(providerId, postId), { method: "DELETE" });
      return postId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postsKey(providerId) });
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

// --- availability windows (Hours editor) ------------------------------------
// The provider's raw weekly bookable windows — the config surface behind the slot engine.
// Distinct from the public slot-computing GET: this reads the raw provider_availability ROWS
// (provider-wide only) via the owner endpoint so the editor can list/add/edit/delete them.

export const availabilityWindowsKey = (providerId) => [
  "provider-availability-windows",
  String(providerId ?? ""),
];

// The base collection (POST create lives here); the raw owner read is the /windows child.
export const availabilityUrl = (providerId) =>
  `/api/providers/${providerId}/availability`;

export const availabilityWindowsUrl = (providerId) =>
  `/api/providers/${providerId}/availability/windows`;

export const availabilityWindowUrl = (providerId, availabilityId) =>
  `/api/providers/${providerId}/availability/${availabilityId}`;

// Raw provider-wide windows + a count of the non-provider-wide (per-staff/capability/location)
// windows the editor does not manage. Disabled until a providerId is known.
export function useAvailabilityWindows(providerId) {
  return useQuery({
    queryKey: availabilityWindowsKey(providerId),
    queryFn: () => getJson(availabilityWindowsUrl(providerId)),
    enabled: providerId != null && providerId !== "",
  });
}

// Create a provider-wide window (owner|admin) via the existing POST. body { weekday*,
// start_time*, end_time*, slot_minutes? } — staff/capability/location are left NULL server-side.
export function useCreateAvailabilityWindow(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(availabilityUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.availability;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: availabilityWindowsKey(providerId),
      });
    },
  });
}

// Update a window (owner|admin). { availabilityId, ...changes } — partial PATCH; the server
// validates the merged result (start<end, sane slot_minutes).
export function useUpdateAvailabilityWindow(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ availabilityId, ...changes }) => {
      const data = await getJson(
        availabilityWindowUrl(providerId, availabilityId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        },
      );
      return data.availability;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: availabilityWindowsKey(providerId),
      });
    },
  });
}

// Delete a window (owner|admin) — HARD delete (the row is removed).
export function useDeleteAvailabilityWindow(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (availabilityId) =>
      getJson(availabilityWindowUrl(providerId, availabilityId), {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: availabilityWindowsKey(providerId),
      });
    },
  });
}

// --- calendar import feeds (ticket 2.84) ------------------------------------
// A provider's external iCal/ICS feeds + their imported busy blocks. Feeds are managed by
// owner/admin; busy blocks are read-only (written only by the sync DEFINER). Disabled until a
// providerId is known.
const calendarFeedsKey = (providerId) => ["provider-calendar-feeds", String(providerId)];
const calendarFeedsUrl = (providerId) =>
  `/api/providers/${providerId}/calendar-feeds`;

export function useProviderCalendarFeeds(providerId) {
  return useQuery({
    queryKey: calendarFeedsKey(providerId),
    enabled: providerId != null && providerId !== "",
    queryFn: async () => {
      const data = await getJson(calendarFeedsUrl(providerId));
      return data.feeds ?? [];
    },
  });
}

// Add a feed (owner|admin). body { ics_url }.
export function useAddCalendarFeed(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ics_url) => {
      const data = await getJson(calendarFeedsUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ics_url }),
      });
      return data.feed;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarFeedsKey(providerId) });
    },
  });
}

// "Refresh now" — re-fetch + re-parse ONE feed (owner|admin). Returns { synced, ok }.
export function useSyncCalendarFeed(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (feedId) => {
      return getJson(`${calendarFeedsUrl(providerId)}/${feedId}/sync`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarFeedsKey(providerId) });
    },
  });
}

// Remove a feed (owner|admin) — soft-delete + clears its busy blocks.
export function useRemoveCalendarFeed(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (feedId) => {
      return getJson(`${calendarFeedsUrl(providerId)}/${feedId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarFeedsKey(providerId) });
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

// --- invites (staff-accept) -------------------------------------------------

// The caller's own pending invitations (GET /api/provider-invites). Self-scoped
// server-side; needs only a logged-in session (the invitee is NOT active staff
// yet), so this hook is safe to use OUTSIDE the active-provider gate.
export function useMyProviderInvites() {
  return useQuery({
    queryKey: providerInvitesKey(),
    queryFn: async () => {
      const data = await getJson(providerInvitesUrl());
      return data.invites ?? [];
    },
  });
}

// Accept or decline one of the caller's own invites (POST .../staff/accept).
// Default accepts (flips the invited row to 'active'); pass { action: 'decline' }
// to soft-remove it. 404 "No pending invite for this provider" surfaces verbatim.
// On success we invalidate the invites list AND ["providers"] — accepting makes
// the caller active staff, so the shell's provider list must refetch to resolve
// the now-accessible provider.
export function useRespondToInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, action }) => {
      const body = action === "decline" ? { action: "decline" } : {};
      const data = await getJson(staffAcceptUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.staff;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerInvitesKey() });
      queryClient.invalidateQueries({ queryKey: providersKey() });
    },
  });
}

// --- clinical (c3) ----------------------------------------------------------

// Read a pet's shared medical record (assertCareAccess 'medical_read'). A 403
// (no/expired/revoked grant or missing scope) is a FIRST-CLASS state, not an
// error to retry: retry is disabled for 403 so the screen branches to the
// request/revoked panel immediately. Enabled only when both ids are present.
// The query is mounted even on 403, so a successful re-request + refetch flips it
// to the record without remounting. Read NOTHING about the pet any other way.
export function usePetRecord(providerId, petId) {
  return useQuery({
    queryKey: petRecordKey(providerId, petId),
    queryFn: () => getJson(petRecordUrl(providerId, petId)),
    enabled:
      providerId != null &&
      providerId !== "" &&
      petId != null &&
      petId !== "",
    // Never auto-retry a 403 — it's a deliberate consent denial, not a blip.
    retry: (failureCount, error) =>
      error?.status !== 403 && failureCount < 1,
  });
}

// Request scoped access to a pet's record (any active staff). body { petId,
// scopes, bookingId? } → creates a PENDING grant the owner approves in their app.
// 409 ("already pending/active") is an informative state, not a hard failure —
// the caller surfaces it as "already requested". On success/409 we invalidate the
// record query so a refetch reflects the new state.
export function useRequestAccess(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ petId, scopes, bookingId }) => {
      const data = await getJson(accessRequestsUrl(providerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, scopes, bookingId }),
      });
      return data.grant;
    },
    onSuccess: (_grant, { petId }) => {
      queryClient.invalidateQueries({
        queryKey: petRecordKey(providerId, petId),
      });
    },
  });
}

// Write a vet note back to the pet's record (assertCareAccess 'medical_write').
// body { note*, note_date?, vet_name?, appointment_id? }. 400 if note missing;
// 403 if the grant doesn't cover medical_write — both surface verbatim. Refetches
// the record on success so the new note appears.
export function useAddVetNote(providerId, petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(petNotesUrl(providerId, petId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: petRecordKey(providerId, petId),
      });
    },
  });
}

// Write a vaccination back to the pet's record (assertCareAccess
// 'vaccinations_write'). body { name*, date_given?, expires_on?, lot? }. This is
// the SAME pet_vaccinations the owner app reads — the row shows in their Vet
// Record. 400 if name missing; 403 if the grant lacks vaccinations_write.
export function useAddVaccination(providerId, petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(petVaccinationsUrl(providerId, petId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.vaccination;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: petRecordKey(providerId, petId),
      });
    },
  });
}

// --- chat / messaging (ticket 2.5) ------------------------------------------

// Provider-side thread inbox (GET /api/threads?side=provider&providerId=). RLS
// restricts to threads of providers the caller staffs; the providerId narrows to
// the active one. Polls every 15s so new owner messages surface without a manual
// refresh (the documented "polling, not heavy realtime" choice).
export function useProviderThreads(providerId) {
  return useQuery({
    queryKey: threadsKey(providerId),
    enabled: providerId != null && providerId !== "",
    refetchInterval: 15000,
    queryFn: async () => {
      const data = await getJson(
        `/api/threads?side=provider&providerId=${encodeURIComponent(providerId)}`,
      );
      return data.threads ?? [];
    },
  });
}

// One thread's messages (GET /api/threads/[id]/messages). Newest-first; polls every
// 8s while the conversation is open. Enabled only with a thread id.
export function useThreadMessages(threadId) {
  return useQuery({
    queryKey: threadMessagesKey(threadId),
    enabled: threadId != null && threadId !== "",
    refetchInterval: 8000,
    queryFn: async () => {
      const data = await getJson(
        `/api/threads/${encodeURIComponent(threadId)}/messages?limit=50`,
      );
      return data.messages ?? [];
    },
  });
}

// Send a message (POST /api/threads/[id]/messages). body { body?, attachment_url? }.
// On success refetch this thread's messages + the provider thread list (last message
// + ordering) + the unread badge.
export function useSendMessage(providerId, threadId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(
        `/api/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return data.message;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadMessagesKey(threadId) });
      queryClient.invalidateQueries({ queryKey: threadsKey(providerId) });
      queryClient.invalidateQueries({ queryKey: threadsUnreadKey(providerId) });
    },
  });
}

// Mark a thread read (POST /api/threads/[id]/read). Clears the unread badge for the
// caller; refetches the thread list (per-thread unread) + the provider unread total.
export function useMarkThreadRead(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (threadId) => {
      const data = await getJson(
        `/api/threads/${encodeURIComponent(threadId)}/read`,
        { method: "POST" },
      );
      return data.updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadsKey(providerId) });
      queryClient.invalidateQueries({ queryKey: threadsUnreadKey(providerId) });
    },
  });
}

// Provider-side unread total (GET /api/threads/unread-count?side=provider). Drives
// the Chats nav badge; polls every 30s.
export function useProviderUnreadCount(providerId) {
  return useQuery({
    queryKey: threadsUnreadKey(providerId),
    enabled: providerId != null && providerId !== "",
    refetchInterval: 30000,
    queryFn: async () => {
      const data = await getJson(
        `/api/threads/unread-count?side=provider&providerId=${encodeURIComponent(providerId)}`,
      );
      return data.unread_count ?? 0;
    },
  });
}

// --- daycare & boarding (ticket 2.8) ----------------------------------------
// The facility dashboard section: occupancy list, check-in/out, report cards,
// required-vaccine config, and the consent-gated vaccine check.

export const daycareStaysKey = (providerId, status) => [
  "provider-daycare-stays",
  String(providerId ?? ""),
  status ?? "all",
];
export const daycareStaysPrefixKey = (providerId) => [
  "provider-daycare-stays",
  String(providerId ?? ""),
];
export const daycareRequirementsKey = (providerId) => [
  "provider-daycare-requirements",
  String(providerId ?? ""),
];

// The facility OCCUPANCY list (GET /api/providers/[id]/daycare-stays). Optional status
// filter. Each row carries pet/owner/location names + report_card_count + the owner's
// feeding/med instructions. RLS scopes per-row visibility to granted pets.
export function useDaycareStays(providerId, status) {
  return useQuery({
    queryKey: daycareStaysKey(providerId, status),
    enabled: providerId != null && providerId !== "",
    queryFn: async () => {
      const url = status
        ? `/api/providers/${providerId}/daycare-stays?status=${encodeURIComponent(status)}`
        : `/api/providers/${providerId}/daycare-stays`;
      const data = await getJson(url);
      return data.stays ?? [];
    },
  });
}

// Check a pet IN / OUT (or cancel) a stay (PATCH .../daycare-stays/[stayId]).
// mutateAsync({ stayId, action }) where action is check_in | check_out | cancel.
export function useDaycareStayAction(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stayId, action }) => {
      const data = await getJson(
        `/api/providers/${providerId}/daycare-stays/${stayId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      return data.stay;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: daycareStaysPrefixKey(providerId),
      });
    },
  });
}

// Post a DAILY REPORT CARD on a stay (POST .../daycare-stays/[stayId]/report-cards).
// mutateAsync({ stayId, date*, mood?, meals?, activities?, notes?, photo_urls? }).
export function usePostReportCard(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stayId, ...body }) => {
      const data = await getJson(
        `/api/providers/${providerId}/daycare-stays/${stayId}/report-cards`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return data.report_card;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: daycareStaysPrefixKey(providerId),
      });
    },
  });
}

// The facility's REQUIRED VACCINES (GET .../daycare-requirements).
export function useDaycareRequirements(providerId) {
  return useQuery({
    queryKey: daycareRequirementsKey(providerId),
    enabled: providerId != null && providerId !== "",
    queryFn: async () => {
      const data = await getJson(`/api/providers/${providerId}/daycare-requirements`);
      return data.requirements ?? [];
    },
  });
}

// Add a required vaccine (owner|admin). mutateAsync({ vaccine_name*, location_id? }).
export function useAddDaycareRequirement(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(`/api/providers/${providerId}/daycare-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.requirement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: daycareRequirementsKey(providerId),
      });
    },
  });
}

// Run the CONSENT-GATED vaccine check for a pet (GET .../pets/[petId]/vaccine-check).
// Returns { required, passed, missing, vaccinations } — or a 403 with needs_consent
// when the facility lacks a medical_read grant (the UI prompts the owner to share). Not
// auto-fetched: call refetch() from a button so the audit/medical read is intentional.
export function usePetVaccineCheck(providerId, petId, locationId) {
  return useQuery({
    queryKey: [
      "provider-vaccine-check",
      String(providerId ?? ""),
      String(petId ?? ""),
      String(locationId ?? ""),
    ],
    enabled: false, // intentional: triggered by an explicit "Check vaccines" action
    retry: false,
    queryFn: async () => {
      const url = locationId
        ? `/api/providers/${providerId}/pets/${petId}/vaccine-check?location_id=${encodeURIComponent(locationId)}`
        : `/api/providers/${providerId}/pets/${petId}/vaccine-check`;
      return getJson(url);
    },
  });
}

// --- training (ticket 2.10) -------------------------------------------------
// The TRAINER workspace: manage 1:1 sessions / group classes / programs and LOG per-pet
// PROGRESS. All data flows through the already-built backend; RLS (0036) + the capability
// gate + assertCareAccess are the real guards. Distinct from the consumer self-Training tab.

export const trainingSessionsKey = (providerId) => [
  "provider-training-sessions",
  String(providerId ?? ""),
];

export const trainingProgressKey = (providerId, sessionId) => [
  "provider-training-progress",
  String(providerId ?? ""),
  String(sessionId ?? "all"),
];

export const trainingProgressPrefixKey = (providerId) => [
  "provider-training-progress",
  String(providerId ?? ""),
];

// The trainer's session/class SCHEDULE (GET .../training-sessions). Each group class
// carries attendee_count + capacity so the UI shows fullness.
export function useTrainingSessions(providerId) {
  return useQuery({
    queryKey: trainingSessionsKey(providerId),
    enabled: providerId != null && providerId !== "",
    queryFn: async () => {
      const data = await getJson(`/api/providers/${providerId}/training-sessions`);
      return data.sessions ?? [];
    },
  });
}

// Create a session/class (POST .../training-sessions). mutateAsync({ kind*, title?,
// capacity?, scheduled_at?, service_id?, program_id? }).
export function useCreateTrainingSession(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(`/api/providers/${providerId}/training-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trainingSessionsKey(providerId) });
    },
  });
}

// The roster/progress for a session (GET .../training-progress?session_id=). RLS scopes to
// attendees the trainer holds a grant on.
export function useTrainingProgress(providerId, sessionId) {
  return useQuery({
    queryKey: trainingProgressKey(providerId, sessionId),
    enabled: providerId != null && providerId !== "" && sessionId != null,
    queryFn: async () => {
      const data = await getJson(
        `/api/providers/${providerId}/training-progress?session_id=${encodeURIComponent(sessionId)}`,
      );
      return data.progress ?? [];
    },
  });
}

// Log per-pet progress (POST .../training-progress). Two shapes:
//   - update an existing roster row: { progress_id, attended?, progress_note?, status?,
//     video_lesson_urls? }
//   - create a new one (1:1 / program session): { session_id, pet_id, program_id?, ... }
// The backend gates capability('trainer') + assertCareAccess('health_logs_write').
export function useLogTrainingProgress(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(`/api/providers/${providerId}/training-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.progress;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trainingProgressPrefixKey(providerId),
      });
    },
  });
}

// ── Shop / e-commerce (ticket 2.11) ─────────────────────────────────────────────
export const shopProductsKey = (providerId) => ["provider", providerId, "shop-products"];
export const shopOrdersKey = (providerId) => ["provider", providerId, "shop-orders"];

// The shop's catalog (GET .../shop-products). RLS: provider admins see all (incl. inactive).
export function useShopProducts(providerId) {
  return useQuery({
    queryKey: shopProductsKey(providerId),
    enabled: providerId != null && providerId !== "",
    queryFn: async () => {
      const data = await getJson(`/api/providers/${providerId}/shop-products`);
      return data.products ?? [];
    },
  });
}

// Create a product (POST .../shop-products). mutateAsync({ name*, price_cents*, stock_qty?,
// description?, image_urls?, category?, is_rx?, active? }). Admin-only (gated server-side).
export function useCreateShopProduct(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(`/api/providers/${providerId}/shop-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shopProductsKey(providerId) });
    },
  });
}

// Update a product (PATCH .../shop-products/[productId]). mutateAsync({ productId, ...fields }).
export function useUpdateShopProduct(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, ...body }) => {
      const data = await getJson(
        `/api/providers/${providerId}/shop-products/${productId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return data.product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shopProductsKey(providerId) });
    },
  });
}

// --- Storefront merchandising (Phase 2c) --------------------------------------
// The editor's reorder + section-order writes (2c-i endpoints). Featured/discount edits reuse
// useUpdateShopProduct / useUpdateService (their PATCH routes accept is_featured +
// compare_at_cents). Each invalidates the read the "view-as-customer" preview consumes.

// PATCH providers.storefront_section_order (owner|admin). mutateAsync(section_order:string[]|null).
export function useSetStorefrontLayout(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (section_order) => {
      const data = await getJson(`/api/providers/${providerId}/storefront-layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_order }),
      });
      return data.section_order;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: providerKey(providerId) }),
  });
}

// PATCH .../shop-products/reorder (owner|admin). mutateAsync(ordered_ids:number[]).
export function useReorderShopProducts(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ordered_ids) => {
      await getJson(`/api/providers/${providerId}/shop-products/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids }),
      });
      return ordered_ids;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: shopProductsKey(providerId) }),
  });
}

// PATCH .../services/reorder (owner|admin). mutateAsync(ordered_ids:number[]).
export function useReorderServices(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ordered_ids) => {
      await getJson(`/api/providers/${providerId}/services/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids }),
      });
      return ordered_ids;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: servicesKey(providerId) }),
  });
}

// Soft-delete a product (DELETE .../shop-products/[productId] → active=false).
export function useDeleteShopProduct(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId) => {
      await getJson(`/api/providers/${providerId}/shop-products/${productId}`, {
        method: "DELETE",
      });
      return productId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shopProductsKey(providerId) });
    },
  });
}

// The shop's incoming product orders (GET .../shop-orders), with line items.
export function useShopOrders(providerId) {
  return useQuery({
    queryKey: shopOrdersKey(providerId),
    enabled: providerId != null && providerId !== "",
    queryFn: async () => {
      const data = await getJson(`/api/providers/${providerId}/shop-orders`);
      return data.orders ?? [];
    },
  });
}

// Advance an order's fulfillment (PATCH .../shop-orders/[orderId]). mutateAsync({ orderId,
// fulfillment_status }). Touches only fulfillment — never the 2.3 payment status.
export function useSetOrderFulfillment(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, fulfillment_status }) => {
      const data = await getJson(
        `/api/providers/${providerId}/shop-orders/${orderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fulfillment_status }),
        },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shopOrdersKey(providerId) });
    },
  });
}

// ── Adoption (ticket 2.12) ──────────────────────────────────────────────────────
export const adoptableListingsKey = (providerId) => ["provider", providerId, "adoptable-listings"];
export const adoptionApplicationsKey = (providerId) => ["provider", providerId, "adoption-applications"];

// The place's adoptable dogs (GET .../adoptable-listings). RLS: staff see all (incl.
// pending/adopted + a draft place).
export function useAdoptableListings(providerId) {
  return useQuery({
    queryKey: adoptableListingsKey(providerId),
    enabled: providerId != null && providerId !== "",
    queryFn: async () => {
      const data = await getJson(`/api/providers/${providerId}/adoptable-listings`);
      return data.listings ?? [];
    },
  });
}

// Create a listing (POST .../adoptable-listings). mutateAsync({ name*, breed?, age_years?,
// gender?, size?, story?, adoption_fee_cents?, good_with_*?, energy_level?,
// vaccination_status? }). Shelter-admin only (gated server-side).
export function useCreateAdoptableListing(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const data = await getJson(`/api/providers/${providerId}/adoptable-listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return data.listing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adoptableListingsKey(providerId) });
    },
  });
}

// Update a listing (PATCH .../adoptable-listings/[listingId]). mutateAsync({ listingId,
// ...fields }) — incl. status (available/pending/adopted).
export function useUpdateAdoptableListing(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, ...body }) => {
      const data = await getJson(
        `/api/providers/${providerId}/adoptable-listings/${listingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return data.listing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adoptableListingsKey(providerId) });
    },
  });
}

// Remove a listing (DELETE .../adoptable-listings/[listingId]).
export function useDeleteAdoptableListing(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listingId) => {
      await getJson(`/api/providers/${providerId}/adoptable-listings/${listingId}`, {
        method: "DELETE",
      });
      return listingId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adoptableListingsKey(providerId) });
    },
  });
}

// The place's incoming adoption applications (GET .../adoption-applications).
export function useAdoptionApplications(providerId) {
  return useQuery({
    queryKey: adoptionApplicationsKey(providerId),
    enabled: providerId != null && providerId !== "",
    queryFn: async () => {
      const data = await getJson(`/api/providers/${providerId}/adoption-applications`);
      return data.applications ?? [];
    },
  });
}

// Review an application (PATCH .../adoption-applications/[applicationId]). mutateAsync({
// applicationId, status }) — under_review / declined / approved. APPROVAL creates the
// adopter's pet + marks the listing adopted (server-side app_approve_adoption). Refreshes
// both the application queue and the listings (the approved listing flips to 'adopted').
export function useReviewAdoptionApplication(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, status }) => {
      const data = await getJson(
        `/api/providers/${providerId}/adoption-applications/${applicationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adoptionApplicationsKey(providerId) });
      queryClient.invalidateQueries({ queryKey: adoptableListingsKey(providerId) });
    },
  });
}
