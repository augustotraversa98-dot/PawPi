import { useVisitorLang } from "../../../../lib/publicPet/useVisitorLang";

/**
 * The words of one area of the provider panel in the viewer's language. `area` is a dictionary module from
 * provider/i18n ({ en, es }):
 *
 *   import dashboardCopy from "../i18n/dashboard";
 *   const { t, lang } = useProviderCopy(dashboardCopy);
 */
export function useProviderCopy(area) {
  const { lang, setLang } = useVisitorLang();
  return { t: area[lang], lang, setLang };
}
