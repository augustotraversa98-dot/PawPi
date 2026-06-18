import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Emergency Card (ticket 2.51) — the OWNER hooks. The card assembles from the LIVE medical
// sources server-side; the public surfaces (tag/link) are read elsewhere via DEFINER fns. All
// owner-scoped (RLS-guarded). Empty medical fields come back null → the UI shows "Not recorded".

// The web host that serves the PUBLIC /p/tag and /p/card pages (same origin as the API).
const WEB_BASE = (process.env.EXPO_PUBLIC_BASE_URL || "").replace(/\/$/, "");
export const tagUrl = (token) => `${WEB_BASE}/p/tag/${token}`;
export const cardUrl = (token) => `${WEB_BASE}/p/card/${token}`;

export function useEmergencyCard(petId) {
  return useQuery({
    queryKey: ["emergency-card", petId],
    enabled: petId != null,
    queryFn: async () => {
      const res = await fetch(`/api/emergency-card?petId=${encodeURIComponent(petId)}`);
      if (!res.ok) throw new Error("Failed to load emergency card");
      return res.json();
    },
  });
}

export function useUpdateEmergencyCard(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch) => {
      const res = await fetch(`/api/emergency-card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, ...patch }),
      });
      if (!res.ok) throw new Error("Failed to update emergency card");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emergency-card", petId] }),
  });
}

export function useCreateEmergencyLink(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ scope = "full", ttlHours = null }) => {
      const res = await fetch(`/api/emergency-card/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, scope, ttlHours }),
      });
      if (!res.ok) throw new Error("Failed to create link");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emergency-card", petId] }),
  });
}

export function useRevokeEmergencyLink(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId) => {
      const res = await fetch(`/api/emergency-card/links/${encodeURIComponent(linkId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke link");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emergency-card", petId] }),
  });
}
