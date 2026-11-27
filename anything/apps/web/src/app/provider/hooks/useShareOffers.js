import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sharedPetsKey } from "./useProviders";

// Owners' invitations to this business to see a record (GET /api/providers/[id]/share-offers, POST .../[offerId]).

export const shareOffersKey = (providerId) => ["provider-share-offers", String(providerId ?? "")];
export const shareOffersUrl = (providerId) => `/api/providers/${providerId}/share-offers`;

async function request(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Empty when the server gave no words: the screen then shows its own.
    const error = new Error(data.error || "");
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export function useShareOffers(providerId) {
  return useQuery({
    queryKey: shareOffersKey(providerId),
    queryFn: () => request(shareOffersUrl(providerId)),
    enabled: providerId != null && providerId !== "",
    // The owner can send or withdraw one at any moment.
    staleTime: 0,
  });
}

// mutate({ offerId, action: "accept" | "decline" }). The lists are read again whatever the answer was.
export function useAnswerShareOffer(providerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, action }) =>
      request(`${shareOffersUrl(providerId)}/${offerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: shareOffersKey(providerId) }),
        queryClient.invalidateQueries({ queryKey: sharedPetsKey(providerId) }),
      ]),
  });
}
