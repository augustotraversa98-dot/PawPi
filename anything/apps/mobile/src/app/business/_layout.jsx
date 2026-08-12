import { Stack } from "expo-router";

// Business mode stack (business daily moments). A root-level stack for provider/business accounts —
// distinct from the pet-owner (tabs). The post-login gate (app/index.jsx → determinePetsRoute)
// routes a staff-only account here instead of pet onboarding; a both-owner-AND-staff account reaches
// it from the More menu. Management (services/products/hours/applications/adoption) stays on web.
export default function BusinessLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
