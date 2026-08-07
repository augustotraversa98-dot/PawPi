import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toCanonicalDate, toCanonicalTime } from "@/utils/canonicalDateTime";

// Owner-facing provider discovery + booking (docs/provider-design.md §4 items 5–6).
// These wrap the public/owner routes shipped in T5/T6:
//   GET  /api/providers/discover?type=        — published providers (public fields)
//   GET  /api/providers/public/[slug]         — one provider + locations + active services
//   POST /api/providers/[id]/book             — owner books the active pet
// Pattern mirrors usePetProfile / useVetAppointmentReminders: relative
// fetch("/api/..."), a query key, throw on !res.ok.

// Browse PUBLISHED providers. Back-compat: pass a capability STRING
// (useDiscoverProviders("vet")) exactly as before. Services Hub P1
// (docs/SERVICES_HUB_PLAN.md) also accepts an OPTIONS object so later phases can
// drive the unified discovery surface:
//   useDiscoverProviders({ capability, lat, lng, radius, q, openNow })
// Each returned provider now also carries capabilities[], the primary location
// (lat/lng/location_name/hours_json), and — when lat+lng are supplied — distance_km,
// nearest-first. No screen consumes the new fields yet; this only widens the contract.
export function useDiscoverProviders(arg = "vet") {
  const opts = typeof arg === "string" ? { capability: arg } : arg || {};
  const { capability, lat, lng, radius, q, openNow } = opts;

  return useQuery({
    // Every param is part of the key so distinct filters cache independently.
    queryKey: ["providers", "discover", { capability, lat, lng, radius, q, openNow }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (capability) params.set("capability", capability);
      if (lat != null && lng != null) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
        if (radius != null) params.set("radius", String(radius));
      }
      if (q) params.set("q", q);
      if (openNow) params.set("openNow", "true");
      const qs = params.toString();
      const response = await fetch(
        `/api/providers/discover${qs ? `?${qs}` : ""}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch providers");
      }
      const data = await response.json();
      return data.providers ?? [];
    },
  });
}

// The owner's bookings ACROSS ALL SERVICES (GET /api/me/bookings) for the owner hub (ticket
// 2.14). Owner-scoped server-side (owner_user_id = me); returns { upcoming, past }, each row
// carrying provider/pet/service names so the hub can link into the per-feature screens. Empty
// → { upcoming: [], past: [] }.
export function useMyBookings() {
  return useQuery({
    queryKey: ["my-bookings", "owner"],
    queryFn: async () => {
      // The upcoming/past split happens server-side against this DATE, so it must be the
      // device's own local calendar day (see route.js) — not left for the server to guess.
      const today = toCanonicalDate(new Date());
      const response = await fetch(
        `/api/me/bookings?today=${encodeURIComponent(today)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch bookings");
      }
      const data = await response.json();
      return { upcoming: data.upcoming ?? [], past: data.past ?? [] };
    },
  });
}

// One booking's owner-scoped detail (GET /api/me/bookings/[id]) for the read-only booking
// summary screen: service/notes/status/date/time/provider/pet + the SETTLED payment
// (data.booking.paid = { amount_cents, currency } | null). Owner-scoped server-side; another
// owner's id 404s → query error. Disabled until an id is known.
export function useBookingDetail(id) {
  return useQuery({
    queryKey: ["my-bookings", "detail", id],
    enabled: id != null,
    queryFn: async () => {
      const response = await fetch(`/api/me/bookings/${encodeURIComponent(id)}`);
      if (!response.ok) {
        throw new Error("Failed to fetch booking");
      }
      const data = await response.json();
      return data.booking;
    },
  });
}

