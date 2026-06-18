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

// In-app binding (ticket 2.72). The owner's policies for a pet (RLS owner-scoped), apply for a plan
// (creates an 'application' + records terms acceptance), and activate after paying via 2.3.
export function useInsurancePolicies(petId) {
  return useQuery({
    queryKey: ["insurance-policies", petId ?? "all"],
    enabled: petId != null,
    queryFn: async () => {
      const qs = petId != null ? `?petId=${encodeURIComponent(petId)}` : "";
      const res = await fetch(`/api/insurance-policies${qs}`);
      if (!res.ok) throw new Error("Failed to load policies");
      const data = await res.json();
      return data.policies ?? [];
    },
  });
}

export function useApplyPolicy(petId) {
  const qc = useQueryClient();
  return useMutation({
    // mutateAsync({ plan_id, provider_id, pet_id, terms_accepted, terms_url }) → { policy }
    mutationFn: async (body) => {
      const res = await fetch(`/api/insurance-policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to apply");
      }
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["insurance-policies", petId ?? "all"] }),
  });
}

export function useActivatePolicy(petId) {
  const qc = useQueryClient();
  return useMutation({
    // mutateAsync({ id, payment_id }) → { policy }
    mutationFn: async ({ id, payment_id }) => {
      const res = await fetch(`/api/insurance-policies/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", payment_id }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to activate");
      }
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["insurance-policies", petId ?? "all"] }),
  });
}
