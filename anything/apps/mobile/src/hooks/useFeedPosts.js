import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { computePostingStreak } from "@/utils/feedDelight";
import { getLocalPostDateString } from "@/utils/dateUtils";

// Posting streak for one pet (ticket 2.37). The server returns the pet's recent
// daily-post days; we compute the consecutive-day run against the VIEWER's local
// day so the boundary is the phone's, not the server's. 0 when none → no badge.
export function usePostingStreak(petId) {
  const today = getLocalPostDateString();
  const query = useQuery({
    queryKey: ["posts", "streak", petId],
    enabled: !!petId,
    queryFn: async () => {
      const response = await fetch(`/api/posts/streak?petId=${petId}`);
      if (!response.ok) throw new Error("Failed to load streak");
      const data = await response.json();
      return data.dailyPostDates || [];
    },
  });
  const streak = computePostingStreak(query.data || [], today);
  return { streak, isLoading: query.isLoading };
}

export function useFeedPosts(limit = 20, offset = 0) {
  // Scope the feed to the active pet so the backend can order it
  // Following-first then Suggested (web Prompt 4). With no active pet we omit
  // viewerPetId entirely and the backend serves its global fallback.
  const { data: currentPet } = useCurrentPet();
  const viewerPetId = currentPet?.id ?? null;

  return useQuery({
    // viewerPetId is part of the key so switching pets refetches + re-scopes,
    // same as the other pet-scoped reads.
    queryKey: ["posts", "feed", limit, offset, viewerPetId],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (viewerPetId != null) {
        params.set("viewerPetId", String(viewerPetId));
      }
      const response = await fetch(`/api/posts?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch posts");
      }
      const data = await response.json();
      // Return in the order the endpoint sends (Following first, then
      // Suggested) — do NOT re-sort client-side.
      return data.posts;
    },
    staleTime: 0, // Always fetch fresh data to catch newly created posts
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postData) => {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create post");
      }

      return response.json();
    },
    onSuccess: (data) => {
      console.log(
        "[useCreatePost] Post created successfully, invalidating queries...",
      );

      // Optimistically add the new post to the cache
      queryClient.setQueriesData({ queryKey: ["posts", "feed"] }, (old) => {
        if (!old || !Array.isArray(old)) return [data.post];
        // Add new post to the beginning of the array
        return [data.post, ...old];
      });

      // Invalidate posts queries
      queryClient.invalidateQueries({ queryKey: ["posts"] });

      // IMPORTANT: Invalidate today's daily update query to unlock the Feed
      queryClient.invalidateQueries({ queryKey: ["today-daily-update"] });

      // Owner-level lock state (any owned pet posted today) — refresh so the
      // BeReal-style feed lock reflects the new post immediately.
      queryClient.invalidateQueries({ queryKey: ["owner-posted-today"] });

      console.log("[useCreatePost] ✅ All queries invalidated");
    },
  });
}

// Delete the caller's own post (ticket 2.36). Owner-only is enforced server-side
// (DELETE /api/posts/[id] matches on user_id). On success we invalidate the feed
// AND the daily-lock queries so deleting today's daily reopens the composer.
export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId) => {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete post");
      }

      return response.json();
    },
    onSuccess: (_data, postId) => {
      // Drop the post from any cached feed list immediately.
      queryClient.setQueriesData({ queryKey: ["posts", "feed"] }, (old) =>
        Array.isArray(old) ? old.filter((p) => p.id !== postId) : old,
      );
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      // Deleting today's daily frees the slot — refresh the lock state so the
      // BeReal composer reopens for a re-upload.
      queryClient.invalidateQueries({ queryKey: ["today-daily-update"] });
      queryClient.invalidateQueries({ queryKey: ["owner-posted-today"] });
    },
  });
}

// Edit the caption of the caller's own post (ticket 2.65). Text only — the photo
// and daily-lock are untouched (the PATCH route enforces owner-only + caption-only).
export function useUpdatePostCaption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, caption }) => {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update post");
      }

      return response.json();
    },
    onSuccess: (_data, { postId, caption }) => {
      // Reflect the new caption in any cached feed list immediately.
      queryClient.setQueriesData({ queryKey: ["posts", "feed"] }, (old) =>
        Array.isArray(old)
          ? old.map((p) => (p.id === postId ? { ...p, caption } : p))
          : old,
      );
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useTogglePaw(postId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ isPawed }) => {
      const method = isPawed ? "DELETE" : "POST";
      const response = await fetch(`/api/posts/${postId}/paw`, {
        method,
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to toggle paw");
      }

      return response.json();
    },
    onMutate: async ({ isPawed }) => {
      // Cancel outgoing refetches for all posts queries
      await queryClient.cancelQueries({ queryKey: ["posts"] });

      // Snapshot all previous posts queries
      const previousQueries = queryClient.getQueriesData({
        queryKey: ["posts"],
      });

      // Optimistically update all posts queries
      queryClient.setQueriesData({ queryKey: ["posts", "feed"] }, (old) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((post) =>
          post.id === postId
            ? {
                ...post,
                user_has_pawed: !isPawed,
                paw_count: isPawed ? post.paw_count - 1 : post.paw_count + 1,
              }
            : post,
        );
      });

      return { previousQueries };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function usePostBarks(postId) {
  return useQuery({
    queryKey: ["posts", postId, "barks"],
    queryFn: async () => {
      const response = await fetch(`/api/posts/${postId}/barks`);
      if (!response.ok) {
        throw new Error("Failed to fetch barks");
      }
      const data = await response.json();
      return data.barks;
    },
    enabled: !!postId,
  });
}

export function useCreateBark(postId) {
  const queryClient = useQueryClient();
  // Barks are posted AS the active pet — the API now requires a petId and
  // rejects a missing/non-owned pet with 400. Read it here so the call site
  // stays mutateAsync(text).
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (text) => {
      const petId = currentPet?.id;
      if (!petId) {
        // No active pet — surface a friendly error instead of sending a null
        // pet into a guaranteed 400.
        throw new Error("Pick a pet before barking.");
      }

      const response = await fetch(`/api/posts/${postId}/barks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, petId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create bark");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", postId, "barks"] });
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
  });
}
