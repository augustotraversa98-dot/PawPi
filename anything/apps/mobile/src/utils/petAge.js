/**
 * The single source of truth for a pet's displayed age (Dog Profile, Dog
 * Social Profile, Vet Record). Model (docs/roadmap.md):
 *   - birthday known -> age is ALWAYS calculated live from it; any stored
 *     age_years/age_months estimate is ignored for display (never shown).
 *   - birthday unknown -> the stored age_years/age_months estimate is shown,
 *     marked approximate ("~2 years").
 *   - neither known -> null (callers render their own "not set" fallback).
 * If a birthday is added later, the old estimate is left in the database
 * untouched (harmless) but stops being read from this point on.
 */

import { parseDateValue } from "./canonicalDateTime";

/** Live years/months between a birth date and `now`. Never negative. */
function ageFromBirthDate(birthDate, now) {
  let years = now.getFullYear() - birthDate.getFullYear();
  let months = now.getMonth() - birthDate.getMonth();
  if (now.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  // A birthday in the future (bad/legacy data) never reads as a negative age.
  if (years < 0) return { years: 0, months: 0 };
  return { years, months };
}

function formatYearsMonths(years, months) {
  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (parts.length === 0) return "Under 1 month";
  return parts.join(", ");
}

/**
 * Returns the display string for a pet's age, or null when nothing is known
 * (callers fall back to their own "not set"/hidden treatment for null).
 * `pet` needs `birthday`, `age_years`, `age_months` — any extra fields are
 * ignored, so API responses can be passed straight through.
 */
export function getDisplayAge(pet, now = new Date()) {
  if (!pet) return null;

  const birthDate = parseDateValue(pet.birthday);
  if (birthDate) {
    const { years, months } = ageFromBirthDate(birthDate, now);
    return formatYearsMonths(years, months);
  }

  const years = pet.age_years != null ? Number(pet.age_years) : 0;
  const months = pet.age_months != null ? Number(pet.age_months) : 0;
  if (years > 0 || months > 0) {
    return `~${formatYearsMonths(years, months)}`;
  }

  return null;
}

/**
 * Same age model as getDisplayAge, but returns the structured parts so callers
 * can localize the units themselves ({years, months, approximate}) instead of
 * the English string. Returns null when nothing is known. Kept separate so
 * getDisplayAge (and its tests) stay byte-for-byte unchanged.
 */
export function getDisplayAgeParts(pet, now = new Date()) {
  if (!pet) return null;

  const birthDate = parseDateValue(pet.birthday);
  if (birthDate) {
    const { years, months } = ageFromBirthDate(birthDate, now);
    return { years, months, approximate: false };
  }

  const years = pet.age_years != null ? Number(pet.age_years) : 0;
  const months = pet.age_months != null ? Number(pet.age_months) : 0;
  if (years > 0 || months > 0) {
    return { years, months, approximate: true };
  }

  return null;
}
