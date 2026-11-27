// The viewer's language in the browser, shared by every component that asks for it, so one ES / EN switch updates
// the whole page. The rule itself is in lang.js.
import { DEFAULT_VISITOR_LANG, isVisitorLang, langParam, pickVisitorLang } from "./lang";

export const LANG_STORAGE_KEY = "pawpi.lang";

const listeners = new Set();
// Asked for during this page load (?lang or the switch). Keeps the choice across in-app navigation, and works
// when browser storage is unavailable (private windows, blocked site data).
let visit = null;

function remembered() {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getVisitorLang() {
  if (typeof window === "undefined") return DEFAULT_VISITOR_LANG;
  const asked = langParam(window.location.search);
  if (asked) visit = asked;
  const { languages, language } = window.navigator;
  return pickVisitorLang({
    remembered: visit ?? remembered(),
    languages: languages?.length ? languages : [language],
  });
}

export function subscribeVisitorLang(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The viewer's own choice: remembered for next time and written into the address bar (without navigating).
export function setVisitorLang(next) {
  if (!isVisitorLang(next)) return;
  visit = next;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    /* unavailable: the choice lasts for this page load */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", next);
  window.history.replaceState(window.history.state, "", url);
  listeners.forEach((listener) => listener());
}

// Forget the choice (tests).
export function resetVisitorLang() {
  visit = null;
  try {
    window.localStorage.removeItem(LANG_STORAGE_KEY);
  } catch {
    /* unavailable */
  }
}
