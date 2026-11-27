import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import en from "./locales/en.json";
import es from "./locales/es.json";

// i18n framework (ticket 2.29). English + Spanish; defaults to the PHONE's language,
// falls back to Spanish (PawPi's primary language) when the phone asks for neither. A
// persisted manual override lives in ./localePreference (Settings → Language). New screens
// use t("namespace.key"); any missing key falls back to English so a raw key is never
// shown on screen.

export const SUPPORTED_LANGUAGES = ["en", "es"];
export const DEFAULT_LANGUAGE = "es";

// The first language in the phone's preferred list that we support. None supported, none
// reported, or the lookup fails → Spanish.
export function deviceLanguage() {
  try {
    const locales = Localization.getLocales?.() || [];
    const preferred = locales.find((l) => SUPPORTED_LANGUAGES.includes(l?.languageCode));
    return preferred ? preferred.languageCode : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: deviceLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
    // A missing key returns the English value (never the raw key on screen).
    returnEmptyString: false,
  });
}

export default i18n;
