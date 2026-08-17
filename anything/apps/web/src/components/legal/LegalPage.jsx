import SiteHeader from "@/components/brand/SiteHeader";
import SiteFooter from "@/components/brand/SiteFooter";
import LegalArticle from "@/components/legal/LegalArticle";
import { useLang } from "@/lib/legal/useLang";
import { buildPageMeta } from "@/lib/legal/lang";
import { useDocumentHead, useBrandFonts, usePublicChrome } from "@/lib/legal/head";
import { BRAND, FONT_MONO, FONT_SANS } from "@/lib/brand/tokens";

// Shared long-form page shell for /privacy /terms /eula /support. Branded header
// (lockup + ES/EN toggle), a mono eyebrow + big title, the ported markdown body,
// and the shared footer. es-AR is the default; the toggle swaps the copy in place.
// Also owns the per-page <head> (title/description/canonical/hreflang) since this
// app doesn't wire route-module meta — see lib/legal/head.js.
export default function LegalPage({ eyebrows, titles, descriptions, path, content }) {
  const { lang } = useLang();

  useBrandFonts();
  usePublicChrome();
  useDocumentHead(
    buildPageMeta({
      path,
      search: lang === "en" ? "?lang=en" : "",
      titles,
      descriptions,
    }),
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BRAND.cream,
        color: BRAND.brown,
        fontFamily: FONT_SANS,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SiteHeader />
      <main style={{ flex: 1, width: "100%" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 20px 56px" }}>
          <p
            style={{
              fontFamily: FONT_MONO,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              fontSize: 11,
              color: BRAND.muted,
              margin: "0 0 8px",
            }}
          >
            {eyebrows[lang]}
          </p>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: BRAND.brown,
              margin: "0 0 20px",
              lineHeight: 1.15,
            }}
          >
            {titles[lang]}
          </h1>
          <LegalArticle content={content[lang]} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
