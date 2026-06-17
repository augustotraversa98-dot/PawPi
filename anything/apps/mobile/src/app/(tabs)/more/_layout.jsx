import { Stack } from "expo-router";

export default function MoreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="hub" />
      <Stack.Screen name="community" />
      <Stack.Screen name="vet" />
      <Stack.Screen name="grooming" />
      <Stack.Screen name="walking" />
      <Stack.Screen name="sitting" />
      <Stack.Screen name="shop" />
      <Stack.Screen name="adoption" />
      <Stack.Screen name="provider" />
      <Stack.Screen name="data-access" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
