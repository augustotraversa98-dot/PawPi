import offerings from "../i18n/offerings";
import { CAPABILITY_OPTIONS } from "./capabilities";

// Presentation-only grouping of the capability offerings into a few clear parent sections,
// shared by the Business Profile offering-picker and the provider onboarding form (ticket 2.89).
//
// IMPORTANT: this creates, renames, and removes NOTHING — it only maps EXISTING capability keys
// (the ones in CAPABILITY_OPTIONS / the server's ALLOWED_CAPABILITIES) to a display section +
// order. It is labels + grouping only, fully reversible. Keep in sync with CAPABILITY_OPTIONS.

// A section is identified by its English name; translated screens show sectionName(section, lang)
// from ../i18n/lib/labels.
const S = offerings.en.sections;

const SECTION_ORDER = [S.health, S.walking, S.training, S.store, S.adoption, S.other];

// Section each existing capability key belongs to. A key not listed here falls back to "Other",
// so a newly-added capability is never silently dropped from the picker.
const SECTION_BY_CAPABILITY = {
  vet: S.health,
  telehealth: S.health,
  groomer: S.health,
  pharmacy: S.health, // "Rx fulfillment" — a distinct existing key
  walker: S.walking,
  sitter: S.walking,
  daycare: S.walking,
  trainer: S.training,
  shop: S.store,
  adoption: S.adoption,
  transport: S.other,
  insurance: S.other,
};

export function sectionForCapability(value) {
  return SECTION_BY_CAPABILITY[value] ?? S.other;
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
