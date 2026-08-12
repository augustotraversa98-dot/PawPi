// Pure activation-checklist derivations (ticket 2.98). No storage, no network — every item's
// completion is DERIVED from data the app already has, so the "Getting started" card is never a
// stored flag: it reflects reality and disappears only when everything is genuinely done.

// The item keys, in display order. Copy lives in i18n under gettingStarted.items.<key>.
export const ACTIVATION_ITEMS = [
  "basics",
  "history",
  "reminder",
  "meal",
  "post",
  "notifications",
];

// "Complete your dog's history" — a small, sensible set of the medical/history profile fields
// (all present on the pet row): breed + an age (birthday OR age_years) + a real gender + a weight.
// `notes` is free-text and optional, so it doesn't gate completion.
export function isHistoryComplete(pet) {
  if (!pet) return false;
  const hasBreed = !!(pet.breed && String(pet.breed).trim());
  const hasAge = !!pet.birthday || pet.age_years != null;
  const hasGender = !!pet.gender && pet.gender !== "unknown";
  const hasWeight = pet.weight != null && pet.weight !== "";
  return hasBreed && hasAge && hasGender && hasWeight;
}

// "Add your dog's basics" — the onboarding minimum: a name AND a breed.
export function hasBasics(pet) {
  return !!(pet?.name && String(pet.name).trim() && pet?.breed && String(pet.breed).trim());
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
    basics: hasBasics(pet),
    history: isHistoryComplete(pet),
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
