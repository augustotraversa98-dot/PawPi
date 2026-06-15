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

// Book an appointment with a provider for the active pet. The booking lands as a
// vet_appointments row (source='owner', booking_status='requested'), so on success
// we invalidate the two pet-scoped keys the appointment surfaces flow through
// (useVetAppointmentReminders + the Vet Record list) so it appears immediately.
export function useBookProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    // mutateAsync({ providerId, petId, service_id?, provider_location_id?,
    //   appointment_date, appointment_time, reason_for_visit?, notes?, title? })
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
