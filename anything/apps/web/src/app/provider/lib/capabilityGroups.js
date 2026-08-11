import { CAPABILITY_OPTIONS } from "./capabilities";

// Presentation-only grouping of the capability offerings into a few clear parent sections,
// shared by the Business Profile offering-picker and the provider onboarding form (ticket 2.89).
//
// IMPORTANT: this creates, renames, and removes NOTHING — it only maps EXISTING capability keys
// (the ones in CAPABILITY_OPTIONS / the server's ALLOWED_CAPABILITIES) to a display section +
// order. It is labels + grouping only, fully reversible. Keep in sync with CAPABILITY_OPTIONS.

const SECTION_ORDER = [
  "Veterinary & Health",
  "Walking & Sitting",
  "Training",
  "Store",
  "Adoption",
  "Other",
];

// Section each existing capability key belongs to. A key not listed here falls back to "Other",
// so a newly-added capability is never silently dropped from the picker.
const SECTION_BY_CAPABILITY = {
  vet: "Veterinary & Health",
  telehealth: "Veterinary & Health",
  groomer: "Veterinary & Health",
  pharmacy: "Veterinary & Health", // "Rx fulfillment" — a distinct existing key
  walker: "Walking & Sitting",
  sitter: "Walking & Sitting",
  daycare: "Walking & Sitting",
  trainer: "Training",
  shop: "Store",
  adoption: "Adoption",
  transport: "Other",
  insurance: "Other",
};

export function sectionForCapability(value) {
  return SECTION_BY_CAPABILITY[value] ?? "Other";
}

// Grouped view of CAPABILITY_OPTIONS: [{ section, options: [{ value, label }, ...] }], ordered by
// SECTION_ORDER and preserving CAPABILITY_OPTIONS order within each section. Empty sections are
// omitted. Every option in CAPABILITY_OPTIONS appears exactly once (nothing is dropped or added).
export function groupedCapabilityOptions() {
  const bySection = new Map();
  for (const opt of CAPABILITY_OPTIONS) {
    const section = sectionForCapability(opt.value);
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(opt);
  }
  const ordered = [];
  for (const section of SECTION_ORDER) {
    if (bySection.has(section)) {
      ordered.push({ section, options: bySection.get(section) });
      bySection.delete(section);
    }
  }
  // Any section not in SECTION_ORDER (shouldn't happen, but safe) is appended at the end.
  for (const [section, options] of bySection) ordered.push({ section, options });
  return ordered;
}

export { SECTION_ORDER, SECTION_BY_CAPABILITY };
