import React from "react";
import PetProfileScreen from "@/app/pet-profile";

// The bottom-right "Profile" tab (ticket 2.60) IS the active pet's social
// profile. We reuse the pet-profile screen in `embedded` mode: it falls back to
// the current pet (no route param) and swaps the back button for the ☰ burger
// (OwnerMenu), which still exposes every former More destination + the My Dogs
// switcher. Keeping this a stable tab-root component preserves the 2.19 nav fix
// + popToTopOnBlur.
export default function ProfileTab() {
  return <PetProfileScreen embedded />;
}
