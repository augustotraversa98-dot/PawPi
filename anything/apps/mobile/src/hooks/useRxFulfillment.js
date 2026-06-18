import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Rx fulfillment (ticket 2.71) — owner hooks. A fulfillment hangs off an owned, active, refillable
// prescription (2.53) and is dispensed by a `pharmacy`-capable provider (delivery or pickup), paid
// via the existing payments rail (2.3). Owner-scoped; the server + RLS enforce ownership.

export function useRxFulfillmentOrders(petId) {
  return useQuery({
    queryKey: ["rx-fulfillment-orders", petId ?? "all"],
    enabled: petId != null,
    queryFn: async () => {
      const qs = petId != null ? `?petId=${encodeURIComponent(petId)}` : "";
      const res = await fetch(`/api/rx-fulfillment-orders${qs}`);
      if (!res.ok) throw new Error("Failed to load fulfillment orders");
      const data = await res.json();
      return data.orders ?? [];
    },
  });
}

export function useRequestFulfillment(petId) {
  const qc = useQueryClient();
  return useMutation({
    // mutateAsync({ prescription_id, provider_id, method, delivery_lat?, delivery_lng?,
    //   delivery_address?, provider_location_id?, notes? }) → { order }
    mutationFn: async (body) => {
      const res = await fetch(`/api/rx-fulfillment-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to request fulfillment");
      }
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["rx-fulfillment-orders", petId ?? "all"] }),
  });
}

export function useCancelFulfillment(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/rx-fulfillment-orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed to cancel fulfillment");
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["rx-fulfillment-orders", petId ?? "all"] }),
  });
}
