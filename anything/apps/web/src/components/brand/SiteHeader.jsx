import AppStoreButton from "@/components/brand/AppStoreButton";
import BrandLockup from "@/components/brand/BrandLockup";
import LangToggle from "@/components/brand/LangToggle";
import { BRAND, PAGE_MAX_WIDTH } from "@/lib/brand/tokens";
import { useLang } from "@/lib/legal/useLang";

const HOME_LABELS = { es: "PawPi — inicio", en: "PawPi — home" };

// Shared top bar for the public pages: brand lockup (→ home) on the left; the download button (hidden on
// very narrow screens, see .pp-header-cta in global.css) and the ES/EN toggle on the right. Cream
// background, hairline bottom border.
export default function SiteHeader({ showLangToggle = true }) {
  const { lang } = useLang();
  const search = lang === "en" ? "?lang=en" : "";

  return (
    <header
      style={{
        borderBottom: `1px solid ${BRAND.border}`,
        background: BRAND.cream,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: PAGE_MAX_WIDTH,
          margin: "0 auto",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <BrandLockup
          markWidth={32}
          to={{ pathname: "/", search }}
          label={HOME_LABELS[lang]}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="pp-header-cta">
            <AppStoreButton />
          </span>
          {showLangToggle ? <LangToggle /> : null}
        </div>
      </div>
    </header>
  );
}
