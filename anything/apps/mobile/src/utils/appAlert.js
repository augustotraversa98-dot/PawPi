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
// The API answers in English only. For a Spanish user a raw server sentence ("Pet not found", "petId is
// required") under a Spanish alert title is a half-translated screen, so in Spanish the generic server
// messages are mapped to Spanish and anything we cannot map falls back to the localized per-action
// fallback instead of leaking English. English users keep the server's own sentence unchanged.
function isSpanishUi() {
  try {
    return String(getI18n()?.language || "").toLowerCase().startsWith("es");
  } catch {
    return false;
  }
}

const SERVER_MESSAGE_RULES = [
  [/^(unauthorized|not authorized\b.*)$/i, "leftoverUi.serverErrors.unauthorized", "Please sign in again."],
  [/^forbidden$|access denied|not owned|not yours|do not own|not a participant|not allowed/i, "leftoverUi.serverErrors.forbidden", "You don't have permission to do that."],
  [/not found/i, "leftoverUi.serverErrors.notFound", "We couldn't find that."],
  [/ is required$|^invalid |cannot be empty|must be |^missing /i, "leftoverUi.serverErrors.invalid", "Some information is missing or not valid. Please check and try again."],
  [/already (have|exists|applied|processed|taken)|was just taken/i, "leftoverUi.serverErrors.alreadyDone", "That was already done."],
  [/not available|aren't available|isn't available|not time to join/i, "leftoverUi.serverErrors.notAvailable", "That isn't available yet."],
];

// Spanish UI: a mapped Spanish sentence, the message itself when it is already Spanish, or null (use the
// localized fallback). Non-Spanish UI: the message unchanged.
export function localizeServerMessage(message) {
  if (!isSpanishUi() || typeof message !== "string") return message;
  const m = message.trim();
  if (/[áéíóúñ¿¡]/i.test(m)) return m;
  for (const [re, key, fallback] of SERVER_MESSAGE_RULES) {
    if (re.test(m)) return translate(key, fallback);
  }
  return null;
}

export function friendlyErrorMessage(error, fallbackKey = "common.somethingWrong") {
  const message = error?.message;
  if (!isTechnicalMessage(message)) {
    const localized = localizeServerMessage(message);
    if (localized) return localized;
  }
  return translate(fallbackKey, translate("common.somethingWrong", "Something went wrong. Please try again."));
}

export function alertError(error, fallbackKey) {
  Alert.alert(translate("common.error", "Error"), friendlyErrorMessage(error, fallbackKey));
}

export function alertText(titleKey, bodyKey) {
  Alert.alert(translate(titleKey), bodyKey ? translate(bodyKey) : undefined);
}
