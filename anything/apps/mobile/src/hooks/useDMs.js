import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Owner↔owner direct messages (ticket 2.27). Real, participant-scoped; mirrors the
// provider-chat hooks but against /api/dm-threads. SEPARATE from the provider chat.

// My DM threads (newest first). Polls every 15s while the inbox is open.
export function useDMThreads() {
  return useQuery({
    queryKey: ["dm-threads"],
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await fetch("/api/dm-threads");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const data = await res.json();
      return data.threads ?? [];
    },
  });
}

// One thread's messages (newest first). Polls every 8s while open.
export function useDMMessages(threadId) {
  return useQuery({
    queryKey: ["dm-messages", threadId],
    enabled: threadId != null,
    refetchInterval: 8000,
    queryFn: async () => {
      const res = await fetch(
        `/api/dm-threads/${encodeURIComponent(threadId)}/messages?limit=50`,
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      return data.messages ?? [];
    },
  });
}

// Start (or reuse) a DM thread with another owner. mutateAsync({ otherUserId }) →
// { thread, reused }. Idempotent per pair.
export function useStartDM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch("/api/dm-threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to start conversation");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-threads"] });
    },
  });
}

// Send a DM ({ body?, image_url? }). Refetches this thread + the inbox + badge.
export function useSendDM(threadId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch(
        `/api/dm-threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-messages", threadId] });
      queryClient.invalidateQueries({ queryKey: ["dm-threads"] });
      queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
    },
  });
}

// Mark a DM thread read (clears my unread for it).
export function useMarkDMRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (threadId) => {
      const res = await fetch(
        `/api/dm-threads/${encodeURIComponent(threadId)}/read`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Failed to mark read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-threads"] });
      queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
    },
  });
}
