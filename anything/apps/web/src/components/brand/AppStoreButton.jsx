import { appStoreUrl, BRAND } from "@/lib/brand/tokens";
import { useLang } from "@/lib/legal/useLang";

const LABELS = { es: "Descargar", en: "Download" };

// Small coral button to the App Store listing, for the header and footer. Apple's official badge
// (AppStoreBadge) is kept to the homepage hero and closing band, plus the block on /support, so a
// layout never carries more than two.
export default function AppStoreButton() {
  const { lang } = useLang();

  return (
    <a
      href={appStoreUrl(lang)}
      className="pp-focus"
      style={{
        display: "inline-block",
        background: BRAND.coral,
        color: BRAND.white,
        fontWeight: 700,
        fontSize: 14,
        lineHeight: 1.2,
        padding: "8px 14px",
        borderRadius: 999,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {LABELS[lang]}
    </a>
  );
}
