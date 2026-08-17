import { Link } from "react-router";
import SiteHeader from "@/components/brand/SiteHeader";
import SiteFooter from "@/components/brand/SiteFooter";
import PawMark from "@/components/brand/PawMark";
import { useLang } from "@/lib/legal/useLang";
import { useDocumentHead, useBrandFonts, usePublicChrome } from "@/lib/legal/head";
import { buildHomeMeta } from "@/lib/home/meta";
import { BRAND, FONT_MONO, FONT_SANS } from "@/lib/brand/tokens";

const TITLES = {
  es: "PawPi — Tu perro. Toda su vida, en un solo lugar.",
  en: "PawPi — Your dog's whole life. In one place.",
};
const DESCRIPTIONS = {
  es: "La súper-app para personas con perros: feed social, salud, rutinas, comunidad, adopción y servicios — todo en un solo lugar.",
  en: "The all-in-one app for dog people: a social feed, health, routines, community, adoption, and services — all in one place.",
};

const COPY = {
  es: {
    heroTitle: ["Tu perro.", "Toda su vida, en un solo lugar."],
    heroSub:
      "La súper-app para personas con perros: feed social, salud, rutinas, comunidad, adopción y servicios — todo en un solo lugar.",
    comingSoon: "Próximamente en el App Store",
    featuresEyebrow: "Qué es PawPi",
    features: [
      ["Feed y perfiles", "Momentos diarios, paws, barks y amigos caninos."],
      ["Salud", "Seguimiento, recordatorios, historia clínica y turnos veterinarios."],
      ["Comunidad y adopción", "Eventos, meetups y perros en adopción."],
      ["Servicios", "Paseadores, veterinarias, pet shops y transporte de mascotas."],
    ],
    audienceEyebrow: "Para quién es",
    audiences: [
      {
        title: "Dueños de perros",
        body: "Organizá la vida de tu perro y descubrí lugares, servicios y comunidad.",
        cta: null,
      },
      {
        title: "Paseadores y proveedores",
        body: "Sumá tu servicio y llegá a más dueños cerca tuyo.",
        cta: { label: "Sumate", href: "/account/signup" },
      },
      {
        title: "Veterinarias y negocios",
        body: "Publicá tu negocio y gestioná reservas y clientes en un solo lugar.",
        cta: { label: "Listá tu negocio", href: "/account/signup" },
      },
    ],
    businessSignin: "¿Ya tenés una cuenta de negocio? Iniciá sesión",
  },
  en: {
    heroTitle: ["Your dog's whole life.", "In one place."],
    heroSub:
      "The all-in-one app for dog people: a social feed, health, routines, community, adoption, and services — all in one place.",
    comingSoon: "Coming soon on the App Store",
    featuresEyebrow: "What PawPi is",
    features: [
      ["Feed & profiles", "Daily moments, paws, barks, and dog friends."],
      ["Health", "Tracking, reminders, vet records, and appointments."],
      ["Community & adoption", "Events, meetups, and dogs up for adoption."],
      ["Services", "Walkers, vets, pet shops, and pet transport."],
    ],
    audienceEyebrow: "Who it's for",
    audiences: [
      {
        title: "Dog owners",
        body: "Organize your dog's whole life and discover places, services, and community.",
        cta: null,
      },
      {
        title: "Walkers & providers",
        body: "List your service and reach more owners near you.",
        cta: { label: "Join", href: "/account/signup" },
      },
      {
        title: "Vets & businesses",
        body: "List your business and manage bookings and clients in one place.",
        cta: { label: "List your business", href: "/account/signup" },
      },
    ],
    businessSignin: "Already have a business account? Sign in",
  },
};

function Eyebrow({ children }) {
  return (
    <p
      style={{
        fontFamily: FONT_MONO,
        textTransform: "uppercase",
        letterSpacing: "0.18em",
        fontSize: 11,
        color: BRAND.muted,
        margin: "0 0 12px",
      }}
    >
      {children}
    </p>
  );
}

export default function HomePage() {
  const { lang } = useLang();
  const t = COPY[lang];
  const search = lang === "en" ? "?lang=en" : "";

  useBrandFonts();
  usePublicChrome();
  useDocumentHead(
    buildHomeMeta({ search, titles: TITLES, descriptions: DESCRIPTIONS }),
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
        {/* Hero */}
        <section
          style={{
            maxWidth: 880,
            margin: "0 auto",
            padding: "64px 20px 40px",
            textAlign: "center",
          }}
        >
          <PawMark width={72} color={BRAND.coral} style={{ margin: "0 auto 24px" }} />
          <h1
            style={{
              fontSize: "clamp(34px, 6vw, 56px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              margin: "0 0 18px",
            }}
          >
            {t.heroTitle[0]}
            <br />
            {t.heroTitle[1]}
          </h1>
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.6,
              color: BRAND.muted,
              maxWidth: 620,
              margin: "0 auto 28px",
            }}
          >
            {t.heroSub}
          </p>
          {/* Honest App Store CTA — coming soon, never a dead link. */}
          <span
            aria-disabled="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: BRAND.coral,
              color: BRAND.white,
              fontWeight: 800,
              fontSize: 16,
              padding: "13px 24px",
              borderRadius: 999,
              cursor: "default",
              userSelect: "none",
            }}
          >
             {t.comingSoon}
          </span>
        </section>

        {/* What PawPi is — feature strip */}
        <section style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px" }}>
          <Eyebrow>{t.featuresEyebrow}</Eyebrow>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {t.features.map(([title, body]) => (
              <div
                key={title}
                style={{
                  background: BRAND.card,
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 20,
                  padding: "20px 18px",
                }}
              >
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 6px" }}>{title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: BRAND.muted, margin: 0 }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for — audience entry points */}
        <section style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 8px" }}>
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
                  background: BRAND.card,
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 20,
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
                {a.cta ? (
                  <Link
                    to={{ pathname: a.cta.href, search }}
                    style={{
                      alignSelf: "flex-start",
                      background: BRAND.coral,
                      color: BRAND.white,
                      fontWeight: 700,
                      fontSize: 14.5,
                      padding: "10px 18px",
                      borderRadius: 999,
                      textDecoration: "none",
                    }}
                  >
                    {a.cta.label}
                  </Link>
                ) : (
                  <span
                    style={{
                      alignSelf: "flex-start",
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: BRAND.muted,
                    }}
                  >
                    {t.comingSoon}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 20, fontSize: 14 }}>
            <Link
              to={{ pathname: "/account/signin", search }}
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
      </main>

      <SiteFooter />
    </div>
  );
}
