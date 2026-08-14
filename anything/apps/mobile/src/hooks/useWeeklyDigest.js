// useWeeklyDigest — the data layer for "Rex's Week" (unit E11).
//
// Reads GET /api/pets/[id]/weekly-digest (REAL owner-tz-week stats; the server owns the honest
// `state` = rich|quiet|empty, so the client only maps state → copy and never fabricates numbers) and
// the owner's channel prefs (GET/PUT /api/engagement/weekly-digest-prefs). Degrades cleanly: a
// pre-migration backend still returns real derived stats (ring/streak simply absent).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function weeklyDigestKey(petId) {
  return ["weekly-digest", petId];
}
export function weeklyDigestPrefsKey() {
  return ["weekly-digest-prefs"];
}

export function useWeeklyDigest(petId) {
  return useQuery({
    queryKey: weeklyDigestKey(petId),
    enabled: !!petId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/pets/${petId}/weekly-digest`);
      if (!res.ok) throw new Error("Failed to load weekly digest");
      return res.json();
    },
  });
}

export function useWeeklyDigestPrefs() {
  return useQuery({
    queryKey: weeklyDigestPrefsKey(),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/engagement/weekly-digest-prefs`);
      if (!res.ok) throw new Error("Failed to load preferences");
      return res.json();
    },
  });
}

export function useUpdateWeeklyDigestPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/engagement/weekly-digest-prefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "Failed to save preferences");
        err.status = res.status;
        throw err;
      }
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(weeklyDigestPrefsKey(), data),
  });
}
