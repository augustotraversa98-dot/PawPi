import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

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
      Alert.alert("Invite sent", "They'll get access once they accept.");
    },
    onError: (e) => Alert.alert("Error", e.message || "Could not invite."),
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
    onError: (e) => Alert.alert("Error", e.message || "Could not respond."),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pet-grants", petId] }),
    onError: (e) => Alert.alert("Error", e.message || "Could not revoke."),
  });
}
