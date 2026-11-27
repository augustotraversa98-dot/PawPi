import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { getI18n } from "react-i18next";
import { alertError, alertText } from "@/utils/appAlert";
import useInviteCooldownStore from "@/store/inviteCooldownStore";
import { refreshWhoHasAccess, showAccessEnded } from "@/hooks/useWhoHasAccess";

// Family/caregiver sharing (ticket 2.47): person↔person pet access grants.

// Grants on a pet I own (who has access).
export function usePetGrants(petId) {
  return useQuery({
    queryKey: ["pet-grants", petId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-caregivers?petId=${petId}`);
      if (!res.ok) throw new Error("Failed to load");
      return (await res.json()).grants || [];
    },
    enabled: !!petId,
  });
}

// Pets shared WITH me (as a grantee).
export function useSharedWithMe() {
  return useQuery({
    queryKey: ["shared-with-me"],
    queryFn: async () => {
      const res = await fetch("/api/pet-caregivers?mine=true");
      if (!res.ok) throw new Error("Failed to load");
      return (await res.json()).grants || [];
    },
  });
}

export function useInviteCaregiver(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ granteeUsername, granteeUserId, role, expiresAt }) => {
      const res = await fetch("/api/pet-caregivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, granteeUsername, granteeUserId, role, expiresAt }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to invite");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet-grants", petId] });
      alertText("appAlerts.inviteSentTitle", "appAlerts.inviteSentBody");
    },
    onError: (e) => alertError(e, "appAlerts.couldNotInvite"),
  });
}

export function useRespondGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ grantId, accept }) => {
      const res = await fetch(`/api/pet-caregivers/${grantId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-with-me"] }),
    onError: (e) => alertError(e, "appAlerts.couldNotRespond"),
  });
}

export function useRevokeGrant(petId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grantId) => {
      const res = await fetch(`/api/pet-caregivers/${grantId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke");
      return res.json();
    },
    onSuccess: async (_data, grantId) => {
      await showAccessEnded(qc, "family", grantId);
      refreshWhoHasAccess(qc);
      return qc.invalidateQueries({ queryKey: ["pet-grants", petId] });
    },
    onError: (e) => alertError(e, "appAlerts.couldNotRevoke"),
  });
}

// A member leaves a shared dog (POST /api/pet-caregivers/[id]/leave — the member's own grant only). The server keeps the history and the owner
// can invite them again. On success the pets list is refetched: usePetProfile's reconcile then sees the dog gone and clears everything keyed to it.
export function useLeaveGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grantId) => {
      const res = await fetch(`/api/pet-caregivers/${grantId}/leave`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to leave");
      return res.json().catch(() => ({}));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-with-me"] });
      qc.invalidateQueries({ queryKey: ["pets"] });
      qc.invalidateQueries({ queryKey: ["household"] });
    },
    onError: (e) => alertError(e, "sharedDog.leaveError"),
  });
}

// The server allows one resend per invite per hour.
export const RESEND_COOLDOWN_MS = 60 * 60 * 1000;

function say(titleKey, bodyKey, params) {
  const t = (key) => {
    try {
      return getI18n()?.t?.(key, params) ?? key;
    } catch {
      return key;
    }
  };
  Alert.alert(t(titleKey), t(bodyKey));
}

// The owner resends a PENDING invite (POST /api/pet-caregivers/[id]/resend). Every answer is explained in the person's
// language from the server's CODE; the server's own English sentence is never shown.
export function useResendInvite(petId) {
  const qc = useQueryClient();
  const startCooldown = useInviteCooldownStore((s) => s.startCooldown);
  return useMutation({
    mutationFn: async (grantId) => {
      const res = await fetch(`/api/pet-caregivers/${grantId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return body;
      const error = new Error("resend failed");
      error.code = body?.code;
      error.retryAfterSeconds = body?.retry_after_seconds;
      throw error;
    },
    onSuccess: (_data, grantId) => {
      startCooldown(grantId, RESEND_COOLDOWN_MS);
      say("sharedDog.resendSentTitle", "sharedDog.resendSentBody");
    },
    onError: (error, grantId) => {
      switch (error?.code) {
        case "resend_too_soon": {
          const seconds = Number(error.retryAfterSeconds) || RESEND_COOLDOWN_MS / 1000;
          startCooldown(grantId, seconds * 1000);
          say("sharedDog.resendTooSoonTitle", "sharedDog.resendTooSoonBody", {
            minutes: Math.max(1, Math.ceil(seconds / 60)),
          });
          return;
        }
        case "resend_limit":
          say("sharedDog.resendLimitTitle", "sharedDog.resendLimitBody");
          return;
        case "invite_not_pending":
        case "grant_not_found":
          qc.invalidateQueries({ queryKey: ["pet-grants", petId] });
          say("sharedDog.resendAnsweredTitle", "sharedDog.resendAnsweredBody");
          return;
        case "sharing_lifecycle_unavailable":
          say("sharedDog.resendFailedTitle", "sharedDog.resendUnavailable");
          return;
        default:
          say("sharedDog.resendFailedTitle", "sharedDog.resendFailed");
      }
    },
  });
}
