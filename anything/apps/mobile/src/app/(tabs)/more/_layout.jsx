import { Stack } from "expo-router";

// Anchor the More stack on its `index` root. Without this, a DEEP push into the tab
// (e.g. the Feed "Getting started" card pushing straight to `profile-edit`) makes that
// sub-screen the BASE of the More stack instead of sitting above `index`. Back then
// leaves the tab, and the 2.19 `popToTopOnBlur` safety net pops to the (now wrong)
// base — trapping the Profile tab on a sub-screen. expo-router 6 reads
// `unstable_settings.initialRouteName` (a.k.a. `anchor`) to keep `index` at the base of
// the stack even on a deep link, which the react-navigation `initialRouteName` prop does
// NOT do. Mirrors the root layout's own `index` anchor.
export const unstable_settings = {
  initialRouteName: "index",
};

// The More tab's stack. It owns ONLY the genuinely More-scoped screens. The shared SERVICE
// screens (vet, grooming, walking, daycare, sitting, training, shop, adoption, provider,
// telehealth) were moved OUT to the root-level `service/` stack in ticket 2.19 — they are
// reached from multiple tabs, so keeping them here corrupted the More root on a cross-tab push.
export default function MoreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="hub" />
      <Stack.Screen name="community" />
      <Stack.Screen name="data-access" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="profile-edit" />
      <Stack.Screen name="reminders" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
