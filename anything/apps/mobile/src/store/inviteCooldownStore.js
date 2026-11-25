import { create } from "zustand";

// When each pending invite may be resent again (grant id → epoch ms). In memory only: the server enforces the real
// limits (one resend per hour, five per invite); this just keeps the button honest while the app is open.
const useInviteCooldownStore = create((set) => ({
  until: {},
  startCooldown: (grantId, ms) =>
    set((state) => ({ until: { ...state.until, [grantId]: Date.now() + ms } })),
  reset: () => set({ until: {} }),
}));

export default useInviteCooldownStore;