// One published provider's PUBLIC profile: { provider, locations, services }.
// Disabled until a slug is known; a draft/unknown slug 404s → query error.
export function useProviderProfile(slug) {
  return useQuery({
    queryKey: ["providers", "public", slug],
    enabled: !!slug,
    queryFn: async () => {
      const response = await fetch(
        `/api/providers/public/${encodeURIComponent(slug)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch provider");
      }
      return response.json(); // { provider, locations, services }
    },
  });
}

// List a provider's reviews (ticket 2.2). Any authed user; returns the reviewer
// display name + pet + rating + body + date for a PUBLISHED provider. Keyed by
// provider id; disabled until an id is known.
export function useProviderReviews(providerId) {
  return useQuery({
    queryKey: ["providers", "reviews", providerId],
    enabled: providerId != null,
    queryFn: async () => {
      const response = await fetch(`/api/providers/${providerId}/reviews`);
      if (!response.ok) {
        throw new Error("Failed to fetch reviews");
      }
      const data = await response.json();
      return data.reviews ?? [];
    },
  });
}

// Write a review for a provider after a COMPLETED appointment (ticket 2.2). The
// backend gates on the caller having a completed booking with this provider and
// dedups one-per-booking, so the surface only OFFERS this after completion. On
// success we invalidate the provider's reviews + the discovery/profile aggregates
// so the new rating shows immediately.
export function useWriteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    // mutateAsync({ providerId, rating, body?, pet_id? })
    mutationFn: async ({ providerId, ...body }) => {
      const response = await fetch(`/api/providers/${providerId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to submit review");
      }
      return response.json(); // { review }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["providers", "reviews", variables?.providerId],
      });
      // Aggregate rating shows on discovery cards + the provider profile.
      queryClient.invalidateQueries({ queryKey: ["providers", "discover"] });
      queryClient.invalidateQueries({ queryKey: ["providers", "public"] });
    },
  });
}

// Book an appointment with a provider for the active pet. The booking lands as a
// vet_appointments row (source='owner', booking_status='requested'), so on success
// we invalidate the two pet-scoped keys the appointment surfaces flow through
// (useVetAppointmentReminders + the Vet Record list) so it appears immediately.
export function useBookProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    // mutateAsync({ providerId, petId, capability?, service_id?,
    //   provider_location_id?, staff_user_id?, appointment_date, appointment_time,
    //   start_at?, end_at?, recurrence_rule?, order_id?, reason_for_visit?, notes?,
    //   title? }) — capability defaults to 'vet' server-side (ticket 2.4).
    mutationFn: async ({ providerId, ...body }) => {
      const response = await fetch(`/api/providers/${providerId}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // Surface the backend's 400/403/404 message rather than swallowing it.
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to book appointment");
      }
      return response.json(); // { appointment }
    },
    onSuccess: (_data, variables) => {
      const petId = variables?.petId;
      queryClient.invalidateQueries({ queryKey: ["vet-appointments", petId] });
      queryClient.invalidateQueries({
        queryKey: ["vet-appointment-reminders", petId],
      });
    },
  });
}

// A provider's OPEN bookable slots over a date range (GET /api/providers/[id]/availability,
// PR-1). Returns { time_zone, availability:[{date, slots:[{start,end}]}] } — slots are
// ABSOLUTE-UTC instants the picker formats in time_zone. Disabled until providerId + from +
// to are known; every param is in the key so each month/capability/staff caches separately
// (the OSDE-style picker refetches per visible month).
export function useProviderAvailability(
  providerId,
  { from, to, capability, staffUserId } = {},
) {
  return useQuery({
    queryKey: [
      "providers",
      "availability",
      providerId,
      { from, to, capability, staffUserId },
    ],
    enabled: providerId != null && !!from && !!to,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);
      if (capability) params.set("capability", capability);
      if (staffUserId != null) params.set("staff_user_id", String(staffUserId));
      const response = await fetch(
        `/api/providers/${providerId}/availability?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch availability");
      }
      const data = await response.json();
      return {
        time_zone: data.time_zone ?? null,
        availability: data.availability ?? [],
      };
    },
  });
}

// --- owner ↔ provider chat / messaging (Phase 2 ticket 2.5) -----------------
// These wrap the participant-scoped thread/message routes (0031 RLS is the real
// guard). Pattern matches the hooks above: relative fetch("/api/..."), a query key,
// throw on !res.ok. REALTIME = short-interval POLLING (refetchInterval), the
// documented lightweight choice — no Supabase Realtime websocket infra.

// The owner's thread inbox (GET /api/threads?side=owner). Polls every 15s.
export function useMyThreads() {
  return useQuery({
    queryKey: ["threads", "owner"],
    refetchInterval: 15000,
    queryFn: async () => {
      const response = await fetch("/api/threads?side=owner");
      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }
      const data = await response.json();
      return data.threads ?? [];
    },
  });
}

// One thread's messages (GET /api/threads/[id]/messages). Newest-first; polls every
// 8s while open. Disabled until a thread id is known.
export function useThreadMessages(threadId) {
  return useQuery({
    queryKey: ["thread-messages", threadId],
    enabled: threadId != null,
    refetchInterval: 8000,
    queryFn: async () => {
      const response = await fetch(
        `/api/threads/${encodeURIComponent(threadId)}/messages?limit=50`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      const data = await response.json();
      return data.messages ?? [];
    },
  });
}

// Start (or reuse) a thread with a provider (POST /api/threads). Idempotent — returns
// the existing thread if one already exists. Invalidates the owner inbox on success.
export function useStartThread() {
  const queryClient = useQueryClient();
  return useMutation({
    // mutateAsync({ providerId, booking_id? }) → { thread, reused }
    mutationFn: async (body) => {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to start conversation");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads", "owner"] });
    },
  });
}

