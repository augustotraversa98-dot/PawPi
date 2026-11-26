import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_VISITOR_LANG, htmlLang, isVisitorLangPath, langParam } from "./lang";
import { getVisitorLang, setVisitorLang, subscribeVisitorLang } from "./langStore";

const serverLang = () => DEFAULT_VISITOR_LANG;

// The page's language and its setter. The server, which cannot know the viewer's choice, renders Spanish.
export function useVisitorLang() {
  const lang = useSyncExternalStore(subscribeVisitorLang, getVisitorLang, serverLang);

  useEffect(() => {
    document.documentElement.lang = htmlLang(lang);
  }, [lang]);

  return { lang, setLang: setVisitorLang };
}

// The language root.tsx puts on <html lang> for the pages that follow the viewer. The server render and the
// hydration pass both use ?lang (else Spanish), so they match; the viewer's own language applies right after.
export function useRootVisitorLang(pathname, search) {
  const follows = isVisitorLangPath(pathname);
  return useSyncExternalStore(
    subscribeVisitorLang,
    () => (follows ? getVisitorLang() : DEFAULT_VISITOR_LANG),
    () => langParam(search) ?? DEFAULT_VISITOR_LANG,
  );
}
