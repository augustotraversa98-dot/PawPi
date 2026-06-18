import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Transport / pet-taxi (ticket 2.52) — owner hooks on the spine. A trip IS a generalized booking
// (2.4); booking it creates both the booking + the transport_trip in one request. Owner-scoped.

export function useTransportTrips(petId) {
  return useQuery({
    queryKey: ["transport-trips", petId ?? "all"],
    queryFn: async () => {
      const qs = petId != null ? `?petId=${encodeURIComponent(petId)}` : "";
      const res = await fetch(`/api/transport-trips${qs}`);
      if (!res.ok) throw new Error("Failed to load trips");
      const data = await res.json();
      return data.trips ?? [];
    },
  });
}

export function useBookTransport() {
  const qc = useQueryClient();
  return useMutation({
    // mutateAsync({ providerId, petId, scheduled_at, pickup_address, dropoff_address,
    //   pickup_lat?, pickup_lng?, dropoff_lat?, dropoff_lng?, trip_type?, pet_size?,
    //   carrier_needed?, notes? }) → { trip, booking_id }
    mutationFn: async ({ providerId, ...body }) => {
      const res = await fetch(`/api/providers/${providerId}/transport-trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to book transport");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["transport-trips"] });
      qc.invalidateQueries({ queryKey: ["vet-appointments", vars?.petId] });
    },
  });
}

export function useCancelTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripId) => {
      const res = await fetch(`/api/transport-trips/${encodeURIComponent(tripId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed to cancel trip");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transport-trips"] }),
  });
}
