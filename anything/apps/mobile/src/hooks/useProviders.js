import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Owner-facing provider discovery + booking (docs/provider-design.md §4 items 5–6).
// These wrap the public/owner routes shipped in T5/T6:
//   GET  /api/providers/discover?type=        — published providers (public fields)
//   GET  /api/providers/public/[slug]         — one provider + locations + active services
//   POST /api/providers/[id]/book             — owner books the active pet
// Pattern mirrors usePetProfile / useVetAppointmentReminders: relative
// fetch("/api/..."), a query key, throw on !res.ok.

// Browse PUBLISHED providers, optionally filtered by provider_type (vet-first).
export function useDiscoverProviders(type = "vet") {
  return useQuery({
    queryKey: ["providers", "discover", type],
    queryFn: async () => {
      const qs = type ? `?type=${encodeURIComponent(type)}` : "";
      const response = await fetch(`/api/providers/discover${qs}`);
      if (!response.ok) {
        throw new Error("Failed to fetch providers");
      }
      const data = await response.json();
      return data.providers ?? [];
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
