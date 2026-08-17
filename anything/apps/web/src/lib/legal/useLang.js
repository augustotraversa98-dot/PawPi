import { useSearchParams } from "react-router";

// Client-side language state, backed by the `?lang` query param so it stays in
// sync with the SEO canonical/hreflang and is shareable/bookmarkable. Default is
// es-AR (no param); toggling to en sets `?lang=en`, toggling back removes it.
export function useLang() {
  const [params, setParams] = useSearchParams();
  const lang = params.get("lang") === "en" ? "en" : "es";

  const setLang = (next) => {
    const p = new URLSearchParams(params);
    if (next === "en") p.set("lang", "en");
    else p.delete("lang");
    setParams(p, { preventScrollReset: true });
  };

  return { lang, setLang, other: lang === "en" ? "es" : "en" };
}
