import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Owner-facing care-access "trust" hooks (docs/provider-design.md §2 Consent + §4
// item 7). These wrap the owner-scoped grant routes shipped in T7:
//   GET   /api/care-access/grants?petId=        — my grants for a pet (newest first)
//   PATCH /api/care-access/grants/[grantId]     — approve | deny | revoke
// Pattern mirrors useProviders / useVetAppointmentReminders: relative
// fetch("/api/..."), a query key, throw on !res.ok.

// All care-access grants for one pet that belong to the signed-in owner. Disabled
// until a petId is known so the trust screen never fetches without a pet.
export function useCareAccessGrants(petId) {
  return useQuery({
    queryKey: ["care-access-grants", petId],
    enabled: !!petId,
    queryFn: async () => {
      const response = await fetch(
        `/api/care-access/grants?petId=${encodeURIComponent(petId)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch care access grants");
      }
      const data = await response.json();
      return data.grants ?? [];
    },
  });
}

// Approve / deny / revoke a single grant. The backend flips the grant's status
// (approve pending→active, deny pending→revoked, revoke active→revoked), which
// assertCareAccess honors instantly — so on success we just invalidate this pet's
// grant list and the trust screen reflects the new state.
export function useUpdateGrant(petId) {
  const queryClient = useQueryClient();

  return useMutation({
    // mutateAsync({ grantId, action: 'approve'|'deny'|'revoke', expiresAt? })
    mutationFn: async ({ grantId, action, expiresAt }) => {
      const response = await fetch(`/api/care-access/grants/${grantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expiresAt }),
      });
      if (!response.ok) {
        // Surface the backend's 400/404/409 message rather than swallowing it.
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update grant");
      }
      return response.json(); // { grant }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["care-access-grants", petId],
      });
    },
  });
}
