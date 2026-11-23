import { getI18n } from "react-i18next";

// Like `translate()` (utils/appAlert) but with {{var}} interpolation, for code that has no component `t`
// (share captions, notification builders). Falls back to the English template when i18n is not initialised
// (e.g. a unit test that mocks react-i18next). Never `import i18n from "@/i18n"` in a shared util.
export function translateVars(key, vars, fallback = "") {
  try {
    const value = getI18n()?.t?.(key, vars);
    if (typeof value === "string" && value && value !== key) return value;
  } catch {
    // i18n not initialised -> fall back below
  }
  return String(fallback || key).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars?.[k] ?? ""));
}
