import { Link } from "react-router";
import AppStoreButton from "@/components/brand/AppStoreButton";
import BrandLockup from "@/components/brand/BrandLockup";
import { BRAND, FONT_SANS, PAGE_MAX_WIDTH, SUPPORT_EMAIL } from "@/lib/brand/tokens";
import { SECTION_IDS } from "@/lib/home/copy";
import { useLang } from "@/lib/legal/useLang";

const LABELS = {
  es: {
    tagline: "Tu perro. Toda su vida, en un solo lugar.",
    home: "PawPi — inicio",
    explore: "Explorá",
    features: "Funciones",
    screenshots: "Pantallas",
    audiences: "Para quién es",
    business: "Negocios",
    listBusiness: "Listá tu negocio",
    businessSignin: "Iniciar sesión de negocio",
    legal: "Legal y ayuda",
    privacy: "Privacidad",
    terms: "Términos",
    eula: "EULA",
    support: "Soporte",
  },
  en: {
    tagline: "Your dog's whole life. In one place.",
    home: "PawPi — home",
    explore: "Explore",
    features: "Features",
    screenshots: "Screenshots",
    audiences: "Who it's for",
    business: "Business",
    listBusiness: "List your business",
    businessSignin: "Business sign in",
    legal: "Legal & help",
    privacy: "Privacy",
    terms: "Terms",
    eula: "EULA",
    support: "Support",
  },
};

// Apple's standard English credit lines, shown as they are in both languages: no translation of our own.
const APPLE_CREDIT =
  "Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc.";

// Links are underlined warm brown (coral text fails AA), never coral.
const linkStyle = {
  color: BRAND.brown,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  fontWeight: 600,
  fontSize: 14,
  overflowWrap: "anywhere",
};

// Collapses 4 -> 2 -> 1 columns without media queries: two auto-fit pairs inside an auto-fit grid, so
// a medium width gives 2x2 instead of leaving one column alone on a second row.
const pairGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 404px), 1fr))",
  gap: "32px 24px",
};
const columnGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
  gap: "32px 24px",
  alignContent: "start",
};

function Column({ id, title, items }) {
  return (
    <nav aria-labelledby={id}>
      <p
        id={id}
        style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: BRAND.brown }}
      >
        {title}
      </p>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {items.map((item) => (
          <li key={item.key}>{item}</li>
        ))}
      </ul>
    </nav>
  );
}

// Shared footer for the public pages: brand + download button, homepage anchors, business entry points,
// legal & help; then the copyright and Apple credit lines. Every link keeps the language.
export default function SiteFooter() {
  const { lang } = useLang();
  const t = LABELS[lang];
  const search = lang === "en" ? "?lang=en" : "";

  const link = (key, to, label) => (
    <Link key={key} to={to} className="pp-focus" style={linkStyle}>
      {label}
    </Link>
  );
  const page = (pathname, label) => link(pathname, { pathname, search }, label);
  const section = (id, label) =>
    link(id, { pathname: "/", search, hash: `#${id}` }, label);

  return (
    <footer
      style={{
        borderTop: `1px solid ${BRAND.border}`,
        background: BRAND.card,
        fontFamily: FONT_SANS,
      }}
    >
      <div style={{ maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: "40px 20px 32px" }}>
        <div style={pairGrid}>
          <div style={columnGrid}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 14,
              }}
            >
              <BrandLockup markWidth={32} to={{ pathname: "/", search }} label={t.home} />
              <p style={{ color: BRAND.muted, margin: 0, fontSize: 14, lineHeight: 1.55 }}>
                {t.tagline}
              </p>
              <AppStoreButton />
            </div>
            <Column
              id="footer-explore"
              title={t.explore}
              items={[
                section(SECTION_IDS.features, t.features),
                section(SECTION_IDS.screenshots, t.screenshots),
                section(SECTION_IDS.audiences, t.audiences),
              ]}
            />
          </div>
          <div style={columnGrid}>
            <Column
              id="footer-business"
              title={t.business}
              items={[
                page("/account/signup", t.listBusiness),
                page("/account/signin", t.businessSignin),
              ]}
            />
            <Column
              id="footer-legal"
              title={t.legal}
              items={[
                page("/privacy", t.privacy),
                page("/terms", t.terms),
                page("/eula", t.eula),
                page("/support", t.support),
                <a
                  key="email"
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="pp-focus"
                  style={linkStyle}
                >
                  {SUPPORT_EMAIL}
                </a>,
              ]}
            />
          </div>
        </div>

        <div
          style={{
            borderTop: `1px solid ${BRAND.border}`,
            marginTop: 32,
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            color: BRAND.muted,
          }}
        >
          <p style={{ margin: 0, fontSize: 13 }}>© 2026 PawPi · Augusto Traversa</p>
          <p lang="en" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
            {APPLE_CREDIT}
          </p>
        </div>
      </div>
    </footer>
  );
}
