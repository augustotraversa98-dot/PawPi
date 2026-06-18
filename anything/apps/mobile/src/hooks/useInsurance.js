import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Insurance marketplace (ticket 2.54) — owner hooks. The plans GET is RLS-scoped: a non-staff
// owner sees only PUBLISHED plans of a published insurer. Submitting a quote creates a LEAD
// (lead-gen v1; no binding/payment). Only owner-entered pet fields + contact reach the insurer.

export function useInsurancePlans(providerId) {
  return useQuery({
    queryKey: ["insurance-plans", providerId],
    enabled: providerId != null,
    queryFn: async () => {
      const res = await fetch(`/api/providers/${encodeURIComponent(providerId)}/insurance-plans`);
      if (!res.ok) throw new Error("Failed to load plans");
      const data = await res.json();
      return data.plans ?? [];
    },
  });
}

export function useSubmitInsuranceLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/insurance-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to submit request");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insurance-leads", "owner"] }),
  });
}
