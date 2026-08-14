// E15 — life-stage detection + ring-goal descriptors (pure, behavioral, never diagnostic).
//
// Derive puppy / adult / senior from age (birthday preferred) and SIZE (weight as a proxy — larger dogs
// age faster, so they cross into "senior" earlier). Conservative defaults. The detected stage is only a
// gentle personalisation of the ring's COPY / suggested actions — the ring keeps its THREE closeable
// segments, and a senior is never judged against a puppy's bar. The owner can override the result.

const STAGES = ["puppy", "adult", "senior"];

// Senior threshold (years) by size bucket (kg): larger dogs age faster. Conservative. Unknown size →
// a medium-ish default.
const SENIOR_BY_SIZE = { small: 11, medium: 8, large: 7, giant: 6, unknown: 9 };

function toKg(weight, unit) {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return null;
  return String(unit || "").toLowerCase().startsWith("lb") ? w * 0.453592 : w;
}

function sizeBucket(weight, unit) {
  const kg = toKg(weight, unit);
  if (kg == null) return "unknown";
  if (kg < 10) return "small";
  if (kg < 25) return "medium";
  if (kg < 40) return "large";
  return "giant";
}

// Age in whole+fractional years, from birthday (preferred) else age_years/age_months. null if unknown.
export function ageInYears({ birthday, ageYears, ageMonths, today }) {
  if (birthday && today) {
    const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthday).slice(0, 10));
    const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(today).slice(0, 10));
    if (b && t) {
      const days = (Date.UTC(+t[1], +t[2] - 1, +t[3]) - Date.UTC(+b[1], +b[2] - 1, +b[3])) / 86400000;
      if (days >= 0) return days / 365.25;
    }
  }
  // Treat null/undefined/"" as ABSENT (Number(null) is 0, which would falsely read as a 0-year-old).
  const hasY = ageYears != null && ageYears !== "" && Number.isFinite(Number(ageYears));
  const hasM = ageMonths != null && ageMonths !== "" && Number.isFinite(Number(ageMonths));
  if (hasY || hasM) {
    return (hasY ? Number(ageYears) : 0) + (hasM ? Number(ageMonths) : 0) / 12;
  }
  return null;
}

/**
 * Detect the life stage. puppy < 1yr; senior at the size-scaled threshold; adult in between. When age
 * is unknown, default to 'adult' (the neutral, current behaviour) — never guess senior/puppy blindly.
 */
export function detectLifeStage({ birthday, ageYears, ageMonths, weight, weightUnit, today } = {}) {
  const age = ageInYears({ birthday, ageYears, ageMonths, today });
  if (age == null) return "adult"; // conservative neutral default
  if (age < 1) return "puppy";
  const seniorAt = SENIOR_BY_SIZE[sizeBucket(weight, weightUnit)];
  return age >= seniorAt ? "senior" : "adult";
}

/** The effective stage = a valid owner override, else the detected stage. */
export function effectiveLifeStage(override, detected) {
  return STAGES.includes(override) ? override : detected;
}

/**
 * Ring-goal descriptor for a stage — the client maps these keys to localized copy. The three segments
 * (walk / moment / care) are UNCHANGED; this only tunes emphasis + suggested actions.
 */
export function ringGoalsForStage(stage) {
  const s = STAGES.includes(stage) ? stage : "adult";
  return { stage: s, copy_key: `lifeStage.${s}`, segments: ["walk", "moment", "care"] };
}

export const LIFE_STAGES = STAGES;
