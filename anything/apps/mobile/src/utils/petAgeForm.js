/**
 * What the profile forms send for the age (onboarding, Edit Pet Profile, the medical profile).
 * The form keeps `birthdayUnknown` (the owner chose "I don't know the exact date"), `birthday`, and the estimate
 * as typed (`ageYears`, `ageMonths`).
 */

import { parseWholeNumber } from "./decimal";

const toNumber = (text) => (text ? parseInt(text, 10) : null);

/** An estimate typed as something other than whole numbers ("1,5"): the form refuses it instead of cutting it. */
export function hasInvalidAge(form) {
  if (!form.birthdayUnknown) return false;
  return [form.ageYears, form.ageMonths].some((text) => parseWholeNumber(text).invalid);
}

/**
 * Seed the age part of an edit form from a pet. A pet with a birthday starts with an empty estimate; otherwise
 * the estimate shows the age the server sent.
 */
export function ageFormFromPet(pet) {
  const birthdayUnknown = !pet?.birthday;
  return {
    birthdayUnknown,
    ageYears: birthdayUnknown ? (pet?.age_years?.toString() ?? "") : "",
    ageMonths: birthdayUnknown ? (pet?.age_months?.toString() ?? "") : "",
  };
}

/**
 * The estimate to include in a save, or null to leave it out. It is sent only when the owner switched to the
 * estimate or typed a different one, so an untouched age keeps the date it was first given.
 */
export function estimateToSave(form, seeded) {
  if (!form.birthdayUnknown) return null;
  const untouched =
    seeded?.birthdayUnknown &&
    form.ageYears === seeded.ageYears &&
    form.ageMonths === seeded.ageMonths;
  if (untouched) return null;
  return { years: toNumber(form.ageYears), months: toNumber(form.ageMonths) };
}

/** Whether the server that sent this pet can keep an estimate growing (it has the estimate fields). */
export function petKeepsEstimates(pet) {
  return !!pet && "age_estimate_months" in pet;
}
