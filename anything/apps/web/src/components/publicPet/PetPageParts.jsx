// Pieces shared by the private-link pet pages (/p/tag, /p/card). Visual identity per pawpi-brand-kit: the
// supplied paw mark through BrandLockup (never an emoji), and the brand palette.
import BrandLockup from "@/components/brand/BrandLockup";
import { BRAND, FONT_MONO } from "@/lib/brand/tokens";
import { mailtoHref, telHref } from "@/lib/publicPet/finder";

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

export const PET_PAGE_BUTTON = {
  display: "block",
  textAlign: "center",
  background: BRAND.coral,
  color: "#fff",
  padding: 12,
  borderRadius: 12,
  textDecoration: "none",
  fontWeight: 700,
};

/** A tappable phone number (tel:), or the text as typed when it cannot be dialled. Nothing for an empty value. */
export function phoneLink(value) {
  if (!value) return null;
  const href = telHref(value);
  return href ? (
    <a href={href} style={{ color: BRAND.brown }}>
      {value}
    </a>
  ) : (
    value
  );
}

// The phone and / or email the family chose to publish. A card saved with the two switches (database 0152) sends
// `phone` and `email`; any other card sends one `value` for its `mode`.
function publishedChannels(contact) {
  const c = contact || {};
  const sent = "phone" in c || "email" in c ? [["phone", c.phone], ["email", c.email]] : [[c.mode, c.value]];
  // Relay and none render nothing — the server sends no value for them, and a value of the wrong kind is not shown.
  return sent.filter(
    ([kind, value]) =>
      !!value && (kind === "phone" || kind === "email") && (kind === "email") === String(value).includes("@"),
  );
}

export function OwnerContact({ contact, copy }) {
  const channels = publishedChannels(contact);
  if (channels.length === 0) return null;
  const t = copy.contact;
  return (
    <div data-testid="owner-contact" style={{ marginTop: 16 }}>
      <h3 style={{ color: BRAND.brown, fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{t.heading}</h3>
      {channels.map(([kind, value]) => {
        const isPhone = kind === "phone";
        const href = isPhone ? telHref(value) : mailtoHref(value);
        return (
          <div key={kind}>
            <PetRow
              label={isPhone ? t.phone : t.email}
              value={
                href ? (
                  <a href={href} style={{ color: BRAND.brown }}>
                    {value}
                  </a>
                ) : (
                  value
                )
              }
            />
            {href ? (
              <a href={href} style={{ ...PET_PAGE_BUTTON, marginTop: 10 }}>
                {isPhone ? t.call : t.write}
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// The medical profile's emergency contact on the public tag. The server sends it only when the owner turned on
// "Show my emergency contact on the pet tag" (default off).
export function EmergencyContact({ contact, copy }) {
  const name = contact?.name || null;
  const phone = contact?.phone || null;
  if (!name && !phone) return null;
  const href = phone ? telHref(phone) : null;
  const t = copy.kin;
  return (
    <div data-testid="emergency-contact" style={{ marginTop: 16 }}>
      <h3 style={{ color: BRAND.brown, fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{t.heading}</h3>
      {name ? <PetRow label={t.name} value={name} /> : null}
      {phone ? <PetRow label={t.phone} value={phoneLink(phone)} /> : null}
      {href ? (
        <a href={href} style={{ ...PET_PAGE_BUTTON, marginTop: 10 }}>
          {t.call}
        </a>
      ) : null}
    </div>
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
