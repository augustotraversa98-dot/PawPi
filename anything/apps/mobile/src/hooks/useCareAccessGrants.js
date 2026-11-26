import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { grantMatchesChoice } from "@/utils/vetShare";

// Owner-facing care-access "trust" hooks (docs/provider-design.md §2 Consent + §4
// item 7). These wrap the owner-scoped grant routes shipped in T7:
//   GET   /api/care-access/grants?petId=        — my grants for a pet (newest first)
//   POST  /api/care-access/grants               — share chosen record sections for a chosen time
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

// ALL of the signed-in owner's care-access grants, across EVERY pet (no petId filter — the
// route scopes to owner_user_id = me when petId is omitted). Used by the owner hub's "Who has
// access" section (ticket 2.14). Empty → [].
export function useAllCareAccessGrants() {
  return useQuery({
    queryKey: ["care-access-grants", "all"],
    queryFn: async () => {
      const response = await fetch(`/api/care-access/grants`);
      if (!response.ok) {
        throw new Error("Failed to fetch care access grants");
      }
      const data = await response.json();
      return data.grants ?? [];
    },
  });
}

async function patchGrant(grantId, action, expiresAt) {
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
}

// The ONLY way the app shares the vet record: the parts and the length the owner chose, both required. The answer is
// checked before anything is reported as shared, because a server that cannot share by section answers with a wider,
// older grant. The whole check runs inside the mutation, so it finishes even if the screen is closed meanwhile.
//
// mutate({ petId, providerId, sections, expiry }) → { outcome, grant? }
//   "shared"          the grant is exactly the choice
//   "rolledBack"      a different grant was created, and was revoked
//   "rollbackFailed"  a different grant was created and is still there
//   "unchanged"       the server answered with access that already existed; nothing new was opened
//   "notApplied"      the grant that came back gives no access
//   "unconfirmed"     the answer carried no grant
// A refused request throws, with `status` set. onSuccess/onError are hook-level so they also run after unmount.
export function useShareRecord({ onSuccess, onError } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ petId, providerId, sections, expiry }) => {
      const response = await fetch(`/api/care-access/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, providerId, sections, expiry }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = new Error(body.error || "Failed to share records");
        error.status = response.status;
        throw error;
      }
      const data = await response.json().catch(() => null);
      const grant = data?.grant ?? null;
      if (grantMatchesChoice(grant, { sections, expiry })) return { outcome: "shared", grant };
      if (grant?.id == null) return { outcome: "unconfirmed" };
      if (grant.status !== "active") return { outcome: "notApplied", grant };
      if (data.deduped) return { outcome: "unchanged", grant };
      const revoked = await patchGrant(grant.id, "revoke").then(
        () => true,
        () => false,
      );
      return { outcome: revoked ? "rolledBack" : "rollbackFailed", grant };
    },
    onSuccess,
    onError,
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["care-access-grants", variables?.petId],
      });
      queryClient.invalidateQueries({ queryKey: ["care-access-grants", "all"] });
    },
  });
}

// Approve / deny / revoke a single grant. The backend flips the grant's status
// (approve pending→active, deny pending→revoked, revoke active→revoked), which
// assertCareAccess honors instantly — so afterwards we just invalidate this pet's
// grant list and the trust screen reflects the current state.
export function useUpdateGrant(petId) {
  const queryClient = useQueryClient();

  return useMutation({
    // mutateAsync({ grantId, action: 'approve'|'deny'|'revoke', expiresAt? })
    mutationFn: ({ grantId, action, expiresAt }) => patchGrant(grantId, action, expiresAt),
    // Settled, not only success: a refused change means the grant is no longer as the screen shows it.
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["care-access-grants", petId],
      });
      // (AUDIT A-24) Also refresh the cross-pet ["care-access-grants","all"] list
      // that drives the bell badge — otherwise approving/denying a request left
      // the pending-count badge stale until a manual reload.
      queryClient.invalidateQueries({
        queryKey: ["care-access-grants", "all"],
      });
    },
  });
}
