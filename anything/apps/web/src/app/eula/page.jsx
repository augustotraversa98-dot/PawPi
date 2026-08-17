import LegalPage from "@/components/legal/LegalPage";
import contentEs from "../../content/legal/eula.es.md?raw";
import contentEn from "../../content/legal/eula.en.md?raw";

const EYEBROWS = { es: "Legal", en: "Legal" };
const TITLES = {
  es: "Contrato de Licencia (EULA)",
  en: "End User License Agreement (EULA)",
};
const DESCRIPTIONS = {
  es: "Los términos de licencia para usar la aplicación móvil PawPi.",
  en: "The license terms for using the PawPi mobile app.",
};

export default function EulaPage() {
  return (
    <LegalPage
      path="/eula"
      eyebrows={EYEBROWS}
      titles={TITLES}
      descriptions={DESCRIPTIONS}
      content={{ es: contentEs, en: contentEn }}
    />
  );
}
