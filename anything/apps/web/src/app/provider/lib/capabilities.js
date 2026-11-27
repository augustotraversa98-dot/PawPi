import offerings from "../i18n/offerings";

// Client-safe mirror of ALLOWED_CAPABILITIES (api/utils/providerAuth.js) with friendly
// labels for the extranet UI. The API util imports `sql`, so it can't be pulled into the
// browser bundle — this list is the client's source of truth for the capability editor and
// must stay in sync with the server's ALLOWED_CAPABILITIES (same convention as
// providerTypes.js mirroring the server's provider-type set). Ordered for display.
const { capabilities: EN } = offerings.en;

// `label` is the English name, for screens not yet translated; translated screens use capabilityName(value, lang)
// from ../i18n/lib/labels.
export const CAPABILITY_OPTIONS = [
  "vet",
  "telehealth",
  "groomer",
  "walker",
  "sitter",
  "daycare",
  "trainer",
  "shop",
  "pharmacy",
  "adoption",
  "transport",
  "insurance",
].map((value) => ({ value, label: EN[value] }));

// Human label for a stored capability value; falls back to the raw value.
export function capabilityLabel(value) {
  return CAPABILITY_OPTIONS.find((c) => c.value === value)?.label || value;
}
