import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Real social notifications (paw/bark/follow) for the current user (ticket 2.26).
// The bell merges these with the locally-generated reminder notifications.
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = await res.json();
      return data.notifications ?? [];
    },
    staleTime: 1000 * 30,
  });
}

// Mark notifications read: { ids: [..] } or { all: true }.
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to mark read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
