import { useLang } from "@/lib/legal/useLang";
import { BRAND, FONT_MONO } from "@/lib/brand/tokens";

// ES / EN language switch. es-AR is primary; the active language is filled, the
// other is a plain button. Uses a mono uppercase treatment (brand eyebrow style).
export default function LangToggle() {
  const { lang, setLang } = useLang();

  const btn = (active) => ({
    fontFamily: FONT_MONO,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: "0.12em",
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? BRAND.brown : BRAND.border}`,
    background: active ? BRAND.brown : "transparent",
    color: active ? BRAND.cream : BRAND.muted,
    cursor: "pointer",
  });

  return (
    <div
      role="group"
      aria-label="Language / Idioma"
      style={{ display: "inline-flex", gap: 6 }}
    >
      <button
        type="button"
        onClick={() => setLang("es")}
        aria-pressed={lang === "es"}
        style={btn(lang === "es")}
      >
        ES
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        style={btn(lang === "en")}
      >
        EN
      </button>
    </div>
  );
}
