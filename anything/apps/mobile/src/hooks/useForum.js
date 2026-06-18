import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Alert } from "react-native";

// Community forum data hooks (ticket 2.44). Threads → comments → votes, all real API.

export const FORUM_CATEGORIES = [
  "All",
  "Health",
  "Food",
  "Training",
  "Behavior",
  "General",
];

// Browse threads, optionally by category, sorted hot/new/top.
export function useForumThreads(category = "All", sort = "hot") {
  return useQuery({
    queryKey: ["forum-threads", category, sort],
    queryFn: async () => {
      const params = new URLSearchParams({ sort });
      if (category && category !== "All") params.append("category", category);
      const res = await fetch(`/api/forum/threads?${params}`);
      if (!res.ok) throw new Error("Failed to load threads");
      const data = await res.json();
      return data.threads || [];
    },
  });
}

// A single thread + its comments.
export function useForumThread(threadId) {
  return useQuery({
    queryKey: ["forum-thread", threadId],
    queryFn: async () => {
      const res = await fetch(`/api/forum/threads/${threadId}`);
      if (!res.ok) throw new Error("Failed to load thread");
      return res.json(); // { thread, comments }
    },
    enabled: !!threadId,
  });
}

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await fetch("/api/forum/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to create thread");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-threads"] }),
    onError: (e) => Alert.alert("Error", e.message || "Could not post."),
  });
}

export function useCreateComment(threadId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, parentCommentId }) => {
      const res = await fetch(`/api/forum/threads/${threadId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentCommentId }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to comment");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["forum-threads"] });
    },
    onError: (e) => Alert.alert("Error", e.message || "Could not comment."),
  });
}

// Idempotent vote. value: 1 / -1 / 0 (clear).
export function useForumVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetType, targetId, value }) => {
      const res = await fetch("/api/forum/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, value }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to vote");
      }
      return res.json(); // { score, myVote }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-threads"] });
      qc.invalidateQueries({ queryKey: ["forum-thread"] });
    },
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId) => {
      const res = await fetch(`/api/forum/threads/${threadId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-threads"] }),
  });
}