// Send a message (POST /api/threads/[id]/messages). body { body?, attachment_url? }.
// Refetches this thread's messages + the inbox + the unread badge.
export function useSendMessage(threadId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const response = await fetch(
        `/api/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to send message");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thread-messages", threadId] });
      queryClient.invalidateQueries({ queryKey: ["threads", "owner"] });
      queryClient.invalidateQueries({ queryKey: ["threads", "unread"] });
    },
  });
}

// Mark a thread read (POST /api/threads/[id]/read). Clears the caller's unread.
export function useMarkThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (threadId) => {
      const response = await fetch(
        `/api/threads/${encodeURIComponent(threadId)}/read`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error("Failed to mark read");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads", "owner"] });
      queryClient.invalidateQueries({ queryKey: ["threads", "unread"] });
    },
  });
}

// The owner's total unread message count (GET /api/threads/unread-count?side=owner).
// Drives the Messages badge. Polls every 30s.
export function useUnreadCount() {
  return useQuery({
    queryKey: ["threads", "unread"],
    refetchInterval: 30000,
    queryFn: async () => {
      const response = await fetch("/api/threads/unread-count?side=owner");
      if (!response.ok) {
        throw new Error("Failed to fetch unread count");
      }
      const data = await response.json();
      return data.unread_count ?? 0;
    },
  });
}

// Create a provider — the caller becomes its active 'owner' (POST /api/providers, the
// canonical create endpoint). The backend lazily creates the caller's user_profiles row
// (so a brand-new account with no pet can onboard), atomically creates provider + owner
// provider_staff + provider_capabilities under RLS, and returns { provider } (status 201,
// status 'draft'). Body { name, provider_type, capabilities?, bio? } — name + provider_type
// required; capabilities[] is the MULTI-service set (ticket 2.15) the backend validates
// against ALLOWED_CAPABILITIES and persists into provider_capabilities, so the business
// surfaces under every service it offers. On success we invalidate the useMyProviders key
// so the new business appears immediately. Mirrors the web onboarding
// (apps/web/src/app/provider/components/CreateProviderForm.jsx).
export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    // mutateAsync({ name, provider_type, capabilities?, bio? }) → provider
    mutationFn: async (body) => {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // Surface the backend's 400/401 message rather than swallowing it.
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to create your business");
      }
      const data = await response.json();
      return data.provider;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers", "mine"] });
    },
  });
}

// Create the provider's primary location (ticket 2.81) — POST /api/providers/[id]/locations.
// Mobile onboarding drops a map pin (LocationField), so this persists { name?, address?, lat, lng }
// on a real provider_locations row right after the provider is created. Owner|admin only server-side
// (the creator is the owner). Best-effort from the caller: a failed location write must NOT undo a
// successfully-created business, so callers swallow its error and still show the success state.
export function useCreateProviderLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    // mutateAsync({ providerId, name?, address?, lat?, lng? }) → location
    mutationFn: async ({ providerId, ...body }) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/locations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to save your location");
      }
      const data = await response.json();
      return data.location;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers", "mine"] });
    },
  });
}

// --- magic onboarding: enrichment + apply (Phase 2 ticket 2.83) --------------
// The wizard creates the provider draft, then PROPOSES a profile from its links (+ an uploaded
// price-list document) via the confirm-first enrichment seam (2.21 + 2.82). The /enrich routes write
// NOTHING; the provider edits the draft and saves through these existing owner-identity routes. All
// degrade cleanly: a 503 ("not set up yet") just yields an empty draft → fully manual onboarding.

// POST /api/providers/[id]/enrich — proposed { draft, sources } from the provider's stored links.
export function useEnrichProvider() {
  return useMutation({
    mutationFn: async (providerId) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/enrich`,
        { method: "POST" },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const err = new Error(error.error || "Enrichment failed");
        err.status = response.status;
        throw err;
      }
      return response.json(); // { draft, sources, applied:false }
    },
  });
}

