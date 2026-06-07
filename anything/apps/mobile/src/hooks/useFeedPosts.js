import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useFeedPosts(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["posts", "feed", limit, offset],
    queryFn: async () => {
      const response = await fetch(
        `/api/posts?limit=${limit}&offset=${offset}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch posts");
      }
      const data = await response.json();
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

  return useMutation({
    mutationFn: async (text) => {
      const response = await fetch(`/api/posts/${postId}/barks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
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
