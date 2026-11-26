import { useEffect, useState } from "react";
import { pickVisitorLang } from "./lang";

function initialLang() {
  if (typeof window === "undefined") return "es";
  const { languages, language } = window.navigator;
  return pickVisitorLang({
    search: window.location.search,
    languages: languages?.length ? languages : [language],
  });
}

// The page's language and its setter. The choice is written into the address bar (without navigating) and onto
// <html lang>, which the server renders as "en" for these pages.
export function useVisitorLang() {
  const [lang, setLangState] = useState(initialLang);

  useEffect(() => {
    const root = document.documentElement;
    const before = root.lang;
    root.lang = lang === "es" ? "es-AR" : "en";
    return () => {
      root.lang = before;
    };
  }, [lang]);

  const setLang = (next) => {
    setLangState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(window.history.state, "", url);
  };

  return { lang, setLang };
}