// POST /api/providers/[id]/enrich/document — proposed { draft:{services,products} } from an uploaded
// price-list/menu (already stored via the Storage upload path; we pass { url, filename, mimeType }).
export function useEnrichProviderDocument() {
  return useMutation({
    mutationFn: async ({ providerId, ...file }) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/enrich/document`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(file),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const err = new Error(error.error || "Document enrichment failed");
        err.status = response.status;
        throw err;
      }
      return response.json(); // { draft:{services,products}, applied:false }
    },
  });
}

// PATCH /api/providers/[id] — apply edited profile fields (e.g. the enriched bio/description).
export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, ...fields }) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update your business");
      }
      const data = await response.json();
      return data.provider;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers", "mine"] });
    },
  });
}

// POST /api/providers/[id]/services — create one accepted service from the proposed catalog.
export function useCreateProviderService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, ...service }) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/services`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(service),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to add service");
      }
      const data = await response.json();
      return data.service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers", "mine"] });
    },
  });
}

// --- telehealth — vet video consults (Phase 2 ticket 2.18) -------------------
// The consult IS a normal booking (useBookProvider({ capability: 'telehealth' })) +
// payment + chat; the only telehealth-specific owner surfaces are the consult LIST and
// JOIN. Discovery reuses useDiscoverProviders('telehealth').

// The OWNER's video consults for a pet (GET /api/pets/[id]/telehealth-sessions). Polls
// every 30s so a session the vet just created/started appears. Disabled until a pet id is
// known. Empty → [].
export function useTelehealthSessions(petId) {
  return useQuery({
    queryKey: ["telehealth-sessions", "owner", petId],
    enabled: petId != null,
    refetchInterval: 30000,
    queryFn: async () => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/telehealth-sessions`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch consults");
      }
      const data = await response.json();
      return data.sessions ?? [];
    },
  });
}

// JOIN a consult (POST /api/providers/[id]/telehealth/sessions/[sessionId]/join). Returns
// { joinUrl, token, session }. Surfaces the backend's clean 503 ("Video consults aren't set
// up yet") so the UI shows the right state instead of crashing. Invalidates the consult list
// so a status flip (→ in_progress) shows.
//
// Sends the device's own local wall-clock (?today=&nowTime=, mirroring useMyBookings' ?today=
// convention) so the server's owner early-join gate can compare against it — appointment_date/
// appointment_time have no timezone stored anywhere, so this must come from the caller's
// clock, never the server's UTC now(). A 425 (too early) is re-thrown as a distinguishable
// `notReady` error so the UI can show a friendly "not time yet" message instead of a generic
// failure (see telehealth.jsx's ConsultCard).
export function useJoinTelehealth() {
  const queryClient = useQueryClient();
  return useMutation({
    // mutateAsync({ providerId, sessionId, petId? }) → { joinUrl, token, session }
    mutationFn: async ({ providerId, sessionId }) => {
      const now = new Date();
      const qs = `?today=${encodeURIComponent(toCanonicalDate(now))}&nowTime=${encodeURIComponent(toCanonicalTime(now))}`;
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/telehealth/sessions/${encodeURIComponent(sessionId)}/join${qs}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 425) {
          const notReadyError = new Error(error.error || "Not time to join yet");
          notReadyError.notReady = true;
          notReadyError.availableAt = error.availableAt;
          throw notReadyError;
        }
        throw new Error(error.error || "Couldn't join the consult");
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["telehealth-sessions", "owner", variables?.petId],
      });
    },
  });
}

// The providers the current user is ACTIVE STAFF of (GET /api/providers). Used by the
// walker workspace to find the walker-capable businesses they work for. Empty → [].
export function useMyProviders() {
  return useQuery({
    queryKey: ["providers", "mine"],
    queryFn: async () => {
      const response = await fetch("/api/providers");
      if (!response.ok) {
        throw new Error("Failed to fetch your providers");
      }
      const data = await response.json();
      return data.providers ?? [];
    },
  });
}

// A provider's booking INBOX (GET /api/providers/[id]/bookings) — the walker reads the
// walks owners booked so they can check in. Optional ?booking_status= filter. Disabled
// until a provider id is known; polls every 20s. Empty → [].
export function useProviderBookings(providerId, { bookingStatus } = {}) {
  return useQuery({
    queryKey: ["provider-bookings", providerId, bookingStatus ?? "all"],
    enabled: providerId != null,
    refetchInterval: 20000,
    queryFn: async () => {
      const qs = bookingStatus
        ? `?booking_status=${encodeURIComponent(bookingStatus)}`
        : "";
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/bookings${qs}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch bookings");
      }
      const data = await response.json();
      return data.bookings ?? [];
    },
  });
}

// --- dog walking — live GPS sessions (Phase 2 ticket 2.7) -------------------
// These wrap the walk-session routes (0033 participant RLS is the real guard). LIVE
// TRACKING = short-interval POLLING (refetchInterval) — the SAME lightweight choice chat
// used in 2.5, not Supabase Realtime (documented in the migration). Pattern matches the
// hooks above: relative fetch("/api/..."), a query key, throw on !res.ok.

// The OWNER's walk sessions for a pet (GET /api/pets/[id]/walk-sessions). When `live`,
// polls every 5s so the owner watches the route grow during an in_progress walk; when not
// live (just reading reports), no polling. Disabled until a pet id is known.
export function useWalkSessions(petId, { live = false } = {}) {
  return useQuery({
    queryKey: ["walk-sessions", "owner", petId],
    enabled: petId != null,
    refetchInterval: live ? 5000 : false,
    queryFn: async () => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/walk-sessions`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch walk sessions");
      }
      const data = await response.json();
      return data.sessions ?? [];
    },
  });
}

