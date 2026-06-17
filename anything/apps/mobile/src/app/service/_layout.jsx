import { Stack } from "expo-router";

// Shared SERVICE screens live in their OWN root-level stack (a sibling of the (tabs)
// navigator), NOT inside any single tab's stack. Phase 2 ticket 2.19 (More-tab nav fix).
//
// WHY: these screens (vet, grooming, walking, daycare, sitting, training, shop, adoption,
// provider, telehealth) are reached from MULTIPLE tabs — the Services grid, the consumer
// Training tab, the Feed suggestion cards, and the owner Hub. Previously they lived under
// (tabs)/more/, so pushing one from any other tab buried the More tab's root → tapping More
// showed a stale service screen ("More-tab corruption"). As a root-level group they present
// OVER the tab bar and belong to no tab's stack, so "back" returns to whichever tab opened
// them and the More root is never mutated. Internal navigation (e.g. a discovery screen →
// provider profile) stays within this stack.
export default function ServiceLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
