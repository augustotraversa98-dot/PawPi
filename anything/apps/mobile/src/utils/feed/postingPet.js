// Which dog the Feed's "post today's moment" buttons post FOR (night run #6, item 3).
//
// The Feed's active dog is pets[0]. Normally that is the dog the person posts for. But a CAREGIVER on a shared dog cannot post its
// moments (server: POST /api/posts → 403; petPermissions → postMoment), and the lock only opens once someone in the household has
// posted today. If that same person ALSO owns a dog, posting for their own dog is allowed by the server AND unlocks the Feed
// (api/utils/dailyMomentsGate.js: a daily moment today on any pet they own or hold an active grant on, or one they authored). So the
// Feed should offer the post button and post for the OWN dog instead of telling them to wait.
//
// Deliberately narrow: only a dog the person OWNS qualifies as the fallback (never "family on another dog"), so nothing beyond the
// documented rule is offered. Roles are decided in petPermissions only (a guard test greps for ad-hoc role checks).

import { canDoOnPet, isSharedPet } from "@/utils/petPermissions";

/**
 * @param {object|null} activePet the Feed's active dog (pets[0])
 * @param {object[]|null} pets    GET /api/pets?include_shared=1 (owned dogs first, then dogs shared with the person)
 * @returns {object|null} the dog to post for, or null when the person cannot post a moment at all (caregiver with no dog of their own)
 */
export function pickPostingPet(activePet, pets) {
  if (!activePet) return null;
  if (canDoOnPet(activePet, "postMoment")) return activePet;
  const list = Array.isArray(pets) ? pets : [];
  return list.find((p) => p?.id != null && !isSharedPet(p) && canDoOnPet(p, "postMoment")) ?? null;
}
