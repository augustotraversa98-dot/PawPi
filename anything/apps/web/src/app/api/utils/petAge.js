// A pet's age, the one way the web server computes it (migration 0156). The app has the same rule in
// mobile/src/utils/petAge.js and the database in app_pet_age(); all three run test/fixtures/petAgeVectors.json.
//
// Precedence:
//   1. exact birthday (pets.birthday)            → computed, exact;
//   2. estimate with the date it was given       → pets.age_estimate_months + pets.age_estimated_on, grows from
//      that date, approximate. It counts only while it still matches pets.age_years / age_months: a writer that
//      changes the stored age without knowing about the estimate replaces it;
//   3. stored age_years / age_months             → unchanged, approximate.
//
// Responses carry the computed value in age_years / age_months (older app builds read those), and an app that
// sends the same value back is not a change (see planAgeUpdate). A database without 0156 has no estimate
// columns: the stored age is then the estimate and nothing grows.

export const AGE_TIME_ZONE = "America/Argentina/Buenos_Aires";

const MAX_ESTIMATE_MONTHS = 1200;
// How many days back a value the app sends is still recognised as the one it was given (a screen left open
// while a month completed).
const ECHO_DAYS = 3;

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: AGE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date, "YYYY-MM-DD". */
export function todayForAge(now = new Date()) {
  return dayFormat.format(now);
}

/**
 * A DATE value as "YYYY-MM-DD", or null. The calendar date is taken as written (a Date from the database is
 * midnight UTC), never shifted by a time zone. The 1969-12-31 / 1970-01-01 placeholders are no date.
 */
export function toDateString(value) {
  let text = null;
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) text = value.toISOString().slice(0, 10);
  } else if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value.trim());
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const check = new Date(Date.UTC(y, mo - 1, d));
      if (check.getUTCMonth() === mo - 1 && check.getUTCDate() === d) text = `${m[1]}-${m[2]}-${m[3]}`;
    }
  }
  return text === "1969-12-31" || text === "1970-01-01" ? null : text;
}

/** Whole months from one "YYYY-MM-DD" to another; never negative. */
export function wholeMonthsBetween(from, to) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(months, 0);
}

function shiftDays(day, days) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A whole number of years or months from a request or a row, or null. */
export function toAgeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const storedTotal = (row) => (toAgeNumber(row.age_years) ?? 0) * 12 + (toAgeNumber(row.age_months) ?? 0);

/** The row's estimate { months, on }, or null when there is none or the stored age no longer matches it. */
function liveEstimate(row) {
  const months = toAgeNumber(row.age_estimate_months);
  const on = toDateString(row.age_estimated_on);
  if (months === null || on === null) return null;
  const hasStored = row.age_years != null || row.age_months != null;
  return hasStored && storedTotal(row) === months ? { months, on } : null;
}

const split = (total) => ({ years: Math.floor(total / 12), months: total % 12 });

function resolveAge(row, today) {
  const birthday = toDateString(row.birthday);
  if (birthday) {
    return { basis: "birthday", ...split(wholeMonthsBetween(birthday, today)) };
  }
  const estimate = liveEstimate(row);
  if (estimate) {
    return { basis: "estimate", ...split(estimate.months + wholeMonthsBetween(estimate.on, today)) };
  }
  return { basis: "stored" };
}

/** { years, months, approximate } for a stored pets row, or null when no age is known. */
export function computePetAge(row, today = todayForAge()) {
  if (!row) return null;
  const age = resolveAge(row, today);
  if (age.basis !== "stored") {
    return { years: age.years, months: age.months, approximate: age.basis === "estimate" };
  }
  const years = toAgeNumber(row.age_years) ?? 0;
  const months = toAgeNumber(row.age_months) ?? 0;
  return years > 0 || months > 0 ? { years, months, approximate: true } : null;
}

const ESTIMATE_COLUMNS = ["age_estimate_months", "age_estimated_on"];

/** True when this row was read from a database that has the estimate columns (0156). */
export const hasEstimateColumns = (row) => !!row && "age_estimate_months" in row;

/**
 * The estimate columns of a whole row read as JSON (`to_jsonb(p)`), for queries that name their columns and
 * must also run without 0156. {} when the database has no such columns.
 */
export function estimateColumnsOf(rowJson) {
  if (!hasEstimateColumns(rowJson)) return {};
  return Object.fromEntries(ESTIMATE_COLUMNS.map((c) => [c, rowJson[c] ?? null]));
}

