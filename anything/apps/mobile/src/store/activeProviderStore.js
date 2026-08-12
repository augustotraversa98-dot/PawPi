import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─────────────────────────────────────────────
// ACTIVE PROVIDER STORE (business mode)
// Single source of truth for which business (provider) is active in Business
// home when the account is staff of more than one. Mirrors selectedPetStore:
// persists ONLY the provider id to AsyncStorage; the screen reads it and
// resolves it against the fetched providers list (useMyProviders), falling back
// to the first provider when the stored id is stale/absent.
// ─────────────────────────────────────────────

const useActiveProviderStore = create(
  persist(
    (set) => ({
      // The chosen provider's id (providers.id) or null when nothing is selected.
      activeProviderId: null,

      // True once the persisted value has been read back from AsyncStorage.
      hasHydrated: false,

      // Persist a selection (or null to clear). Kept as-is (ids may be int-like
      // strings coming from route params); the resolver compares with String().
      setActiveProviderId: (providerId) =>
        set({ activeProviderId: providerId == null ? null : providerId }),
    }),
    {
      name: "pawpi:activeProviderId",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ activeProviderId: state.activeProviderId }),
      onRehydrateStorage: () => () => {
        useActiveProviderStore.setState({ hasHydrated: true });
      },
    },
  ),
);

export default useActiveProviderStore;
