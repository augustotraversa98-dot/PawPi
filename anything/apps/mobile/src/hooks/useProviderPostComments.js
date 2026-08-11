import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Comments on a provider storefront post (Phase C). The GET is PUBLIC (guests can read); POST
// and DELETE require a signed-in user. Mirrors the barks/place-review hook shape: relative-URL
// fetch, throw on !ok, invalidate on success (no optimistic add).

const commentsKey = (providerId, postId) => [
  "providers",
  String(providerId ?? ""),
  "posts",
  String(postId ?? ""),
  "comments",
];

export function useProviderPostComments(providerId, postId) {
  return useQuery({
    queryKey: commentsKey(providerId, postId),
    enabled: providerId != null && postId != null,
    queryFn: async () => {
      const res = await fetch(
        `/api/providers/${providerId}/posts/${postId}/comments`,
      );
      if (!res.ok) throw new Error("Failed to fetch comments");
      return (await res.json()).comments ?? [];
    },
  });
}

export function useAddProviderPostComment(providerId, postId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch(
        `/api/providers/${providerId}/posts/${postId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add comment");
      }
      return (await res.json()).comment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsKey(providerId, postId) });
    },
  });
}

export function useDeleteProviderPostComment(providerId, postId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (commentId) => {
      const res = await fetch(
        `/api/providers/${providerId}/posts/${postId}/comments/${commentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove comment");
      }
      return commentId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsKey(providerId, postId) });
    },
  });
}
