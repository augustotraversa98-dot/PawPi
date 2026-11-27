import { waitingOffers } from "@/utils/vetShare";

// Keeping the screens that say who can see a dog's record current (docs/vet-sharing-design.md "Keeping the screens
// current"). Every list that shows an access, or something waiting to become one:
export const SHARING_KEYS = [
  ["care-access-grants"],
  ["care-share-offers"],
  ["care-access-invites"],
  ["care-record-links"],
  ["provider-share-offers"],
  ["care-who-has-access"],
];

// The lists an answer given elsewhere can change.
const ANSWERED_KEYS = [...SHARING_KEYS.slice(0, 3), ["care-who-has-access"]];

const invalidate = (queryClient, keys, options) =>
  Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }, options)));

// Marks every sharing list as out of date; the ones on screen are read again at once.
export function refreshSharing(queryClient) {
  return invalidate(queryClient, SHARING_KEYS);
}

// The same for the lists that are waiting, leaving alone a read already on its way: it answers this turn too.
export function refreshWaiting(queryClient) {
  return invalidate(queryClient, ANSWERED_KEYS, { cancelRefetch: false });
}

// True while something already read is still waiting for an answer, which is usually given on another phone.
export function sharingIsWaiting(queryClient, now = Date.now()) {
  const read = (queryKey) =>
    queryClient
      .getQueriesData({ queryKey })
      .map(([, data]) => data)
      .filter(Boolean);
  return (
    read(["care-access-grants"]).some((data) => data.grants.some((g) => g.status === "pending")) ||
    read(["care-share-offers"]).some((data) => waitingOffers(data.offers, now).length > 0) ||
    read(["care-access-invites"]).some((invites) => invites.some((i) => i.status === "open"))
  );
}

// Writes a change the server has confirmed into a list already read, so the screen shows it in the same moment; the
// read that follows brings the rest. A read still on its way started before the change, so it is dropped.
export async function showChange(queryClient, queryKey, change) {
  await queryClient.cancelQueries({ queryKey });
  for (const [key, data] of queryClient.getQueriesData({ queryKey })) {
    if (data) queryClient.setQueryData(key, change(data, key));
  }
}
