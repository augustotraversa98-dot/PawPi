// The known provider types. provider_type is free-text server-side, but the
// dashboard offers this fixed set (vet is the flagship; the dashboard is
// vet-first but the type is chosen at onboarding and editable in the profile).
// Shared so the onboarding form and the profile editor stay in sync.
export const PROVIDER_TYPES = [
  { value: "vet", label: "Veterinary clinic" },
  { value: "walker", label: "Dog walker" },
  { value: "daycare", label: "Daycare / boarding" },
  { value: "shop", label: "Pet shop" },
  { value: "groomer", label: "Groomer" },
];

// Human label for a stored provider_type; falls back to the raw value so a
// type outside the known set still renders something sensible.
export function providerTypeLabel(value) {
  return PROVIDER_TYPES.find((t) => t.value === value)?.label || value || "—";
}
