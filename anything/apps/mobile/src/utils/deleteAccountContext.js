// What the delete-account confirmation needs to know about the person, taken ONLY from data the app already reads
// (App Store 5.1.1(v) wording, docs/delete-account-contributions-options.md, OPTION B):
//
//   • isMember        — the person holds an active grant on at least one dog that is NOT their own (GET /api/pets?include_shared=1 →
//                       is_shared / access_role, PR5a). Only then is the "also delete my posts" switch shown.
//   • sharedDogNames  — names of the dogs the person OWNS that are shared with other people (an active, unexpired grant on
//                       GET /api/pet-caregivers?petId=). Only then is the owner sentence shown. Real names only, never invented.
//
// If the app cannot tell (the pets list failed to load) it does NOT guess: isMember stays false (switch hidden) and the
// deletion itself is still possible. A person who WAS a member but no longer is one cannot be recognised from the list (revoked / left
// grants are not returned), so for them the switch is hidden too — see the PR notes.
//
// Deliberately NOT built on react-query hooks: the settings screen renders without a QueryClientProvider in tests, and this runs only
// when the person taps "Delete account" (never on app return).

import { PETS_LIST_URL } from "@/utils/launchQueries";
// Roles are decided in petPermissions only (guard test): this file never reads access_role itself.
import { roleOfPet, isSharedPet, ROLE_OWNER } from "@/utils/petPermissions";

/** True when the list holds at least one dog that someone else owns and this person has access to. */
export function isMemberOfSharedDog(pets) {
  if (!Array.isArray(pets)) return false;
  return pets.some((p) => p?.is_shared === true && isSharedPet(p));
}

/** The dogs this person owns (never the shared ones). Needs the opt-in list: without the flags nothing is owned for sure. */
export function ownedDogs(pets) {
  if (!Array.isArray(pets)) return [];
  return pets.filter((p) => p?.is_shared === false && roleOfPet(p) === ROLE_OWNER && p?.id != null);
}

/** Does this grants list (GET /api/pet-caregivers?petId=) contain someone who currently has the dog? Pending invites have added nothing. */
export function hasActiveMember(grants) {
  if (!Array.isArray(grants)) return false;
  return grants.some((g) => g?.status === "active" && g?.is_expired !== true);
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Loads what the confirmation needs. Never throws: any failure degrades to "unknown" (switch hidden, no owner sentence).
 * @returns {Promise<{ isMember: boolean, sharedDogNames: string[], known: boolean }>}
 */
export async function loadDeleteAccountContext() {
  let pets;
  try {
    const res = await fetch(PETS_LIST_URL);
    if (!res.ok) return { isMember: false, sharedDogNames: [], known: false };
    const data = await readJson(res);
    pets = data?.pets;
  } catch {
    return { isMember: false, sharedDogNames: [], known: false };
  }
  if (!Array.isArray(pets)) return { isMember: false, sharedDogNames: [], known: false };

  const owned = ownedDogs(pets);
  const checks = await Promise.all(
    owned.map(async (pet) => {
      try {
        const res = await fetch(`/api/pet-caregivers?petId=${encodeURIComponent(pet.id)}`);
        if (!res.ok) return null;
        const data = await readJson(res);
        return hasActiveMember(data?.grants) ? String(pet.name ?? "").trim() : null;
      } catch {
        return null;
      }
    }),
  );
  // A dog without a usable name is left out of the sentence rather than shown as a blank or an invented name.
  const sharedDogNames = checks.filter((n) => typeof n === "string" && n.length > 0);
  return { isMember: isMemberOfSharedDog(pets), sharedDogNames, known: true };
}

/** The request the app sends. OFF is exactly what shipped before (no query string); ON adds delete_contributions=1. */
export function accountDeletionRequest(deleteContributions) {
  return deleteContributions
    ? { url: "/api/account?delete_contributions=1", init: { method: "DELETE" } }
    : { url: "/api/account", init: { method: "DELETE" } };
}

/** "Rex", "Rex and Luna", "Rex, Luna and Mia" — `andWord` comes from i18n ("and" / "y"). */
export function joinNames(names, andWord) {
  if (!Array.isArray(names) || names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ${andWord} ${names[names.length - 1]}`;
}
