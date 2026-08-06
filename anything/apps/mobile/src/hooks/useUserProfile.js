import { useQuery } from "@tanstack/react-query";

// The signed-in owner's OWN user_profiles.id. GET /api/user-profile → { profile }. Needed where the
// client must recognize its own rows among a public list keyed by owner_user_id — e.g. finding "my
// review" on a place so the CTA becomes "Edit your review" and the modal prefills. Read-only; the
// endpoint lazily returns (or creates) the caller's profile, so id is always present once authed.
export function useMyProfileId() {
  return useQuery({
    queryKey: ["user-profile", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/user-profile`);
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      return data.profile?.id ?? null;
    },
  });
}
