// A directory listing nobody has claimed (providers.claim_status, 0124): bookings, orders and messages sent to it
// reach no one, and the server refuses them (409 provider_unclaimed). A payload without claim_status is not judged.
export function isUnclaimedListing(provider) {
  return provider?.claim_status != null && provider.claim_status !== "claimed";
}
