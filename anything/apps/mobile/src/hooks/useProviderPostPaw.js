import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// "Paws" (likes) on a provider storefront post (ticket 2.94). Mirrors the pet-feed paw
// (useFeedPosts.useTogglePaw) optimistic pattern, keyed to the provider-scoped paw route.
//   • useProviderPostPaw   — reads { paw_count, is_pawed } for the viewer off the single-post GET
//     (auth-only; a guest skips the fetch and the UI shows the handoff's count / 0).
//   • useToggleProviderPostPaw — POST to paw / DELETE to un-paw, optimistic + rollback on error.
// The web endpoints DEGRADE CLEANLY before migration 0085 (missing table → 0 / not-pawed, no-op),
// so this hook never needs to special-case the pre-migration state — it just reflects what returns.

export const providerPostPawKey = (providerId, postId) => [
  "providers",
  String(providerId ?? ""),
  "posts",
  String(postId ?? ""),
  "paw",
];

export function useProviderPostPaw(providerId, postId, { enabled = true } = {}) {
  return useQuery({
    queryKey: providerPostPawKey(providerId, postId),
    enabled: enabled && providerId != null && postId != null,
    queryFn: async () => {
      const res = await fetch(`/api/providers/${providerId}/posts/${postId}`);
      if (!res.ok) throw new Error("Failed to fetch paw state");
      const post = (await res.json()).post ?? {};
      return {
        paw_count: Number(post.paw_count ?? 0),
        is_pawed: post.is_pawed === true,
      };
    },
  });
}

export function useToggleProviderPostPaw(providerId, postId) {
  const queryClient = useQueryClient();
  const key = providerPostPawKey(providerId, postId);
  return useMutation({
    // `isPawed` is the CURRENT state: pawed → DELETE (un-paw); not pawed → POST (paw).
    mutationFn: async ({ isPawed }) => {
      const res = await fetch(`/api/providers/${providerId}/posts/${postId}/paw`, {
        method: isPawed ? "DELETE" : "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update paw");
      }
      return await res.json(); // { paw_count, is_pawed }
    },
    onMutate: async ({ isPawed }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      const base = prev ?? { paw_count: 0, is_pawed: isPawed };
      const nextPawed = !isPawed;
      const delta = nextPawed ? 1 : -1;
      queryClient.setQueryData(key, {
        paw_count: Math.max(0, Number(base.paw_count ?? 0) + delta),
        is_pawed: nextPawed,
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(key, ctx.prev);
    },
    onSuccess: (data) => {
      // Reconcile with the server's authoritative count + state.
      queryClient.setQueryData(key, {
        paw_count: Number(data?.paw_count ?? 0),
        is_pawed: data?.is_pawed === true,
      });
    },
  });
}