// The WALKER's own assigned sessions for a provider (GET /api/providers/[id]/walk-sessions).
// Polls every 10s. Disabled until a provider id is known.
export function useMyWalkSessions(providerId, { status } = {}) {
  return useQuery({
    queryKey: ["walk-sessions", "walker", providerId, status ?? "all"],
    enabled: providerId != null,
    refetchInterval: 10000,
    queryFn: async () => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/walk-sessions${qs}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch walk sessions");
      }
      const data = await response.json();
      return data.sessions ?? [];
    },
  });
}

// Walker CHECKS IN — creates an in_progress session for the pet
// (POST /api/providers/[id]/pets/[petId]/walk-sessions). Invalidates the walker list.
export function useCheckInWalk() {
  const queryClient = useQueryClient();
  return useMutation({
    // mutateAsync({ providerId, petId, booking_id? }) → { session }
    mutationFn: async ({ providerId, petId, ...body }) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/pets/${encodeURIComponent(petId)}/walk-sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to start walk");
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["walk-sessions", "walker", variables?.providerId],
      });
    },
  });
}

// Walker posts GPS points (PATCH ?action=track) — THROTTLED writes during the walk.
// mutateAsync({ providerId, sessionId, points:[{lat,lng,t}], distance_m? }).
export function useTrackWalk() {
  return useMutation({
    mutationFn: async ({ providerId, sessionId, ...body }) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/walk-sessions/${encodeURIComponent(sessionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "track", ...body }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update walk");
      }
      return response.json();
    },
  });
}

// Walker FINISHES — writes the report (PATCH ?action=finish), which the backend routes
// into the pet's health timeline. mutateAsync({ providerId, sessionId, distance_m?,
// duration_s?, potty_pee?, potty_poo?, notes?, photo_urls? }). Invalidates the walker list
// + the owner's walk sessions + the pet health surfaces.
export function useFinishWalk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, sessionId, ...body }) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/walk-sessions/${encodeURIComponent(sessionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finish", ...body }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to finish walk");
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["walk-sessions", "walker", variables?.providerId],
      });
      queryClient.invalidateQueries({ queryKey: ["walk-sessions", "owner"] });
      queryClient.invalidateQueries({ queryKey: ["health", "walk-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
    },
  });
}

// --- daycare & boarding — capacity-managed stays (Phase 2 ticket 2.8) --------
// These wrap the daycare-stay routes (0034 owner-FOR-ALL + provider-via-grant RLS is the
// real guard). Pattern matches the hooks above: relative fetch("/api/..."), a query key,
// throw on !res.ok.

// The OWNER's daycare stays for a pet (GET /api/pets/[id]/daycare-stays). Each stay carries
// its daily report_cards + the vaccine_status (pass/fail + missing) computed from the
// owner's own pet_vaccinations. Disabled until a pet id is known. Polls every 30s so a new
// report card / check-in shows without a manual refresh.
export function useDaycareStays(petId) {
  return useQuery({
    queryKey: ["daycare-stays", "owner", petId],
    enabled: petId != null,
    refetchInterval: 30000,
    queryFn: async () => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/daycare-stays`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch daycare stays");
      }
      const data = await response.json();
      return data.stays ?? [];
    },
  });
}

// Owner BOOKS a stay (POST /api/pets/[id]/daycare-stays). The backend enforces capacity /
// overbook prevention (clean 409) + the daycare capability gate. mutateAsync({ petId,
// provider_id, location_id?, start_date, end_date, feeding_instructions?, med_instructions?,
// booking_id? }) → { stay, vaccine_status }. Invalidates the owner's stays.
export function useBookDaycareStay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ petId, ...body }) => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/daycare-stays`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        // Surface the backend's 400/403/409 message (incl. "fully booked for those dates").
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to book stay");
      }
      return response.json(); // { stay, vaccine_status }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["daycare-stays", "owner", variables?.petId],
      });
    },
  });
}

