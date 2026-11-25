import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import SiteHeader from "@/components/brand/SiteHeader";
import SiteFooter from "@/components/brand/SiteFooter";
import AppStoreBadge from "@/components/brand/AppStoreBadge";
import PawMark from "@/components/brand/PawMark";
import { useLang } from "@/lib/legal/useLang";
import { buildPageMeta } from "@/lib/legal/lang";
import { useDocumentHead, useBrandFonts, usePublicChrome } from "@/lib/legal/head";
import { HOME_COPY, HOME_IMAGES, SECTION_IDS } from "@/lib/home/copy";
import { appStoreUrl, BRAND, FONT_MONO, FONT_SANS, PAGE_MAX_WIDTH } from "@/lib/brand/tokens";

const TITLES = { es: HOME_COPY.es.title, en: HOME_COPY.en.title };
const DESCRIPTIONS = { es: HOME_COPY.es.description, en: HOME_COPY.en.description };

// Clears the sticky header when jumping to an anchor.
const ANCHOR_OFFSET = 76;

const container = {
  maxWidth: PAGE_MAX_WIDTH,
  margin: "0 auto",
  paddingLeft: 20,
  paddingRight: 20,
};
const card = {
  background: BRAND.card,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 20,
};
const pillButton = {
  alignSelf: "flex-start",
  background: BRAND.coral,
  color: BRAND.white,
  fontWeight: 700,
  fontSize: 14.5,
  padding: "10px 18px",
  borderRadius: 999,
  textDecoration: "none",
};

// The small mono label above a section. It is the section's heading (h2) where the items below have
// their own titles, and plain text where a larger heading follows.
function Eyebrow({ children, as: Tag = "h2" }) {
  return (
    <Tag
      style={{
        fontWeight: 400,
        fontFamily: FONT_MONO,
        textTransform: "uppercase",
        letterSpacing: "0.18em",
        fontSize: 11,
        color: BRAND.muted,
        margin: "0 0 12px",
      }}
    >
      {children}
    </Tag>
  );
}

// A device screenshot. Intrinsic width/height reserve the space (no layout shift); everything but the
// hero image loads lazily.
function Screenshot({ name, alt, maxWidth, eager = false }) {
  const image = HOME_IMAGES[name];
  return (
    <img
      src={image.src}
      alt={alt}
      width={image.width}
      height={image.height}
      loading={eager ? "eager" : "lazy"}
      decoding={eager ? "auto" : "async"}
      style={{ display: "block", width: "100%", maxWidth, height: "auto", margin: "0 auto" }}
    />
  );
}

// The body mounts on the client only, so on a full load of "/#features" the browser finds no anchor.
// Scroll once the sections exist, and again on each in-app navigation to a hash.
function useScrollToHash() {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, key]);
}

