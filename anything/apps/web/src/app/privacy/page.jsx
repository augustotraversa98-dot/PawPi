import LegalPage from "@/components/legal/LegalPage";
import contentEs from "../../content/legal/privacy.es.md?raw";
import contentEn from "../../content/legal/privacy.en.md?raw";

const EYEBROWS = { es: "Legal", en: "Legal" };
const TITLES = { es: "Política de Privacidad", en: "Privacy Policy" };
const DESCRIPTIONS = {
  es: "Cómo PawPi recopila, usa y protege tus datos y los de tu perro.",
  en: "How PawPi collects, uses, and protects your data and your dog's.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      path="/privacy"
      eyebrows={EYEBROWS}
      titles={TITLES}
      descriptions={DESCRIPTIONS}
      content={{ es: contentEs, en: contentEn }}
    />
  );
}
