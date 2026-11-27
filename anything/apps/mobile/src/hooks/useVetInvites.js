import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// The owner's invite link routes (docs/vet-sharing-design.md "Invite by link"). This app version creates record links
// instead (useRecordLinks); invites made earlier can still be seen and withdrawn:
//   GET   /api/care-access/invites             — my invites, newest first, never with a link
//   PATCH /api/care-access/invites/[inviteId]  — withdraw
const INVITES_KEY = ["care-access-invites"];

async function failure(response) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || "Vet invite request failed");
  error.status = response.status;
  error.code = body.code;
  return error;
}

// Every dog's invites: the limit on open invites is per owner, so the owner must be able to see them all.
export function useVetInvites() {
  return useQuery({
    queryKey: INVITES_KEY,
    // A vet may have used an invite since the last read: never show a cached state as current.
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await fetch(`/api/care-access/invites`);
      if (!response.ok) throw await failure(response);
      const data = await response.json();
      return data.invites ?? [];
    },
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