// --- pet sitting (Phase 2 ticket 2.9) ---------------------------------------
// The owner reads their pet's SITTING VISIT updates; the sitter (provider-side) reads
// their OWN assigned visits and logs/edits them. Booking a sitting service reuses
// useBookProvider({ capability: 'sitter', meet_and_greet? }); coordination reuses chat
// (2.5). RLS (0035) is the real participant guard — visit media stays participant-only.

// Owner: the active pet's sitting visit updates (GET /api/pets/[id]/sitting-visits).
// Polls every 30s so a freshly-posted sitter update appears. Empty → []. Newest first.
export function useSittingVisits(petId) {
  return useQuery({
    queryKey: ["sitting-visits", "owner", petId],
    enabled: petId != null,
    refetchInterval: 30000,
    queryFn: async () => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/sitting-visits`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch sitting visits");
      }
      const data = await response.json();
      return data.visits ?? [];
    },
  });
}

// Sitter (provider-side): the caller's OWN assigned visits for a provider
// (GET /api/providers/[id]/sitting-visits[?status=]). Polls every 30s. Empty → [].
export function useMySittingVisits(providerId, { status } = {}) {
  return useQuery({
    queryKey: ["sitting-visits", "provider", providerId, status ?? "all"],
    enabled: providerId != null,
    refetchInterval: 30000,
    queryFn: async () => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/sitting-visits${qs}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch sitting visits");
      }
      const data = await response.json();
      return data.visits ?? [];
    },
  });
}

// Sitter logs a new per-visit update (POST /api/providers/[id]/sitting-visits). The
// backend gates capability('sitter') + assertCareAccess('health_logs_write') and assigns
// the visit to the caller. mutateAsync({ providerId, pet_id, booking_id?, visit_at?,
// status?, notes?, photo_urls?, video_urls?, check_in_lat?, check_in_lng? }) → { visit }.
export function useLogSittingVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, ...body }) => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/sitting-visits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to log visit");
      }
      return response.json(); // { visit }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["sitting-visits", "provider", variables?.providerId],
      });
    },
  });
}

// --- training (Phase 2 ticket 2.10) -----------------------------------------
// The PROVIDER training service (HIRING a trainer) — DISTINCT from the consumer self-
// Training tab (static content, no DB). The owner books a 1:1 / group class / program and
// reads their pet's PROGRESS + VIDEO LESSONS; the trainer logs progress (web dashboard).
// Booking a training service reuses useBookProvider({ capability: 'trainer' }); RLS (0036)
// is the real guard — the owner sees their OWN pet's progress only.

// Owner: the active pet's TRAINING PROGRAM enrollments (GET /api/pets/[id]/training-
// programs), each with its per-session progress + video lessons. Polls every 30s so a
// freshly-logged progress note appears. Empty → []. Newest first.
export function useTrainingPrograms(petId) {
  return useQuery({
    queryKey: ["training-programs", "owner", petId],
    enabled: petId != null,
    refetchInterval: 30000,
    queryFn: async () => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/training-programs`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch training programs");
      }
      const data = await response.json();
      return data.programs ?? [];
    },
  });
}

// Owner: a trainer's bookable GROUP CLASSES (GET /api/providers/[id]/training-sessions?
// kind=group_class). Published-provider sessions are public-readable (RLS 0036). Each
// class carries attendee_count + capacity so the UI can show "X / N seats". Empty → [].
export function useTrainingClasses(providerId) {
  return useQuery({
    queryKey: ["training-classes", providerId],
    enabled: providerId != null,
    queryFn: async () => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/training-sessions?kind=group_class`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch classes");
      }
      const data = await response.json();
      return data.sessions ?? [];
    },
  });
}

// Owner ENROLLS in a program / books a 1:1 course (POST /api/pets/[id]/training-programs).
// The backend gates the trainer capability. mutateAsync({ petId, provider_id, service_id?,
// title*, total_sessions?, booking_id? }) → { program }. Invalidates the owner's programs.
export function useEnrollTrainingProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ petId, ...body }) => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/training-programs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to enroll");
      }
      return response.json(); // { program }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["training-programs", "owner", variables?.petId],
      });
    },
  });
}

// Owner JOINS a group class for their pet (POST /api/pets/[id]/training-classes). The
// backend enforces GROUP-CLASS CAPACITY (clean 409 "This class is full"). mutateAsync({
// petId, session_id*, booking_id? }) → { progress }. Invalidates the owner's programs +
// the class list (so the seat count refreshes).
export function useJoinTrainingClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ petId, ...body }) => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/training-classes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        // Surface the backend's 400/403/409 message (incl. "This class is full").
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to join class");
      }
      return response.json(); // { progress }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["training-programs", "owner", variables?.petId],
      });
      queryClient.invalidateQueries({ queryKey: ["training-classes"] });
    },
  });
}

// ── Shop / e-commerce (ticket 2.11) ─────────────────────────────────────────────
// REUSE the shared discovery (useDiscoverProviders('shop')) for the shop list. The hooks
// below cover the owner's CATALOG browse, CART CHECKOUT (via the 2.3 payment layer),
// SUBSCRIPTIONS (auto-reorder), and ORDER HISTORY. All real API; empty → empty states.

// A shop provider's CATALOG — its active products (RLS: a published shop's active products
// are readable by any authed). Disabled until a providerId is known. Empty → [].
export function useShopProducts(providerId) {
  return useQuery({
    queryKey: ["shop-products", providerId],
    enabled: providerId != null,
    queryFn: async () => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/shop-products`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      const data = await response.json();
      return data.products ?? [];
    },
  });
}

