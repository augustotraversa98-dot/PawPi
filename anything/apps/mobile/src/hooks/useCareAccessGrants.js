import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { grantMatchesChoice } from "@/utils/vetShare";
import { showChange } from "@/utils/sharingRefresh";
import { refreshWhoHasAccess, showVetAccess } from "@/hooks/useWhoHasAccess";

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

// Puts a grant the server answered with into the lists already read: this dog's, the one of every dog and "Who has
// access". A new grant by section (`replaces` its business) also ends whatever that business had open for the dog, as
// the server does.
async function showGrant(queryClient, petId, grant, { replaces, providerName } = {}) {
  await showChange(queryClient, ["care-access-grants"], (list, [, scope]) => {
    if (scope !== "all" && String(scope) !== String(petId)) return list;
    const next = list.map((g) => {
      if (g.id === grant.id) return { ...g, ...grant };
      const ended =
        replaces != null &&
        String(g.pet_id) === String(petId) &&
        String(g.provider_id) === String(replaces) &&
        (g.status === "active" || g.status === "pending");
      return ended ? { ...g, status: "revoked" } : g;
    });
    if (replaces == null || list.some((g) => g.id === grant.id)) return next;
    return [{ provider_name: providerName, ...grant }, ...next];
  });
  const listed = queryClient
    .getQueriesData({ queryKey: ["care-access-grants"] })
    .flatMap(([, list]) => list ?? [])
    .find((g) => g.id === grant.id);
  await showVetAccess(
    queryClient,
    { pet_id: petId, ...listed, ...grant },
    { provider_name: listed?.provider_name ?? providerName, pet_name: listed?.pet_name },
  );
}

// The lists are read again; the promise lasts until the ones on screen have answered.
const refreshGrants = (queryClient, petId) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["care-access-grants", petId] }),
    // (AUDIT A-24) The cross-pet list drives the bell badge.
    queryClient.invalidateQueries({ queryKey: ["care-access-grants", "all"] }),
    refreshWhoHasAccess(queryClient),
  ]);

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
    mutationFn: async ({ petId, providerId, providerName, sections, expiry }) => {
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
      if (grantMatchesChoice(grant, { sections, expiry })) {
        await showGrant(queryClient, petId, grant, { replaces: providerId, providerName });
        return { outcome: "shared", grant };
      }
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
    onSettled: (_data, _error, variables) => refreshGrants(queryClient, variables?.petId),
  });
}

// Approve / deny / revoke a single grant. The backend flips the grant's status
// (approve pending→active, deny pending→revoked, revoke active→revoked), which
// assertCareAccess honors instantly — so afterwards we just invalidate the grant
// lists and the trust screen reflects the current state.
export function useUpdateGrant(petId) {
  const queryClient = useQueryClient();

  return useMutation({
    // mutateAsync({ grantId, action: 'approve'|'deny'|'revoke', expiresAt?, petId? }) — petId when the grant is for
    // another dog than the hook's.
    mutationFn: async ({ grantId, action, expiresAt, petId: grantPetId }) => {
      const data = await patchGrant(grantId, action, expiresAt);
      if (data?.grant?.id != null) {
        await showGrant(queryClient, data.grant.pet_id ?? grantPetId ?? petId, data.grant);
      }
      return data;
    },
    // Settled, not only success: a refused change means the grant is no longer as the screen shows it.
    onSettled: (_data, _error, variables) => refreshGrants(queryClient, variables?.petId ?? petId),
  });
}
