import { Alert } from "react-native";
import { getI18n } from "react-i18next";

// Localized, friendly alerts for code that has no component `t` (react-query hooks, utils).
//
// Why this exists (consistency audit 2026-10-17, T-03/T-39/T-40): hooks called
// `Alert.alert("Error", e.message || "Could not X.")` — an English title, an English fallback, and
// whatever the network layer threw ("Network request failed", "JSON Parse error…") as the body.
// Use `alertError(error, "appAlerts.couldNotX")` for failures and `alertText(titleKey, bodyKey)` for
// success/info messages. Never `import i18n from "@/i18n"` in a shared util (it triggers init and
// breaks tests that mock react-i18next) — `getI18n()` inside try/catch is the safe pattern.

export function translate(key, fallback = "") {
  try {
    const value = getI18n()?.t?.(key);
    if (typeof value === "string" && value && value !== key) return value;
  } catch {
    // i18n not initialised (a unit test that mocks react-i18next) -> fall back below
  }
  return fallback || key;
}

// Messages that are plumbing, not words for a person: network/JSON/HTTP/abort/internal text.
const TECHNICAL =
  /network request failed|failed to fetch|json parse|unexpected token|abort|timeout|timed out|\bhttp\b|status code|\b[45]\d\d\b|undefined|\bnull\b|typeerror|referenceerror|syntaxerror|stack|ECONN|ENOTFOUND/i;

export function isTechnicalMessage(message) {
  if (typeof message !== "string") return true;
  const m = message.trim();
  return m.length === 0 || m.length > 200 || TECHNICAL.test(m);
}

// The text to show for a failed action: the server's own friendly sentence when it has one,
// otherwise the localized fallback for this action.
export function friendlyErrorMessage(error, fallbackKey = "common.somethingWrong") {
  const message = error?.message;
  if (!isTechnicalMessage(message)) return message;
  return translate(fallbackKey, translate("common.somethingWrong", "Something went wrong. Please try again."));
}

export function alertError(error, fallbackKey) {
  Alert.alert(translate("common.error", "Error"), friendlyErrorMessage(error, fallbackKey));
}

export function alertText(titleKey, bodyKey) {
  Alert.alert(translate(titleKey), bodyKey ? translate(bodyKey) : undefined);
}
