import { getI18n } from "react-i18next";

// Localized copy for code that GENERATES user-visible text outside React (reminder/notification
// generators, calendar event builders, HealthKit alerts).
//
// Like `translate()` in appAlert.js (never `import i18n from "@/i18n"` in a shared util: it
// triggers init and breaks tests that mock react-i18next) but with interpolation + plural support:
//   gt("generatedUi.timeFor", "Time for {{name}}", { name })
//   gt("generatedUi.timeToGo.minutes", "5 minutes", { count: 5 })   // -> _one/_other keys
// The English fallback is returned (with {{vars}} filled in) whenever i18n is not initialised or
// the key is missing, so English-asserting unit tests keep passing untouched.
//
// The text is computed when this runs — i.e. at reminder-generation / notification-schedule time —
// in the language that is current THEN. Stable ids, types and anything persisted are never routed
// through here; only display text.

function fill(template, vars) {
  if (!vars) return template;
  return String(template).replace(/{{\s*(\w+)\s*}}/g, (m, name) =>
    vars[name] === undefined || vars[name] === null ? m : String(vars[name]),
  );
}

export function gt(key, fallback = "", vars) {
  try {
    const value = getI18n()?.t?.(key, vars);
    if (typeof value === "string" && value && value !== key) return value;
  } catch {
    // i18n not initialised (a unit test that mocks react-i18next) -> English fallback below
  }
  return fill(fallback || key, vars);
}

// The label for a primary-action key (see generatedUi.action.*), e.g. "Mark as given".
export const ACTION_FALLBACK = {
  logFood: "Log food",
  startWalk: "Start walk",
  markGiven: "Mark as given",
  takePhoto: "Take photo",
  startCheck: "Start check",
  logWeight: "Log weight",
  logCheck: "Log check",
  viewVaccineRecord: "View vaccine record",
  prepareVetSummary: "Prepare vet summary",
  addVetRecord: "Add vet record",
  markCompleted: "Mark completed",
  markDone: "Mark as done",
  logWater: "Log water",
  viewDetails: "View details",
  joinCall: "Join call",
  done: "Done",
  somethingOff: "Something was off",
  logAsUsual: "Log as usual",
};

export function actionLabel(name) {
  return gt(`generatedUi.action.${name}`, ACTION_FALLBACK[name] ?? name);
}

// Body areas a photo check can target (ids are stored on the routine; only the wording is localized).
const PHOTO_AREAS = ["paws", "ears", "eyes", "teeth", "skin_fur", "face", "full_body", "other"];

// Noun phrase for the area, e.g. "ears" / "las orejas". Unknown/missing area -> the raw id with
// underscores replaced (the previous behaviour) or the "body area" fallback.
export function photoAreaPhrase(bodyArea) {
  if (bodyArea && PHOTO_AREAS.includes(bodyArea)) {
    return gt(`generatedUi.areas.${bodyArea}`, String(bodyArea).replace("_", " "));
  }
  if (bodyArea) return String(bodyArea).replace("_", " ");
  return gt("generatedUi.areas.body", "body area");
}

// "PAWS Check" style reminder title for a photo-check schedule.
export function photoCheckTitle(bodyArea) {
  const upper = bodyArea?.toUpperCase() || "BODY";
  if (bodyArea && PHOTO_AREAS.includes(bodyArea)) {
    return gt(`generatedUi.photoCheckTitle.${bodyArea}`, `${upper} Check`);
  }
  if (!bodyArea) return gt("generatedUi.photoCheckTitle.body", `${upper} Check`);
  return gt("generatedUi.photoCheckTitle.generic", "{{area}} Check", { area: upper });
}

export function photoCheckDescription(bodyArea) {
  return gt("generatedUi.photoCheckDesc", "Take photo of {{area}}", {
    area: photoAreaPhrase(bodyArea),
  });
}
