import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─────────────────────────────────────────────
// SELECTED PET STORE
// Single source of truth for the user's active-pet choice.
// Persists ONLY the integer pets.id to AsyncStorage under "pawpi:selectedPetId".
// The canonical useCurrentPet() hook (hooks/usePetProfile.js) reads selectedPetId
// from here and resolves it against the fetched pets list.
// ─────────────────────────────────────────────

const useSelectedPetStore = create(
  persist(
    (set) => ({
      // The chosen pet's id (pets.id, integer) or null when nothing is selected.
      selectedPetId: null,

      // True once the persisted value has been read back from AsyncStorage.
      // Consumers must wait for this before reconciling, otherwise the
      // pre-hydration `null` would clobber a previously stored selection.
      hasHydrated: false,

      // Persist a selection. Accepts a pet id (or null to clear); coerces to int.
      setSelectedPetId: (petId) =>
        set({ selectedPetId: petId == null ? null : Number(petId) }),
    }),
    {
      name: "pawpi:selectedPetId",
      storage: createJSONStorage(() => AsyncStorage),
      // Only the id is durable; never persist functions or derived flags.
      partialize: (state) => ({ selectedPetId: state.selectedPetId }),
      onRehydrateStorage: () => () => {
        useSelectedPetStore.setState({ hasHydrated: true });
      },
    },
  ),
);

export default useSelectedPetStore;
