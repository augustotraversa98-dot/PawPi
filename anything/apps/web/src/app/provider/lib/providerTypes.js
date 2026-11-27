import offerings from "../i18n/offerings";

// The known provider types. provider_type is free-text server-side, but the
// dashboard offers this fixed set (vet is the flagship; the dashboard is
// vet-first but the type is chosen at onboarding and editable in the profile).
// Shared so the onboarding form and the profile editor stay in sync.
const { providerTypes: EN } = offerings.en;

// `label` is the English name, for screens not yet translated; translated screens use
// providerTypeOption(value, lang) from ../i18n/lib/labels.
export const PROVIDER_TYPES = ["vet", "walker", "daycare", "shop", "groomer"].map(
  (value) => ({ value, label: EN[value] }),
);

// Human label for a stored provider_type; falls back to the raw value so a
// type outside the known set still renders something sensible.
export function providerTypeLabel(value) {
  return PROVIDER_TYPES.find((t) => t.value === value)?.label || value || "—";
}
