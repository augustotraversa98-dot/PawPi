import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Business-home posts (business mode). A provider's OWN storefront posts + the create path,
// both against the existing staff-gated routes (no new endpoints):
//   GET  /api/providers/[id]/posts   — this provider's non-deleted posts, newest-first, each with
//                                        paw_count + comment_count for the glance.
//   POST /api/providers/[id]/posts   — compose a "daily moment": an image post (image_urls) or a
//                                        video post (media_type:'video' + video_url [+ thumbnail]).
// Pattern mirrors useProviders.js: relative fetch, a query key, throw on !res.ok.

export const providerPostsKey = (providerId) => [
  "provider-posts",
  String(providerId ?? ""),
];

// List a provider's recent posts. Disabled until a providerId is known. Empty → [].
export function useProviderPosts(providerId) {
  return useQuery({
    queryKey: providerPostsKey(providerId),
    enabled: providerId != null,
    queryFn: async () => {
      const res = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/posts`,
      );
      if (!res.ok) {
        throw new Error("Failed to load your business posts");
      }
      const data = await res.json();
      return Array.isArray(data?.posts) ? data.posts : [];
    },
  });
}

// Create one post for a provider (business daily moment). `payload` is the raw provider-post body:
//   image: { body?, image_urls: [url] }
//   video: { body?, media_type: 'video', video_url, video_thumbnail_url? }
// Invalidates the provider's post list on success so the new moment appears at once.
export function useCreateProviderPost(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/posts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        let message = "Failed to post your moment";
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // non-JSON body → keep the friendly default
        }
        throw new Error(message);
      }
      const data = await res.json();
      return data?.post ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerPostsKey(providerId) });
    },
  });
}
