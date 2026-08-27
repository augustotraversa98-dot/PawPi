import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Hooks behind the mobile "¿Es tu negocio? Reclamalo" flow (0125). Mirrors the
// useProviders.js style: relative fetch, React Query for caching, throw on !res.ok.
//
// Backend contract (PR 2/3):
//   POST /api/providers/:id/claim     — open a claim (201 new, 200 re-opened)
//   GET  /api/providers/:id/claim     — the caller's own claim on this provider (404 if none)
//   GET  /api/providers/claims/mine   — the caller's claim history

// The caller's OWN claim on a specific provider, if any. Returns null on 404 so the
// storefront CTA can render "Reclamalo" vs "Solicitud enviada" without a try/catch.
export function useMyClaimForProvider(providerId) {
  return useQuery({
    queryKey: ["provider-claims", "mine", "for", providerId],
    enabled: providerId != null,
    queryFn: async () => {
      const res = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/claim`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load claim");
      const data = await res.json();
      return data.claim ?? null;
    },
  });
}

// The caller's claim history — powers the "My claims" screen.
export function useMyClaims() {
  return useQuery({
    queryKey: ["provider-claims", "mine"],
    queryFn: async () => {
      const res = await fetch(`/api/providers/claims/mine`);
      if (!res.ok) throw new Error("Failed to load claims");
      const data = await res.json();
      return data.claims ?? [];
    },
  });
}

// Open (or re-open) a claim. On success, invalidate both the per-provider claim
// query and the "my claims" list so the storefront + list both refresh atomically.
export function useOpenClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, method = null, note = null, evidence = null }) => {
      const res = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/claim`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method, note, evidence }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface a structured error so the UI can render 409 (already claimed) vs
        // 404 (provider gone) vs a generic 500 with an actionable message.
        const err = new Error(data?.error || "Failed to open claim");
        err.status = res.status;
        err.claim_status = data?.claim_status ?? null;
        throw err;
      }
      return data.claim;
    },
    onSuccess: (claim) => {
      qc.invalidateQueries({ queryKey: ["provider-claims", "mine"] });
      if (claim?.provider_id != null) {
        qc.invalidateQueries({
          queryKey: ["provider-claims", "mine", "for", claim.provider_id],
        });
      }
    },
  });
}
