import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshWhoHasAccess, showAccessEnded } from "@/hooks/useWhoHasAccess";

// Emergency Card (ticket 2.51) — the OWNER hooks. The card assembles from the LIVE medical
// sources server-side; the public surfaces (tag/link) are read elsewhere via DEFINER fns. All
// owner-scoped (RLS-guarded). Empty medical fields come back null → the UI shows "Not recorded".
//
// Writes are OPTIMISTIC: the tap shows at once, the server's answer is written straight into the cache (no
// refetch of the whole card, which costs several seconds in production), and a refused write is rolled back.

// The web host that serves the PUBLIC /p/tag and /p/card pages (same origin as the API).
const WEB_BASE = (process.env.EXPO_PUBLIC_BASE_URL || "").replace(/\/$/, "");
export const tagUrl = (token) => `${WEB_BASE}/p/tag/${token}`;
export const cardUrl = (token) => `${WEB_BASE}/p/card/${token}`;

const cardKey = (petId) => ["emergency-card", petId];

// The phone / email switches. A server without them answers 200 and saves none of these, so such an answer
// counts as a failed save (rolled back, the owner is told, and the card is read again).
const CHANNEL_FIELDS = [
  "contact_phone_enabled",
  "contact_email_enabled",
  "contact_message_enabled",
  "contact_phone",
  "contact_email",
];

export function useEmergencyCard(petId) {
  return useQuery({
    queryKey: cardKey(petId),
    enabled: petId != null,
    queryFn: async () => {
      const res = await fetch(`/api/emergency-card?petId=${encodeURIComponent(petId)}`);
      if (!res.ok) throw new Error("Failed to load emergency card");
      return res.json();
    },
  });
}

export function useUpdateEmergencyCard(petId, { onError } = {}) {
  const qc = useQueryClient();
  const queryKey = cardKey(petId);
  const mutationKey = ["emergency-card-update", petId];
  const isLastInFlight = () => qc.isMutating({ mutationKey }) === 1;
  return useMutation({
    mutationKey,
    // One PATCH at a time per pet, in tap order, so an older save can never land after a newer one.
    scope: { id: `emergency-card-update-${petId}` },
    mutationFn: async (patch) => {
      const res = await fetch(`/api/emergency-card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, ...patch }),
      });
      if (!res.ok) throw new Error("Failed to update emergency card");
      const result = await res.json();
      const setsChannels = Object.keys(patch).some((field) => CHANNEL_FIELDS.includes(field));
      if (setsChannels && typeof result?.card?.contact_phone_enabled !== "boolean") {
        throw new Error("Failed to update emergency card");
      }
      return result;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData(queryKey)?.card;
      qc.setQueryData(queryKey, (old) =>
        old?.card ? { ...old, card: { ...old.card, ...patch } } : old,
      );
      return { previous };
    },
    onError: (error, patch, context) => {
      // Undo only the fields this save changed and no newer tap has changed since.
      qc.setQueryData(queryKey, (old) => {
        if (!old?.card || !context?.previous) return old;
        const card = { ...old.card };
        for (const field of Object.keys(patch)) {
          if (card[field] === patch[field]) card[field] = context.previous[field];
        }
        return { ...old, card };
      });
      onError?.(error);
    },
    onSuccess: (result) => {
      // Only the last save in flight writes the server's row, so it cannot undo a newer tap.
      if (result?.card && isLastInFlight()) {
        qc.setQueryData(queryKey, (old) => (old ? { ...old, card: result.card } : old));
      }
    },
    onSettled: (_result, error, patch) => {
      // After a failure, ask the server what is really saved.
      if (error && isLastInFlight()) qc.invalidateQueries({ queryKey });
      // A card switched off or on closes or reopens its links.
      if (patch?.active !== undefined) refreshWhoHasAccess(qc);
    },
  });
}

export function useCreateEmergencyLink(petId, { onError } = {}) {
  const qc = useQueryClient();
  const queryKey = cardKey(petId);
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
    onSuccess: async (result) => {
      refreshWhoHasAccess(qc);
      const link = result?.link;
      if (!link) return qc.invalidateQueries({ queryKey });
      // A load already in flight predates this link and would drop it again.
      await qc.cancelQueries({ queryKey });
      qc.setQueryData(queryKey, (old) =>
        old
          ? { ...old, links: [link, ...(old.links || []).filter((l) => l.id !== link.id)] }
          : old,
      );
    },
    onError: (error) => onError?.(error),
  });
}

export function useRevokeEmergencyLink(petId, { onError } = {}) {
  const qc = useQueryClient();
  const queryKey = cardKey(petId);
  return useMutation({
    mutationFn: async (linkId) => {
      const res = await fetch(`/api/emergency-card/links/${encodeURIComponent(linkId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke link");
      return res.json();
    },
    onSuccess: async (_result, linkId) => {
      await showAccessEnded(qc, "emergency_link", linkId);
      refreshWhoHasAccess(qc);
    },
    onMutate: async (linkId) => {
      await qc.cancelQueries({ queryKey });
      const links = qc.getQueryData(queryKey)?.links || [];
      const index = links.findIndex((l) => l.id === linkId);
      qc.setQueryData(queryKey, (old) =>
        old ? { ...old, links: (old.links || []).filter((l) => l.id !== linkId) } : old,
      );
      return { index, link: links[index] };
    },
    onError: (error, _linkId, context) => {
      if (context?.link) {
        qc.setQueryData(queryKey, (old) => {
          if (!old || (old.links || []).some((l) => l.id === context.link.id)) return old;
          const links = [...(old.links || [])];
          links.splice(context.index, 0, context.link);
          return { ...old, links };
        });
      }
      qc.invalidateQueries({ queryKey });
      onError?.(error);
    },
  });
}
