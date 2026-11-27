import { Share } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { recordLinkMatchesChoice, updateMatchesChoice } from "@/utils/vetShare";
import { showChange } from "@/utils/sharingRefresh";
import { refreshWhoHasAccess, showAccessEnded, showAccessGiven } from "@/hooks/useWhoHasAccess";

// The owner's record link routes (docs/vet-sharing-design.md "Record links"): whoever has such a link sees the chosen
// parts of the record without signing in.
//   GET   /api/care-access/links           — my links, never with an address
//   POST  /api/care-access/links           — create one from a complete choice; its address comes back in this answer only
//   PATCH /api/care-access/links/[linkId]  — change (same link, same address) or remove
const LINKS_KEY = ["care-record-links"];
export const LINKS_UNAVAILABLE = "share_links_unavailable";

async function failure(response) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || "Record link request failed");
  error.status = response.status;
  // A server from before record links answers "not_found" for the whole path.
  error.code = body.error === "not_found" ? LINKS_UNAVAILABLE : body.code;
  error.limit = body.limit;
  error.linkId = body.linkId;
  return error;
}

// → { available, editAccessAvailable, links }. Every dog's links: the limit is per owner, so the owner must be able to
// see them all. `available` is false when the server or its database cannot make links yet; `editAccessAvailable`
// false hides every edit control.
export function useRecordLinks({ enabled = true } = {}) {
  return useQuery({
    queryKey: LINKS_KEY,
    enabled,
    // A link ends by date: never show a cached state as current.
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await fetch(`/api/care-access/links`);
      if (!response.ok) {
        const error = await failure(response);
        if (error.code === LINKS_UNAVAILABLE) return { available: false, links: [] };
        throw error;
      }
      const data = await response.json();
      return {
        available: data.available !== false,
        editAccessAvailable: data.editAccessAvailable === true,
        links: data.links ?? [],
      };
    },
  });
}

const showRemoved = (queryClient, linkId) =>
  showChange(queryClient, LINKS_KEY, (data) => ({
    ...data,
    links: data.links.map((l) => (l.id === linkId ? { ...l, status: "revoked" } : l)),
  }));

async function revoke(linkId) {
  const response = await fetch(`/api/care-access/links/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "revoke" }),
  });
  if (!response.ok) throw await failure(response);
  return response.json();
}

// Creates a link and hands its address straight to the phone's share sheet. The address is a secret: it lives only
// inside this function. It is never returned, so it cannot end up in the query cache, state or navigation, and it must
// never be logged.
//
// `editSections` (what can be added) is sent only to a server that can store it, and then agrees with `allowNotes`.
//
// mutate({ petId, petName, sections, expiry, allowNotes, editSections?, message, requestKey }) → { outcome, linkId }
//   "shared"        the link is exactly the choice and left through the share sheet
//   "notShared"     the link exists, but its address did not leave the phone and cannot be shown again
//   "mismatch"      the link did not match the choice; it was removed without being sent
//   "mismatchKept"  the link did not match the choice and could not be removed; it was not sent
// `requestKey` names this one request: a server that already created its link answers so instead of creating another,
// and the outcome is "notShared". A refused request throws, with `status`, `code` and `limit`.
export function useCreateRecordLink({ onSuccess, onError, onSettled } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: async ({
      petId,
      petName,
      sections,
      expiry,
      allowNotes,
      editSections,
      message,
      requestKey,
    }) => {
      const response = await fetch(`/api/care-access/links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(requestKey ? { "Idempotency-Key": requestKey } : {}),
        },
        body: JSON.stringify({ petId, sections, expiry, allowNotes, editSections }),
      });
      if (!response.ok) {
        const error = await failure(response);
        if (error.code === "link_already_created") return { outcome: "notShared", linkId: error.linkId ?? null };
        throw error;
      }
      const data = await response.json().catch(() => null);
      const link = data?.link ?? null;
      const linkId = link?.id ?? null;
      if (!recordLinkMatchesChoice(link, { sections, expiry, allowNotes, editSections })) {
        if (linkId == null) return { outcome: "notShared", linkId };
        const removed = await revoke(linkId).then(
          () => true,
          () => false,
        );
        return { outcome: removed ? "mismatch" : "mismatchKept", linkId };
      }
      // Listed before the share sheet opens over the screen.
      await showChange(queryClient, LINKS_KEY, (list) => ({
        ...list,
        links: [{ pet_name: petName, ...link }, ...list.links.filter((l) => l.id !== linkId)],
      }));
      await showAccessGiven(queryClient, { pet_name: petName, ...link, kind: "record_link" });
      if (typeof data.url !== "string" || !data.url) return { outcome: "notShared", linkId };
      const sent = await Share.share({ message: `${message}\n${data.url}` }).then(
        (result) => result?.action !== Share.dismissedAction,
        () => false,
      );
      return { outcome: sent ? "shared" : "notShared", linkId };
    },
    onSuccess,
    onError,
    onSettled: () => {
      onSettled?.();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: LINKS_KEY }),
        refreshWhoHasAccess(queryClient),
      ]);
    },
  });
}

// Changes an existing link: the same link at the same address. Nothing is sent again.
//
// mutate({ link, sections, editSections, expiry }) → { outcome, linkId }
//   "saved"       the same link, exactly as chosen ('keep' leaves its end date)
//   "mismatch"    the answer is not that: the owner is asked to check it
// A refused request throws, with `status` and `code`, and nothing changed.
export function useEditRecordLink({ onSuccess, onError, onSettled } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: async ({ link, sections, editSections, expiry }) => {
      const response = await fetch(`/api/care-access/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", sections, editSections, expiry }),
      });
      if (!response.ok) throw await failure(response);
      const updated = (await response.json().catch(() => null))?.link ?? null;
      // What the server now says is shown, also when it is not what was chosen.
      if (updated?.id === link.id) {
        await showChange(queryClient, LINKS_KEY, (data) => ({
          ...data,
          links: data.links.map((l) => (l.id === link.id ? { ...l, ...updated } : l)),
        }));
        await showAccessGiven(queryClient, { ...link, ...updated, kind: "record_link" });
      }
      const matches = updateMatchesChoice(link, updated, { sections, editSections, expiry });
      return { outcome: matches ? "saved" : "mismatch", linkId: link.id };
    },
    onSuccess,
    onError,
    onSettled: () => {
      onSettled?.();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: LINKS_KEY }),
        refreshWhoHasAccess(queryClient),
      ]);
    },
  });
}

export function useRevokeRecordLink({ onError } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId) => {
      const data = await revoke(linkId);
      await showRemoved(queryClient, linkId);
      await showAccessEnded(queryClient, "record_link", linkId);
      return data;
    },
    onError,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: LINKS_KEY }),
        refreshWhoHasAccess(queryClient),
      ]),
  });
}
