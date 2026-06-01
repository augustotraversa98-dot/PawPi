import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

// Create a social walk
export function useCreateSocialWalk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (socialWalkData) => {
      const response = await fetch("/api/social-walks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(socialWalkData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create social walk");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-walks"] });
      console.log("[useSocialWalks] Social walk created successfully");
    },
    onError: (error) => {
      console.error("[useSocialWalks] Error creating social walk:", error);
      Alert.alert("Error", "Could not create social walk. Please try again.");
    },
  });
}

// Get social walks (discoverable or owned)
export function useSocialWalks(visibility = null, myWalks = false) {
  return useQuery({
    queryKey: ["social-walks", visibility, myWalks],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (visibility) params.append("visibility", visibility);
      if (myWalks) params.append("myWalks", "true");

      const response = await fetch(`/api/social-walks?${params}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch social walks");
      }

      const data = await response.json();
      return data.walks || [];
    },
  });
}

// Request to join a social walk
export function useJoinSocialWalk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ socialWalkId, petId, message }) => {
      const response = await fetch(
        `/api/social-walks/${socialWalkId}/join-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ petId, message }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to request join");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-walks"] });
      Alert.alert("Request sent!", "The walk owner will review your request.");
    },
    onError: (error) => {
      console.error("[useSocialWalks] Error requesting to join:", error);
      Alert.alert("Error", error.message || "Could not send request.");
    },
  });
}

// Get join requests for a social walk (owner only)
export function useJoinRequests(socialWalkId) {
  return useQuery({
    queryKey: ["social-walk-join-requests", socialWalkId],
    queryFn: async () => {
      if (!socialWalkId) return [];

      const response = await fetch(
        `/api/social-walks/${socialWalkId}/join-request`,
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch join requests");
      }

      const data = await response.json();
      return data.joinRequests || [];
    },
    enabled: !!socialWalkId,
  });
}

// Approve a join request
export function useApproveJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ socialWalkId, requestId }) => {
      const response = await fetch(
        `/api/social-walks/${socialWalkId}/join-request/${requestId}/approve`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to approve request");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["social-walk-join-requests"],
      });
      queryClient.invalidateQueries({ queryKey: ["social-walks"] });
      Alert.alert("Approved!", "The requester has been notified.");
    },
    onError: (error) => {
      console.error("[useSocialWalks] Error approving request:", error);
      Alert.alert("Error", error.message || "Could not approve request.");
    },
  });
}

// Decline a join request
export function useDeclineJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ socialWalkId, requestId }) => {
      const response = await fetch(
        `/api/social-walks/${socialWalkId}/join-request/${requestId}/decline`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to decline request");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["social-walk-join-requests"],
      });
      Alert.alert("Declined", "The request has been declined.");
    },
    onError: (error) => {
      console.error("[useSocialWalks] Error declining request:", error);
      Alert.alert("Error", error.message || "Could not decline request.");
    },
  });
}
