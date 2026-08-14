import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n, { deviceLanguage, SUPPORTED_LANGUAGES } from "./index";

// Persisted manual language override (ticket 2.29). Mirrors the app's other persisted
// settings (e.g. pawpi:selectedPetId). "system" = follow the phone (no stored override).
const KEY = "pawpi:locale";

// Apply the saved override on startup (call once at the app root). No override → the
// device language. Never throws.
export async function initLocaleFromStorage() {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    const lng =
      saved && SUPPORTED_LANGUAGES.includes(saved) ? saved : deviceLanguage();
    if (lng !== i18n.language) await i18n.changeLanguage(lng);
  } catch {
    // best-effort; stay on whatever i18n initialized with
  }
}

// The current preference: "system" | "en" | "es".
export async function getLocalePreference() {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    return saved && SUPPORTED_LANGUAGES.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

// Set the preference + apply it immediately. "system" clears the override and follows
// the phone; "en"/"es" force + persist.
export async function setLocalePreference(value) {
  try {
    if (value === "system") {
      await AsyncStorage.removeItem(KEY);
      await i18n.changeLanguage(deviceLanguage());
    } else if (SUPPORTED_LANGUAGES.includes(value)) {
      await AsyncStorage.setItem(KEY, value);
      await i18n.changeLanguage(value);
    }
  } catch {
    // best-effort; ignore storage errors
  }
  // FF1: mirror the RESOLVED language to the server so the E11 weekly-digest + E12
  // win-back EMAILS (server-rendered) render in the user's language. Fire-and-forget.
  syncLocaleToServer();
}

// FF1: persist the currently-resolved app language ('en'|'es') to the signed-in
// user's profile, so server-side emails match the app. Best-effort: an unauthenticated
// call (401) or an offline error is swallowed; the emails simply keep the es-AR fallback
// until the next successful sync. The patched global fetch attaches the auth JWT.
export async function syncLocaleToServer() {
  try {
    const lng = i18n.language === "es" ? "es" : "en";
    await fetch("/api/user-profile/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: lng }),
    });
  } catch {
    // best-effort; ignore network/auth errors
  }
}
