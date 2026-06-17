import { Stack } from "expo-router";

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
      <Stack.Screen name="settings" />
    </Stack>
  );
}
