import { create } from "zustand";
import { persist } from "zustand/middleware";

// Which provider the staff user is currently acting as, when they belong to more
// than one. Persisted to localStorage so the choice survives reloads. The shell
// always validates the stored id against the live GET /api/providers list before
// trusting it (a stale id — e.g. staff was removed — falls back to the first
// provider), so a bad persisted value can never strand the dashboard.
//
// DECISION (documented for c2+): provider context is held in this store, NOT in a
// URL segment. Keeps the route tree flat (one /provider/bookings page) and makes
// the switcher a pure state update. If deep-linkable per-provider URLs are needed
// later, add a [providerId] segment and seed this store from the param.
export const useProviderSelection = create(
  persist(
    (set) => ({
      selectedProviderId: null,
      setSelectedProviderId: (id) => set({ selectedProviderId: id }),
    }),
    { name: "pawpi:provider:selectedId" },
  ),
);
