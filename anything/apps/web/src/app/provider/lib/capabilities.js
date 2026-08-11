// Client-safe mirror of ALLOWED_CAPABILITIES (api/utils/providerAuth.js) with friendly
// labels for the extranet UI. The API util imports `sql`, so it can't be pulled into the
// browser bundle — this list is the client's source of truth for the capability editor and
// must stay in sync with the server's ALLOWED_CAPABILITIES (same convention as
// providerTypes.js mirroring the server's provider-type set). Ordered for display.
export const CAPABILITY_OPTIONS = [
  { value: "vet", label: "Vet clinic" },
  { value: "telehealth", label: "Telehealth" },
  { value: "groomer", label: "Grooming" },
  { value: "walker", label: "Dog walking" },
  { value: "sitter", label: "Pet sitting" },
  { value: "daycare", label: "Daycare / boarding" },
  { value: "trainer", label: "Training" },
  { value: "shop", label: "Products" },
  { value: "pharmacy", label: "Rx fulfillment" },
  { value: "adoption", label: "Adoption" },
  { value: "transport", label: "Transport" },
  { value: "insurance", label: "Insurance" },
];

// Human label for a stored capability value; falls back to the raw value.
export function capabilityLabel(value) {
  return CAPABILITY_OPTIONS.find((c) => c.value === value)?.label || value;
}
