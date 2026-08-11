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

// `petId` (the commenter's ACTIVE pet) attributes the comment to that pet, mirroring the pet-feed
// bark. It's optional — a commenter with no active pet posts under their account (the server stores
// pet_id NULL and the display falls back to the account). Passed at hook creation so the screen call
// (`mutateAsync(text)`) stays unchanged.
export function useAddProviderPostComment(providerId, postId, petId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await fetch(
        `/api/providers/${providerId}/posts/${postId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // petId is dropped from the JSON when undefined/null, so a pet-less commenter is unchanged.
          body: JSON.stringify(petId != null ? { body, petId } : { body }),
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
