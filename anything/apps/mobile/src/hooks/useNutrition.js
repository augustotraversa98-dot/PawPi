import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Nutrition plans + food-recall alerts (ticket 2.75) — owner hooks. Owner-scoped health data;
// non-diagnostic. Recall matches are surfaced read-only + dismissible.

export function useNutritionPlans(petId) {
  return useQuery({
    queryKey: ["nutrition-plans", petId ?? "none"],
    enabled: petId != null,
    queryFn: async () => {
      const res = await fetch(`/api/nutrition-plans?petId=${encodeURIComponent(petId)}`);
      if (!res.ok) throw new Error("Failed to load nutrition plan");
      const data = await res.json();
      return data.plans ?? [];
    },
  });
}

export function useSaveNutritionPlan(petId) {
  const qc = useQueryClient();
  return useMutation({
    // mutateAsync({ id?, pet_id, food_brand, food_product, food_form, daily_portion, target_calories, notes })
    mutationFn: async ({ id, ...body }) => {
      const url = id ? `/api/nutrition-plans/${id}` : `/api/nutrition-plans`;
      const res = await fetch(url, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to save plan");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nutrition-plans", petId ?? "none"] }),
  });
}

export function useRecallMatches() {
  return useQuery({
    queryKey: ["recall-matches"],
    queryFn: async () => {
      const res = await fetch(`/api/recall-matches`);
      if (!res.ok) throw new Error("Failed to load recall alerts");
      const data = await res.json();
      return data.matches ?? [];
    },
  });
}

export function useDismissRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/recall-matches/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to dismiss alert");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recall-matches"] }),
  });
}
