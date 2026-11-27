import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Inviting a vet that is on PawPi (docs/vet-sharing-design.md "Invitations to a vet on PawPi"). The owner finds a
// business and offers it parts of the record; nothing is visible until the business accepts.
//   GET   /api/care-access/vets?q=                       — businesses that can be invited
//   GET   /api/care-access/offers                        — my invitations
//   POST  /api/care-access/offers                        — send one
//   PATCH /api/care-access/offers/[offerId]              — withdraw an unanswered one
//   GET   /api/providers/[id]/share-offers               — invitations to my business
//   POST  /api/providers/[id]/share-offers/[offerId]     — accept or decline
export const OWNER_OFFERS_KEY = ["care-share-offers"];
export const providerOffersKey = (providerId) => ["provider-share-offers", String(providerId ?? "")];
export const OFFERS_UNAVAILABLE = "share_offers_unavailable";
const SEARCH_DELAY_MS = 350;

async function failure(response) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || "Share invitation request failed");
  error.status = response.status;
  // A server from before invitations answers "not_found" for the whole path.
  error.code = body.error === "not_found" ? OFFERS_UNAVAILABLE : body.code;
  error.limit = body.limit;
  error.offer = body.offer;
  return error;
}

// Reads a list route; a server or database without invitations answers { available: false }.
async function readList(url, field) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await failure(response);
    if (error.code === OFFERS_UNAVAILABLE) return { available: false, [field]: [] };
    throw error;
  }
  const data = await response.json();
  return { available: data.available !== false, [field]: data[field] ?? [] };
}

function useSettled(value, delay) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

// The businesses matching what the owner types, asked once typing pauses. With fewer than two characters the server
// answers no businesses, but still says whether inviting is available. `term` is what the shown results are for.
export function useVetSearch(text) {
  const typed = text.trim().length >= 2 ? text.trim() : "";
  const term = useSettled(typed, SEARCH_DELAY_MS);
  const query = useQuery({
    queryKey: ["care-share-vets", term],
    queryFn: () => readList(`/api/care-access/vets?q=${encodeURIComponent(term)}`, "vets"),
  });
  return { ...query, term, waiting: typed !== term };
}

// My invitations for every dog.
export function useShareOffers({ enabled = true } = {}) {
  return useQuery({
    queryKey: OWNER_OFFERS_KEY,
    enabled,
    // A business may have answered since the last read.
    refetchOnMount: "always",
    queryFn: () => readList(`/api/care-access/offers`, "offers"),
  });
}

async function withdraw(offerId) {
  const response = await fetch(`/api/care-access/offers/${offerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "withdraw" }),
  });
  if (!response.ok) throw await failure(response);
  return response.json();
}

const refreshOwner = (queryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: OWNER_OFFERS_KEY }),
    // An accepted invitation is access: those lists may be behind too.
    queryClient.invalidateQueries({ queryKey: ["care-access-grants"] }),
  ]);

const sameChoice = (offer, { sections, expiry }) =>
  offer?.status === "open" &&
  offer.expiry === expiry &&
  Array.isArray(offer.sections) &&
  offer.sections.length === sections.length &&
  sections.every((s) => offer.sections.includes(s));

// mutate({ petId, providerId, sections, expiry, providerName, replaceOfferId? }) → { outcome, offer }
//   "sent"          the invitation is waiting for the business, exactly as chosen
//   "alreadySent"   the same invitation was already waiting
//   "unconfirmed"   the answer did not show the chosen invitation
// `replaceOfferId` withdraws that unanswered invitation first. A refused request throws, with `status`, `code`,
// `limit` and, for 'offer_open', the invitation that is waiting.
export function useSendShareOffer({ onSuccess, onError, onSettled } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: async ({ petId, providerId, sections, expiry, replaceOfferId }) => {
      if (replaceOfferId != null) await withdraw(replaceOfferId);
      const response = await fetch(`/api/care-access/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, providerId, sections, expiry }),
      });
      if (!response.ok) throw await failure(response);
      const data = await response.json().catch(() => null);
      const offer = data?.offer ?? null;
      if (!sameChoice(offer, { sections, expiry })) return { outcome: "unconfirmed", offer };
      return { outcome: data.deduped ? "alreadySent" : "sent", offer };
    },
    onSuccess,
    onError,
    onSettled: () => {
      onSettled?.();
      return refreshOwner(queryClient);
    },
  });
}

export function useWithdrawShareOffer({ onError } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withdraw,
    onError,
    onSettled: () => refreshOwner(queryClient),
  });
}

// Invitations to one of my businesses.
export function useProviderShareOffers(providerId) {
  return useQuery({
    queryKey: providerOffersKey(providerId),
    enabled: providerId != null,
    refetchOnMount: "always",
    queryFn: () => readList(`/api/providers/${providerId}/share-offers`, "offers"),
  });
}

// mutate({ offerId, action: "accept" | "decline" }) → the server's { status, pet_name, ... }
export function useAnswerShareOffer(providerId, { onSuccess, onError, onSettled } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: async ({ offerId, action }) => {
      const response = await fetch(`/api/providers/${providerId}/share-offers/${offerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw await failure(response);
      return response.json();
    },
    onSuccess,
    onError,
    onSettled: () => {
      onSettled?.();
      return queryClient.invalidateQueries({ queryKey: providerOffersKey(providerId) });
    },
  });
}
