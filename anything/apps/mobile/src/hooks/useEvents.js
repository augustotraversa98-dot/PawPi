import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Community events / meetups (ticket 2.74). Public read of upcoming published events; host-scoped
// create/edit/cancel; own-only RSVP toggle. Mirrors the forum hooks shape.

export function useEvents({ lat, lng } = {}) {
  return useQuery({
    queryKey: ["events", lat ?? null, lng ?? null],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (lat != null && lng != null) {
        qs.set("lat", String(lat));
        qs.set("lng", String(lng));
      }
      const res = await fetch(`/api/events${qs.toString() ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load events");
      const data = await res.json();
      return data.events ?? [];
    },
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to create event");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useRsvpEvent() {
  const qc = useQueryClient();
  return useMutation({
    // mutateAsync({ eventId, status, pet_id?, calendar_event_id? }) → { rsvp, attendee_count }
    // calendar_event_id persists the per-attendee device calendar event id (2.80); pass
    // null to clear it (e.g. on un-RSVP).
    mutationFn: async ({ eventId, status, pet_id, calendar_event_id }) => {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, pet_id, calendar_event_id }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to RSVP");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useCancelEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId) => {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to cancel event");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}