/**
 * A pet row as its owner (or someone it is shared with) receives it: age_years / age_months hold the age as of
 * today. The estimate columns stay (null unless the estimate counts) so the app can compute the same value.
 * A pet with only a stored age is returned as it is.
 */
export function presentPet(row, today = todayForAge()) {
  if (!row) return row;
  const age = resolveAge(row, today);
  const out = { ...row };
  if (age.basis !== "stored") {
    out.age_years = age.years;
    out.age_months = age.months;
  }
  if (age.basis !== "estimate" && hasEstimateColumns(row)) {
    out.age_estimate_months = null;
    out.age_estimated_on = null;
  }
  return out;
}

/**
 * A pet row as someone else sees it: the computed age only, without the estimate columns.
 * `age_is_estimate: true` (only on such a pet) tells the app to mark it approximate.
 */
export function presentPublicPet(row, today = todayForAge()) {
  if (!row) return row;
  const out = presentPet(row, today);
  const estimated = out.age_estimate_months != null;
  for (const column of ESTIMATE_COLUMNS) delete out[column];
  if (estimated) out.age_is_estimate = true;
  return out;
}

// Whether the values sent are the ones the app was given (today or in the last few days), not a change.
function isUnchangedAge(row, sent, today) {
  const estimated = resolveAge(row, today).basis === "estimate";
  for (let back = 0; back <= (estimated ? ECHO_DAYS : 0); back += 1) {
    const shown = presentPet(row, shiftDays(today, -back));
    const shownEmpty = shown.age_years == null && shown.age_months == null;
    const sentEmpty = sent.age_years === null && sent.age_months === null;
    if (shownEmpty || sentEmpty) {
      if (shownEmpty && sentEmpty) return true;
      continue;
    }
    if ((shown.age_years ?? 0) === (sent.age_years ?? 0) && (shown.age_months ?? 0) === (sent.age_months ?? 0)) {
      return true;
    }
  }
  return false;
}

/** The estimate to store for an age given today, as column values (both null when there is none to store). */
export function estimateFor({ age_years, age_months }, today = todayForAge()) {
  const total = (age_years ?? 0) * 12 + (age_months ?? 0);
  const given = (age_years != null || age_months != null) && total <= MAX_ESTIMATE_MONTHS;
  return {
    age_estimate_months: given ? total : null,
    age_estimated_on: given ? today : null,
  };
}

/**
 * The age-related columns to write when an existing pet is edited.
 *   row   — the stored pets row (SELECT *);
 *   input — { birthday, age_years, age_months } from the request; undefined = not sent.
 * Returns an object of column → value (birthday included when sent). Only the listed columns are written.
 *
 * On a database with 0156:
 *   • a new or changed birthday clears the stored age and the estimate;
 *   • while a birthday is set, a sent age is ignored;
 *   • clearing the birthday without an age clears the age and the estimate;
 *   • an age equal to the one the app was given changes nothing;
 *   • any other age is a new estimate given today.
 * Without 0156 the sent values are written as they are.
 */
export function planAgeUpdate(row, input, today = todayForAge()) {
  const writes = {};
  const sentBirthday = input.birthday === undefined ? undefined : input.birthday || null;
  if (sentBirthday !== undefined) writes.birthday = sentBirthday;

  if (!hasEstimateColumns(row)) {
    if (input.age_years !== undefined) writes.age_years = input.age_years;
    if (input.age_months !== undefined) writes.age_months = input.age_months;
    return writes;
  }

  const before = toDateString(row.birthday);
  // A value the database accepts but that is not "YYYY-MM-DD" still counts as a birthday.
  const after =
    sentBirthday === undefined
      ? before
      : sentBirthday && (toDateString(sentBirthday) ?? String(sentBirthday));
  const cleared = { age_years: null, age_months: null, age_estimate_months: null, age_estimated_on: null };

  if (after) {
    return after === before ? writes : { ...writes, ...cleared };
  }

  const birthdayRemoved = before !== null;
  if (input.age_years === undefined && input.age_months === undefined) {
    return birthdayRemoved ? { ...writes, ...cleared } : writes;
  }

  const shown = presentPet(row, today);
  const sent = {
    age_years: toAgeNumber(input.age_years === undefined ? shown.age_years : input.age_years),
    age_months: toAgeNumber(input.age_months === undefined ? shown.age_months : input.age_months),
  };
  if (!birthdayRemoved && isUnchangedAge(row, sent, today)) return writes;
  return { ...writes, ...sent, ...estimateFor(sent, today) };
}
