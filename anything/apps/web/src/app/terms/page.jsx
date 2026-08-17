import LegalPage from "@/components/legal/LegalPage";
import contentEs from "../../content/legal/terms.es.md?raw";
import contentEn from "../../content/legal/terms.en.md?raw";

const EYEBROWS = { es: "Legal", en: "Legal" };
const TITLES = { es: "Términos del Servicio", en: "Terms of Service" };
const DESCRIPTIONS = {
  es: "Los términos que rigen el uso de la app PawPi y sus servicios.",
  en: "The terms that govern your use of the PawPi app and services.",
};

export default function TermsPage() {
  return (
    <LegalPage
      path="/terms"
      eyebrows={EYEBROWS}
      titles={TITLES}
      descriptions={DESCRIPTIONS}
      content={{ es: contentEs, en: contentEn }}
    />
  );
}
