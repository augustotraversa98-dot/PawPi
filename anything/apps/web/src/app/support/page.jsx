import LegalPage from "@/components/legal/LegalPage";
import contentEs from "../../content/legal/support.es.md?raw";
import contentEn from "../../content/legal/support.en.md?raw";

const EYEBROWS = { es: "Ayuda", en: "Help" };
const TITLES = { es: "Soporte de PawPi", en: "PawPi Support" };
const DESCRIPTIONS = {
  es: "¿Necesitás ayuda con PawPi? Escribinos y mirá las preguntas frecuentes.",
  en: "Need help with PawPi? Contact us and browse the FAQ.",
};

export default function SupportPage() {
  return (
    <LegalPage
      path="/support"
      eyebrows={EYEBROWS}
      titles={TITLES}
      descriptions={DESCRIPTIONS}
      content={{ es: contentEs, en: contentEn }}
    />
  );
}