export default function HomePage() {
  const { lang } = useLang();
  const t = HOME_COPY[lang];
  const search = lang === "en" ? "?lang=en" : "";

  useBrandFonts();
  usePublicChrome();
  useScrollToHash();
  useDocumentHead(
    buildPageMeta({ path: "/", search, titles: TITLES, descriptions: DESCRIPTIONS }),
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
        {/* Hero: words + badge beside a device; stacked on narrow screens. */}
        <section
          style={{
            ...container,
            paddingTop: 48,
            paddingBottom: 40,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 40,
          }}
        >
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <PawMark width={72} color={BRAND.coral} style={{ marginBottom: 24 }} />
            <h1
              style={{
                fontSize: "clamp(34px, 6vw, 54px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
                margin: "0 0 18px",
              }}
            >
              {t.hero.title[0]}
              <br />
              {t.hero.title[1]}
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.6,
                color: BRAND.muted,
                maxWidth: 520,
                margin: "0 0 28px",
              }}
            >
              {t.hero.sub}
            </p>
            <AppStoreBadge height={52} />
            {t.hero.screensNote ? (
              <p style={{ margin: "18px 0 0", fontSize: 13, color: BRAND.muted }}>
                {t.hero.screensNote}
              </p>
            ) : null}
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <Screenshot name={t.hero.image} alt={t.hero.alt} maxWidth={320} eager />
          </div>
        </section>

        {/* What PawPi is — feature strip */}
        <section
          id={SECTION_IDS.features}
          style={{ ...container, paddingTop: 28, paddingBottom: 28, scrollMarginTop: ANCHOR_OFFSET }}
        >
          <Eyebrow>{t.featuresEyebrow}</Eyebrow>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {t.features.map((feature) => (
              <div key={feature.title} style={{ ...card, padding: "20px 18px" }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 6px" }}>
                  {feature.title}
                </h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: BRAND.muted, margin: 0 }}>
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div id={SECTION_IDS.screenshots} style={{ scrollMarginTop: ANCHOR_OFFSET }}>
          {/* Day to day */}
          <section style={{ ...container, paddingTop: 28, paddingBottom: 28 }}>
            <Eyebrow>{t.dailyEyebrow}</Eyebrow>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
                gap: 32,
                alignItems: "end",
              }}
            >
              {t.daily.map((item) => (
                <figure key={item.image} style={{ margin: 0, textAlign: "center" }}>
                  <Screenshot name={item.image} alt={item.alt} maxWidth={270} />
                  <figcaption style={{ marginTop: 14, fontSize: 18, fontWeight: 800 }}>
                    {item.title}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          {/* Alternating text + device. Wrapping keeps text above the device on narrow screens. */}
          {t.sections.map((section, index) => (
            <section
              key={section.key}
              style={{
                ...container,
                paddingTop: 40,
                paddingBottom: 40,
                display: "flex",
                flexWrap: "wrap",
                flexDirection: index % 2 === 0 ? "row" : "row-reverse",
                alignItems: "center",
                gap: 40,
              }}
            >
              <div style={{ flex: "1 1 360px", minWidth: 0 }}>
                <Eyebrow as="p">{section.eyebrow}</Eyebrow>
                <h2
                  style={{
                    fontSize: "clamp(24px, 4vw, 32px)",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.18,
                    margin: "0 0 16px",
                  }}
                >
                  {section.title}
                </h2>
                <ul
                  style={{
                    listStyleType: "disc",
                    paddingLeft: 20,
                    margin: 0,
                    fontSize: 16,
                    lineHeight: 1.6,
                    color: BRAND.muted,
                  }}
                >
                  {section.bullets.map((bullet) => (
                    <li key={bullet} style={{ marginBottom: 8 }}>
                      {bullet}
                    </li>
                  ))}
                </ul>
                {section.note ? (
                  <p
                    style={{
                      background: BRAND.sand,
                      borderRadius: 14,
                      padding: "12px 16px",
                      margin: "16px 0 0",
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: BRAND.brown,
                    }}
                  >
                    {section.note}
                  </p>
                ) : null}
              </div>
              <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                <Screenshot name={section.image} alt={section.alt} maxWidth={290} />
              </div>
            </section>
          ))}
        </div>

        {/* Who it's for — audience entry points */}
        <section
          id={SECTION_IDS.audiences}
          style={{ ...container, paddingTop: 28, paddingBottom: 40, scrollMarginTop: ANCHOR_OFFSET }}
        >
          <Eyebrow>{t.audienceEyebrow}</Eyebrow>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            {t.audiences.map((a) => (
              <div
                key={a.title}
                style={{
                  ...card,
                  padding: "22px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{a.title}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: BRAND.muted, margin: 0, flex: 1 }}>
                  {a.body}
                </p>
                {a.cta.appStore ? (
                  <a href={appStoreUrl(lang)} className="pp-focus" style={pillButton}>
                    {a.cta.label}
                  </a>
                ) : (
                  <Link
                    to={{ pathname: a.cta.href, search }}
                    className="pp-focus"
                    style={pillButton}
                  >
                    {a.cta.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 20, fontSize: 14 }}>
            <Link
              to={{ pathname: "/account/signin", search }}
              className="pp-focus"
              style={{
                color: BRAND.brown,
                textDecoration: "underline",
                textUnderlineOffset: 2,
                fontWeight: 600,
              }}
            >
              {t.businessSignin}
            </Link>
          </p>
        </section>

        {/* Closing call to action */}
        <section style={{ ...container, paddingTop: 8, paddingBottom: 56 }}>
          <div
            style={{
              background: BRAND.sand,
              borderRadius: 20,
              padding: "36px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 16,
            }}
          >
            <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
              {t.closing.title}
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: BRAND.brown }}>{t.closing.body}</p>
            <AppStoreBadge height={52} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
