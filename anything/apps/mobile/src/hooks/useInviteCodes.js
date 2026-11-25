import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Invite codes (docs/pr6-invite-code-design.md). The code itself exists only in the create response and in the person's
// hands: nothing here stores, logs or re-reads it.

async function readJson(res) {
  return res.json().catch(() => ({}));
}

async function send(url, options) {
  const res = await fetch(url, options);
  const body = await readJson(res);
  if (res.ok) return body;
  const error = new Error("invite code request failed");
  error.code = body?.code;
  error.petId = body?.pet_id;
  throw error;
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Server code -> i18n key under "inviteCode". Anything else (network, 500) reads as the generic one.
export const INVITE_ERROR_KEYS = {
  invite_invalid: "errorInvalid",
  invite_expired: "errorExpired",
  invite_revoked: "errorRevoked",
  invite_used: "errorUsed",
  invite_own_pet: "errorOwnPet",
  invite_already_member: "errorAlreadyMember",
  too_many_codes: "errorTooMany",
  invite_codes_unavailable: "errorUnavailable",
  rate_limited: "errorRateLimited",
};

export const inviteErrorKey = (error) =>
  `inviteCode.${INVITE_ERROR_KEYS[error?.code] ?? "errorGeneric"}`;

export function useInviteCodes(petId) {
  return useQuery({
    queryKey: ["pet-invite-codes", petId],
    queryFn: async () => (await send(`/api/pet-invite-codes?petId=${petId}`)).invites ?? [],
    enabled: !!petId,
    retry: false,
  });
}

export function useCreateInviteCode(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role) => send("/api/pet-invite-codes", json("POST", { petId, role })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pet-invite-codes", petId] }),
    gcTime: 0, // the response holds the code: do not keep it around
  });
}

export function useRevokeInviteCode(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => send(`/api/pet-invite-codes/${id}`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["pet-invite-codes", petId] }),
  });
}

export function useRedeemInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code) => send("/api/pet-invite-codes/redeem", json("POST", { code })),
    gcTime: 0,
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["shared-with-me"] });
      qc.invalidateQueries({ queryKey: ["household"] });
      await qc.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}
