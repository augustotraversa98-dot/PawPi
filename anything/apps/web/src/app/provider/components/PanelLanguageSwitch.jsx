import { LanguageSwitch } from "@/components/publicPet/PetPageParts";
import shellCopy from "../i18n/shell";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";

// The panel's ES / EN switch: the same choice the public pet pages and the vet invite page remember.
export default function PanelLanguageSwitch() {
  const { t, lang, setLang } = useProviderCopy(shellCopy);
  return <LanguageSwitch lang={lang} setLang={setLang} label={t.languageLabel} />;
}
