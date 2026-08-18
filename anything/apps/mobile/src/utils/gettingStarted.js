// Pure activation-checklist derivations (ticket 2.98). No storage, no network — every item's
// completion is DERIVED from data the app already has, so the "Getting started" card is never a
// stored flag: it reflects reality and disappears only when everything is genuinely done.

// The item keys, in display order. Copy lives in i18n under gettingStarted.items.<key>.
export const ACTIVATION_ITEMS = [
  "profile",
  "reminder",
  "meal",
  "post",
  "notifications",
];

// "Set up your dog's profile" — the "basics" and "history" checklist items were merged into one:
// both routed to the same Dog Profile editor and both derived from the same pet-row bio fields, so
// completion is now the UNION of the old two: a name + a breed + an age (birthday OR age_years) + a
// real gender (≠ "unknown") + a weight. `notes` is free-text and optional, so it doesn't gate this.
export function isProfileComplete(pet) {
  if (!pet) return false;
  const hasName = !!(pet.name && String(pet.name).trim());
  const hasBreed = !!(pet.breed && String(pet.breed).trim());
  const hasAge = !!pet.birthday || pet.age_years != null;
  const hasGender = !!pet.gender && pet.gender !== "unknown";
  const hasWeight = pet.weight != null && pet.weight !== "";
  return hasName && hasBreed && hasAge && hasGender && hasWeight;
}

// Derive the whole checklist from real signals. Every input is a boolean the caller computed from
// existing reads (posts count, reminders count, food-log count, pet fields, OS permission).
// Returns { items:[{key,done}], completed, total, percent, isComplete }.
export function computeActivation({
  pet = null,
  hasReminder = false,
  hasMeal = false,
  hasPost = false,
  notificationsGranted = false,
} = {}) {
  const done = {
    profile: isProfileComplete(pet),
    reminder: !!hasReminder,
    meal: !!hasMeal,
    post: !!hasPost,
    notifications: !!notificationsGranted,
  };
  const items = ACTIVATION_ITEMS.map((key) => ({ key, done: done[key] }));
  const total = items.length;
  const completed = items.filter((i) => i.done).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { items, completed, total, percent, isComplete: completed === total };
}
