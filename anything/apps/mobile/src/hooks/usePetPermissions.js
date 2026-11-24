import { useCallback, useMemo } from "react";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { canDo, roleOfPet, isSharedPet, ownerNameOfPet, ROLE_OWNER } from "@/utils/petPermissions";

// What the signed-in person may do with the ACTIVE pet, from their role on it (own pet → owner; shared → family / caregiver).
//   const { can, role, isShared, ownerName } = usePetPermissions();
//   {can("editRoutines") ? <AddRoutineButton /> : null}
// With NO pet resolved yet (list still loading, or the account has none) there is no role to restrict, so `can` answers yes: every control
// that acts on a pet is only rendered once there is one, the pets list is cached from launch, and the server is the authority
// anyway (it answers 403). Once a pet is resolved the answer is strict (an unknown role is "no", see petPermissions.canDo).
// The one definition of the rules is utils/petPermissions (mapped to the server); do not compare roles anywhere else.
export function usePetPermissions(petOverride) {
  const { data: currentPet, isLoading } = useCurrentPet();
  const pet = petOverride ?? currentPet;
  const role = roleOfPet(pet);
  const hasPet = !!pet;
  const can = useCallback((action) => (hasPet ? canDo(role, action) : true), [hasPet, role]);
  return useMemo(
    () => ({
      pet: pet ?? null,
      role,
      isOwner: role === ROLE_OWNER,
      isShared: isSharedPet(pet),
      ownerName: ownerNameOfPet(pet),
      isLoading: !petOverride && !!isLoading,
      can,
    }),
    [pet, role, can, isLoading, petOverride],
  );
}

export default usePetPermissions;
