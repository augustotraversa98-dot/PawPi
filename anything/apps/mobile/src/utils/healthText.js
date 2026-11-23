import { getI18n } from "react-i18next";

// Localized text for the pure health utils / data tables (routine summaries, insight sentences, vet-summary
// text, wellness-log schema). These have no component `t`, so they resolve through the live i18n instance
// at CALL time (so a language switch shows up on the next render) and fall back to the English text passed
// in when i18n isn't initialised (a unit test that mocks react-i18next) — which keeps every English-asserting
// test green. NEVER `import i18n from "@/i18n"` here (triggers init and breaks react-i18next-mocked tests).
//
// `tr(key, englishFallback, params)`:
//   - `params` are i18next interpolation vars ({{name}}); `count` also selects the `_one` / `_other` plural.
//   - The English fallback is interpolated here with the same `{{var}}` syntax, so callers pass the already
//     pluralised English sentence (e.g. `count === 1 ? "1 meal" : "{{count}} meals"`).
function interpolate(text, params) {
  if (!params) return text;
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) =>
    params[name] === undefined || params[name] === null ? m : String(params[name]),
  );
}

export function tr(key, fallback = "", params) {
  try {
    const value = getI18n()?.t?.(key, params);
    if (typeof value === "string" && value && value !== key) return value;
  } catch {
    // i18n not initialised -> English fallback below
  }
  return interpolate(fallback || key, params);
}

// Stored values for the spayed/neutered status are English ids ("Spayed", ...); only the label localizes.
export const SPAY_NEUTER_OPTIONS = ["Spayed", "Neutered", "Not spayed/neutered", "Unknown"];
export const SPAY_NEUTER_KEYS = {
  Spayed: "healthDataUi.spayNeuter.spayed",
  Neutered: "healthDataUi.spayNeuter.neutered",
  "Not spayed/neutered": "healthDataUi.spayNeuter.notSpayedNeutered",
  Unknown: "healthDataUi.spayNeuter.unknown",
};
export function spayNeuterLabel(value) {
  const key = SPAY_NEUTER_KEYS[value];
  return key ? tr(key, value) : value;
}
