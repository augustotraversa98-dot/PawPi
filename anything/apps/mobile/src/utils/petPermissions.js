// petPermissions — the ONE place the app decides what a person may do with a pet, by their role on it.
//
// Roles come from the server (GET /api/pets?include_shared=1 → `access_role`):
//   owner      the pet's owner                                     (also every pet from an old server that sends no role)
//   family     co-owner: reads + writes everything EXCEPT managing sharing and deleting the pet
//   caregiver  read + log / complete only; no vaccines, no appointments, no routine / profile / vet-record edits
//
// This table is mapped 1:1 to the server (docs/family-sharing-audit-2026-11.md §3 and the 2026-11-23 roadmap entries PR3 / PR3b);
// the server stays the authority (it answers 403 anyway) — this only keeps the UI from offering what the server will refuse.
// Every gate in the app goes through canDo()/usePetPermissions(); do not add `role === "..."` checks elsewhere (a test greps for it).
//
// Column: owner / family / caregiver. `server:` = the route or policy that enforces it.

export const ROLE_OWNER = "owner";
export const ROLE_FAMILY = "family";
export const ROLE_CAREGIVER = "caregiver";
export const PET_ROLES = [ROLE_OWNER, ROLE_FAMILY, ROLE_CAREGIVER];

const O = [ROLE_OWNER];
const OF = [ROLE_OWNER, ROLE_FAMILY];
const ALL = [ROLE_OWNER, ROLE_FAMILY, ROLE_CAREGIVER];

export const PET_ACTIONS = {
  // ---- everyone with access: read + the day-to-day log ----
  viewPet: ALL, //                      server: GET /api/pets/[id] (owner + any active grantee)
  viewHealthLogs: ALL, //               server: health GETs anchored to the pet's owner (PR3)
  logHealth: ALL, //                    server: resolvePetLogOwner allowCaregiver (walk/food/weight/pee/poo/vomit/wellness/general/photo/medical-care)
  completeReminder: ALL, //             server: logs / completes are append-only for a caregiver (0139)
  viewRoutines: ALL, //                 server: GET /api/routines (owner + family + caregiver)
  viewMedicalProfile: ALL, //           server: GET /api/pet-medical-profiles
  viewMedications: ALL, //              server: meds + preventive reads
  viewEmergencyCard: ALL, //            server: read-only for a grantee (no tag token, no contacts, no share links)
  viewAllergiesConditions: ALL, //      server: allergies / conditions reads (PR3)

  // ---- owner + family (co-owner): the writes (PR3b) ----
  editPetProfile: OF, //                server: PATCH /api/pets/[id]
  editRoutines: OF, //                  server: PUT/POST/DELETE /api/routines
  editMedicalProfile: OF, //            server: PUT /api/pet-medical-profiles
  editMedications: OF, //               server: medications + preventive-treatments writes
  viewVaccinations: OF, //              server: caregiver sees none (closed to caregivers)
  editVaccinations: OF, //              server: pet-vaccinations (caregiver: 403 vaccine_family_only on the recorded-as-given path)
  viewAppointments: OF, //              server: vet-appointments (closed to caregivers)
  editAppointments: OF, //              server: vet-appointments writes
  viewVetRecord: OF, //                 server: vet documents / labs / surgeries / notes closed to caregivers
  addVetRecord: OF, //                  server: vet-record POST (attributed "editor")
  postMoment: OF, //                    server: a family member may post the DAILY MOMENT; a caregiver may not post (403)
  useMedia: OF, //                      server: private media + upload (denied to a caregiver)

  // ---- owner only ----
  deleteVetRecord: O, //                server: vet-record DELETE filters owner_user_id = caller
  editEmergencyCard: O, //              server: POST/PUT emergency card + share links
  manageSharing: O, //                  server: invite / revoke / resend
  deletePet: O, //                      server: no route today; owner only by design

  // ---- members only (not the owner): leave the household ----
  leaveSharing: [ROLE_FAMILY, ROLE_CAREGIVER], // server: POST /api/pet-caregivers/[id]/leave (grantee only)
};

/** The role to apply to a pet from GET /api/pets. An old server (or the default list) sends none: that list is owned pets only. */
export function roleOfPet(pet) {
  if (!pet) return null;
  const role = pet.access_role;
  if (PET_ROLES.includes(role)) return role;
  // A shared pet with a role we do not know is treated as the MOST restricted one (never an owner's controls by accident).
  if (pet.is_shared) return ROLE_CAREGIVER;
  return ROLE_OWNER;
}

/** Can `role` do `action`? An unknown role or action is always "no" (fail closed). */
export function canDo(role, action) {
  const allowed = PET_ACTIONS[action];
  if (!allowed || !role) return false;
  return allowed.includes(role);
}

/** Convenience: canDo for a pet object. */
export function canDoOnPet(pet, action) {
  return canDo(roleOfPet(pet), action);
}

/**
 * canDoOnPet, except that with NO pet resolved yet (list loading / none) it answers yes: there is no role to restrict, every control that acts
 * on a pet only renders once there is one, and the server is the authority anyway. Once a pet is known the answer is strict.
 */
export function canDoOnPetOrUnknown(pet, action) {
  return pet ? canDoOnPet(pet, action) : true;
}

export const isSharedPet = (pet) => !!pet && (pet.is_shared === true || (roleOfPet(pet) !== ROLE_OWNER));

/** The owner's name for a shared pet ("Sam"), or null. Only the public display name — never an e-mail or handle-as-name. */
export function ownerNameOfPet(pet) {
  const n = pet?.owner_display?.full_name;
  return typeof n === "string" && n.trim() ? n.trim() : null;
}
