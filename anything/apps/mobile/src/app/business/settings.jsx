import React from "react";
import AppSettings from "@/components/Settings/AppSettings";

// Business-mode settings route (BX3 + BX4). Renders the SAME shared app-settings UI as the
// pet-owner route, but stays INSIDE the business group — so its back arrow (router.back())
// returns to the business Profile instead of dropping the user into the pet-owner feed.
// Registered in business/_layout with { href: null } so it is a reachable route but NOT a
// visible tab. mode="business" swaps the pet-owner notification categories + Apple Health /
// walk-tracking block for the server-backed business notification categories (BX4).
export default function BusinessSettingsScreen() {
  return <AppSettings mode="business" />;
}