// The owner's product ORDER HISTORY (GET /api/shop/orders). Empty → [].
export function useShopOrders({ enabled = true } = {}) {
  return useQuery({
    queryKey: ["shop-orders", "owner"],
    enabled,
    queryFn: async () => {
      const response = await fetch(`/api/shop/orders`);
      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }
      const data = await response.json();
      return data.orders ?? [];
    },
  });
}

// CHECKOUT a cart for a pet (POST /api/pets/[id]/shop-checkout). The backend gates the shop
// capability, refuses out-of-stock + Rx-without-vet lines, builds the order, and hands off to
// the 2.3 payment layer. mutateAsync({ petId, provider_id, items:[{product_id, quantity}],
// rail }) → { order, payment, checkoutUrl, deeplink, qrContent }. Surfaces the backend's
// 409 "Out of stock" / 403 Rx / 503 "payments not configured" message.
export function useShopCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ petId, ...body }) => {
      const response = await fetch(
        `/api/pets/${encodeURIComponent(petId)}/shop-checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Checkout failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-orders", "owner"] });
    },
  });
}

// The owner's auto-reorder SUBSCRIPTIONS (GET /api/shop/subscriptions). Empty → [].
export function useShopSubscriptions() {
  return useQuery({
    queryKey: ["shop-subscriptions", "owner"],
    queryFn: async () => {
      const response = await fetch(`/api/shop/subscriptions`);
      if (!response.ok) {
        throw new Error("Failed to fetch subscriptions");
      }
      const data = await response.json();
      return data.subscriptions ?? [];
    },
  });
}

// CREATE an auto-reorder plan (POST /api/shop/subscriptions). mutateAsync({ product_id, plan,
// quantity }) → { subscription }. The backend refuses Rx products. Invalidates the list.
export function useCreateShopSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const response = await fetch(`/api/shop/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to subscribe");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-subscriptions", "owner"] });
    },
  });
}

// CANCEL / pause / resume a subscription (PATCH /api/shop/subscriptions/[id]).
// mutateAsync({ id, status }) → { subscription }. Invalidates the list.
export function useUpdateShopSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const response = await fetch(
        `/api/shop/subscriptions/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update subscription");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-subscriptions", "owner"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ADOPTION (ticket 2.12). The owner discovers adoption PLACES via the shared
// useDiscoverProviders('adoption'), browses a place's adoptable dogs (dog-profile format),
// FAVORITES, APPLIES, CHATS (reuse useStartThread), and pays the fee / donates (reuse the 2.3
// payment layer). All real API; empty → empty states. RLS (0038) is the real guard.

// The unified adoption BROWSE (ticket 2.86): every published shelter's AVAILABLE dogs in ONE flat,
// filterable, NEAREST-FIRST list (GET /api/adoption/listings). `filters` is { lat, lng, radius_km,
// gender, size, age_min, age_max, energy_level, good_with_kids, good_with_cats, good_with_dogs,
// vaccination_status, provider_id }. Empty/undefined values are omitted. When lat/lng are present the
// server sorts nearest-first and attaches distance_km; otherwise featured-then-recent. Empty → [].
export function useAdoptableBrowse(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ["adoption-browse", qs],
    queryFn: async () => {
      const response = await fetch(`/api/adoption/listings${qs ? `?${qs}` : ""}`);
      if (!response.ok) {
        throw new Error("Failed to load adoptable dogs");
      }
      const data = await response.json();
      return { listings: data.listings ?? [], sort: data.sort };
    },
  });
}

// A place's adoptable dogs — its AVAILABLE listings (RLS: a published place's available
// listings are readable by any authed). Disabled until a providerId is known. Empty → [].
export function useAdoptableListings(providerId) {
  return useQuery({
    queryKey: ["adoptable-listings", providerId],
    enabled: providerId != null,
    queryFn: async () => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/adoptable-listings`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch listings");
      }
      const data = await response.json();
      return data.listings ?? [];
    },
  });
}

