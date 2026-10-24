import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFocusedQuery } from "@/hooks/useFocusedPolling";

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

// How many of the caller's DB notifications are unread (drives the Feed header bell badge). The server returns
// `unread_count` only while its NOTIF_V2_ENABLED flag is on; otherwise this is 0 and the badge is unchanged.
// Shares the ["notifications"] prefix, so marking read invalidates it too. Never throws (a failed poll = 0).
export function useUnreadNotificationCount() {
  // Polls once a minute, only while the screen showing the bell is focused (a hidden tab does not poll).
  return useFocusedQuery(
    {
      queryKey: ["notifications", "unread-count"],
      queryFn: async () => {
        try {
          const res = await fetch("/api/notifications?limit=1");
          if (!res.ok) return 0;
          const data = await res.json();
          return Number.isInteger(data?.unread_count) && data.unread_count > 0 ? data.unread_count : 0;
        } catch {
          return 0;
        }
      },
      staleTime: 1000 * 30,
      retry: false,
    },
    1000 * 60,
  );
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
