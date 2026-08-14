import React from "react";
import AppSettings from "@/components/Settings/AppSettings";

// Pet-owner settings route. The whole settings UI lives in the shared, route-agnostic
// AppSettings component (BX3) so business mode can present the SAME screen without entering
// the pet-owner (tabs) group. Reached from More → Settings; back returns to More.
export default function SettingsScreen() {
  return <AppSettings />;
}
