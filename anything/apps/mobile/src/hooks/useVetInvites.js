import { Share } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// The owner's "invite a vet by link" routes (docs/vet-sharing-design.md "Invite by link"):
//   GET   /api/care-access/invites             — my invites, newest first, never with a link
//   POST  /api/care-access/invites             — create one; its link comes back in this answer only
//   PATCH /api/care-access/invites/[inviteId]  — withdraw
const INVITES_KEY = ["care-access-invites"];

async function failure(response) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || "Vet invite request failed");
  error.status = response.status;
  error.code = body.code;
  error.limit = body.limit;
  return error;
}

// Every dog's invites: the limit on open invites is per owner, so the owner must be able to see them all.
export function useVetInvites({ enabled = true } = {}) {
  return useQuery({
    queryKey: INVITES_KEY,
    enabled,
    queryFn: async () => {
      const response = await fetch(`/api/care-access/invites`);
      if (!response.ok) throw await failure(response);
      const data = await response.json();
      return data.invites ?? [];
    },
  });
}

// Creates an invite and hands its link straight to the phone's share sheet. The link is a secret: it lives only
// inside this function. It is never returned, so it cannot end up in the query cache, state or navigation, and it
// must never be logged.
//
// mutate({ petId, message }) → { outcome: "shared" | "notShared", inviteId }
//   "notShared"  the invite exists, but its link did not leave the phone and cannot be shown again
// A refused request throws, with `status`, `code` and `limit`.
export function useCreateVetInvite({ onSuccess, onError } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: async ({ petId, message }) => {
      const response = await fetch(`/api/care-access/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId }),
      });
      if (!response.ok) throw await failure(response);
      const data = await response.json().catch(() => null);
      const inviteId = data?.invite?.id ?? null;
      if (typeof data?.link !== "string" || !data.link) return { outcome: "notShared", inviteId };
      const sent = await Share.share({ message: `${message}\n${data.link}` }).then(
        (result) => result?.action !== Share.dismissedAction,
        () => false,
      );
      return { outcome: sent ? "shared" : "notShared", inviteId };
    },
    onSuccess,
    onError,
    onSettled: () => queryClient.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}

export function useWithdrawVetInvite({ onError } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId) => {
      const response = await fetch(`/api/care-access/invites/${inviteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      if (!response.ok) throw await failure(response);
      return response.json();
    },
    onError,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVITES_KEY });
      // A used invite means the vet's request exists: the access lists may be behind.
      queryClient.invalidateQueries({ queryKey: ["care-access-grants"] });
    },
  });
}
