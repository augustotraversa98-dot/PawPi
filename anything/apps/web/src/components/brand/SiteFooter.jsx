import { Link } from "react-router";
import { BRAND, FONT_SANS, SUPPORT_EMAIL } from "@/lib/brand/tokens";
import { useLang } from "@/lib/legal/useLang";

const LABELS = {
  es: {
    privacy: "Privacidad",
    terms: "Términos",
    eula: "EULA",
    support: "Soporte",
    tagline: "Tu perro. Toda su vida, en un solo lugar.",
    contact: "Contacto",
  },
  en: {
    privacy: "Privacy",
    terms: "Terms",
    eula: "EULA",
    support: "Support",
    tagline: "Your dog's whole life. In one place.",
    contact: "Contact",
  },
};

// Shared footer: brand tagline, cross-links to the four legal/support pages
// (lang-preserving), the support email, and a copyright line. Links are
// underlined warm brown (coral text fails AA), never coral.
export default function SiteFooter() {
  const { lang } = useLang();
  const t = LABELS[lang];
  const search = lang === "en" ? "?lang=en" : "";

  const linkStyle = {
    color: BRAND.brown,
    textDecoration: "underline",
    textUnderlineOffset: 2,
    fontWeight: 600,
    fontSize: 14,
  };

  const nav = [
    ["/privacy", t.privacy],
    ["/terms", t.terms],
    ["/eula", t.eula],
    ["/support", t.support],
  ];

  return (
    <footer
      style={{
        borderTop: `1px solid ${BRAND.border}`,
        background: BRAND.card,
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "28px 20px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <p style={{ color: BRAND.muted, margin: 0, fontSize: 14 }}>{t.tagline}</p>
        <nav
          aria-label={lang === "en" ? "Legal" : "Legal"}
          style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px" }}
        >
          {nav.map(([path, label]) => (
            <Link key={path} to={{ pathname: path, search }} style={linkStyle}>
              {label}
            </Link>
          ))}
        </nav>
        <p style={{ color: BRAND.muted, margin: 0, fontSize: 13 }}>
          {t.contact}:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p style={{ color: BRAND.muted, margin: 0, fontSize: 13 }}>
          © 2026 PawPi · Augusto Traversa
        </p>
      </div>
    </footer>
  );
}
