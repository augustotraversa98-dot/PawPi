import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Prescriptions / Rx (ticket 2.53) — OWNER hooks. The owner READS prescriptions a vet issued and
// may REQUEST A REFILL; they can never create/edit an Rx (server + RLS enforce that).

export function usePrescriptions(petId) {
  return useQuery({
    queryKey: ["prescriptions", petId],
    enabled: petId != null,
    queryFn: async () => {
      const res = await fetch(`/api/prescriptions?petId=${encodeURIComponent(petId)}`);
      if (!res.ok) throw new Error("Failed to load prescriptions");
      return res.json(); // { prescriptions, refillRequests }
    },
  });
}

export function useRequestRefill(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prescriptionId) => {
      const res = await fetch(`/api/rx-refill-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prescription_id: prescriptionId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to request refill");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions", petId] }),
  });
}
