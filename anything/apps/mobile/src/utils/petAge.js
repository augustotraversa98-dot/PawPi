/**
 * The single source of truth for a pet's displayed age in the app. The web server (app/api/utils/petAge.js) and
 * the database (app_pet_age, migration 0156) follow the same rule, and all three run
 * web/test/fixtures/petAgeVectors.json. Precedence:
 *   - birthday known            -> calculated live from it, exact;
 *   - estimate with its date    -> age_estimate_months + whole months since age_estimated_on, approximate
 *                                  ("~2 years"), so it grows over time;
 *   - stored age_years / months -> shown unchanged, approximate;
 *   - nothing known             -> null (callers render their own "not set" fallback).
 * Someone else's estimated pet arrives without the estimate's date, with `age_is_estimate: true` and the
 * computed age in age_years / age_months.
 */

import { parseDateValue } from "./canonicalDateTime";

/** Whole months between two local calendar dates. Never negative. */
function wholeMonthsBetween(from, to) {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) -
    (to.getDate() < from.getDate() ? 1 : 0);
  return Math.max(months, 0);
}

const split = (total) => ({ years: Math.floor(total / 12), months: total % 12 });

function formatYearsMonths(years, months) {
  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (parts.length === 0) return "Under 1 month";
  return parts.join(", ");
}

/**
 * {years, months, approximate}, or null when nothing is known. `pet` is an API
 * response (or form values shaped like one) — extra fields are ignored.
 */
export function getDisplayAgeParts(pet, now = new Date()) {
  if (!pet) return null;

  const birthDate = parseDateValue(pet.birthday);
  if (birthDate) {
    return { ...split(wholeMonthsBetween(birthDate, now)), approximate: false };
  }

  const estimate = pet.age_estimate_months;
  const estimatedOn = parseDateValue(pet.age_estimated_on);
  if (estimate != null && estimate !== "" && Number(estimate) >= 0 && estimatedOn) {
    const total = Number(estimate) + wholeMonthsBetween(estimatedOn, now);
    return { ...split(total), approximate: true };
  }

  const years = pet.age_years != null ? Number(pet.age_years) : 0;
  const months = pet.age_months != null ? Number(pet.age_months) : 0;
  // An estimate of under a month is still a known age.
  const knownZero = !!pet.age_is_estimate && (pet.age_years != null || pet.age_months != null);
  if (years > 0 || months > 0 || knownZero) {
    return { years, months, approximate: true };
  }

  return null;
}

/** getDisplayAgeParts as an English string, or null. */
export function getDisplayAge(pet, now = new Date()) {
  const parts = getDisplayAgeParts(pet, now);
  if (!parts) return null;
  const text = formatYearsMonths(parts.years, parts.months);
  return parts.approximate ? `~${text}` : text;
}

/** The localized string for getDisplayAgeParts ("2 años", "1 año, 3 meses", "~6 meses"), or null. */
export function formatPetAge(parts, t) {
  if (!parts) return null;
  const segs = [];
  if (parts.years > 0)
    segs.push(`${parts.years} ${t(parts.years === 1 ? "petProfile.ageYear" : "petProfile.ageYears")}`);
  if (parts.months > 0)
    segs.push(`${parts.months} ${t(parts.months === 1 ? "petProfile.ageMonth" : "petProfile.ageMonths")}`);
  const s = segs.length ? segs.join(", ") : t("petProfile.ageUnderMonth");
  return parts.approximate ? `~${s}` : s;
}
