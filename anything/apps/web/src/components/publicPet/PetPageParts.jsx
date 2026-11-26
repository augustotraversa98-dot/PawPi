// Pieces shared by the private-link pet pages (/p/tag, /p/card). Visual identity per pawpi-brand-kit: the
// supplied paw mark through BrandLockup (never an emoji), and the brand palette.
import BrandLockup from "@/components/brand/BrandLockup";
import { BRAND, FONT_MONO } from "@/lib/brand/tokens";

export const PET_PAGE_WRAP = {
  maxWidth: 480,
  margin: "0 auto",
  padding: 16,
  fontFamily: "system-ui, sans-serif",
};

export function LanguageSwitch({ lang, setLang, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: "inline-flex", gap: 6 }}>
      {["es", "en"].map((code) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            onClick={() => setLang(code)}
            aria-pressed={active}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 13,
              letterSpacing: "0.12em",
              minWidth: 44,
              minHeight: 36,
              borderRadius: 999,
              border: `1px solid ${active ? BRAND.brown : BRAND.border}`,
              background: active ? BRAND.brown : "transparent",
              color: active ? BRAND.cream : BRAND.muted,
              cursor: "pointer",
            }}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export function PetPageHeader({ lang, setLang, copy, heading }) {
  return (
    <header style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
        <BrandLockup markWidth={32} to={null} />
        <LanguageSwitch lang={lang} setLang={setLang} label={copy.languageLabel} />
      </div>
      {heading ? (
        <div style={{ textAlign: "center", color: BRAND.brown, fontWeight: 800, fontSize: 18, marginTop: 8 }}>
          {heading}
        </div>
      ) : null}
    </header>
  );
}

export function PetRow({ label, value, emptyText }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${BRAND.peach}`,
      }}
    >
      <span style={{ color: BRAND.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ color: BRAND.brown, fontWeight: 700, textAlign: "right", overflowWrap: "anywhere" }}>
        {value == null || value === "" ? emptyText : value}
      </span>
    </div>
  );
}