// A SINGLE adoptable listing — the public single-listing GET (ticket 2.56), used by
// the 2.30 feed deep-link to open exactly that dog (even one not in the currently-
// loaded browse list). Returns the listing only when published + available; a gone/
// adopted/removed dog resolves to `null` (404) so the caller shows the graceful "no
// longer available" notice. Disabled until both ids are known.
export function useAdoptableListing(providerId, listingId) {
  return useQuery({
    queryKey: ["adoptable-listing", providerId, listingId],
    enabled: providerId != null && listingId != null,
    retry: false,
    queryFn: async () => {
      const response = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/adoptable-listings/${encodeURIComponent(listingId)}`,
      );
      if (response.status === 404) return null; // no longer available
      if (!response.ok) throw new Error("Failed to fetch listing");
      const data = await response.json();
      return data.listing ?? null;
    },
  });
}

// The owner's adoption APPLICATIONS (GET /api/adoption/applications). Empty → [].
export function useMyAdoptionApplications() {
  return useQuery({
    queryKey: ["adoption-applications", "owner"],
    queryFn: async () => {
      const response = await fetch(`/api/adoption/applications`);
      if (!response.ok) {
        throw new Error("Failed to fetch applications");
      }
      const data = await response.json();
      return data.applications ?? [];
    },
  });
}

// APPLY to adopt a listing (POST /api/adoption/applications). mutateAsync({ listing_id,
// answers }) → { application }. Surfaces the backend's 409 "already applied" / "no longer
// available". Invalidates the owner's application list.
export function useApplyForAdoption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const response = await fetch(`/api/adoption/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to apply");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adoption-applications", "owner"] });
    },
  });
}

// The owner's FAVORITED listings (GET /api/adoption/favorites). Empty → [].
export function useAdoptionFavorites() {
  return useQuery({
    queryKey: ["adoption-favorites", "owner"],
    queryFn: async () => {
      const response = await fetch(`/api/adoption/favorites`);
      if (!response.ok) {
        throw new Error("Failed to fetch favorites");
      }
      const data = await response.json();
      return data.favorites ?? [];
    },
  });
}

// Toggle a favorite (POST / DELETE /api/adoption/favorites). mutateAsync({ listing_id,
// favorited }) — favorited=true POSTs, false DELETEs. Invalidates the favorites list.
export function useToggleAdoptionFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listing_id, favorited }) => {
      const response = await fetch(`/api/adoption/favorites`, {
        method: favorited ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update favorite");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adoption-favorites", "owner"] });
    },
  });
}

// Start a BOOKING payment via the SHARED 2.3 payment layer (POST /api/payments/checkout,
// kind:'booking'). mutateAsync({ provider_id, amount_cents, source_ref? }) →
// { order, checkoutUrl, deeplink, ... }. Used by BookingFormModal when the chosen service has a
// deposit/full payment policy (pay-at-request, migration 0070). Surfaces the backend's 503
// "payments not configured" verbatim so the UI can tell the customer. Same route the rest of the
// app uses — no duplicate payment code.
export function useBookingCheckout() {
  return useMutation({
    mutationFn: async (body) => {
      const response = await fetch(`/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rail: "mercadopago",
          currency: "ARS",
          kind: "booking",
          ...body,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Couldn't start payment");
      }
      return response.json();
    },
  });
}

// Pay an adoption FEE or DONATE to a place via the SHARED 2.3 payment layer (POST
// /api/payments/checkout). mutateAsync({ provider_id, kind, amount_cents, source_ref }) →
// { order, checkoutUrl, deeplink, qrContent }. kind is 'adoption_fee' or 'donation'. Surfaces
// the backend's 503 "payments not configured" so the UI can show the right state. Does NOT
// duplicate payments — same route the rest of the app uses.
export function useAdoptionCheckout() {
  return useMutation({
    mutationFn: async (body) => {
      const response = await fetch(`/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rail: "mercadopago", currency: "ARS", ...body }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Checkout failed");
      }
      return response.json();
    },
  });
}
