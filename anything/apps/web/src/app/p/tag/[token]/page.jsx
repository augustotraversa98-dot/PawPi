import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { PET_PAGE_WRAP as wrap, PetPageHeader, PetRow } from "@/components/publicPet/PetPageParts";
import { BRAND } from "@/lib/brand/tokens";
import { useDocumentHead } from "@/lib/legal/head";
import { PET_PAGE_COPY } from "@/lib/publicPet/copy";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";

// PUBLIC pet tag page (ticket 2.51) — the permanent printed QR lands here. NO login, NO
// app-install wall. Renders ONLY the basic fields the DEFINER fn whitelisted (+ medical iff the
// owner enabled it). A stranger can relay a message to the owner (relay mode) or tap a direct
// phone/email when the owner chose to expose it. Non-diagnostic by design. EN + ES (lib/publicPet).

const LOST_RED = "#C2410C";

export default function PublicTagPage() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ok | notfound
  const [card, setCard] = useState(null);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const { lang, setLang } = useVisitorLang();
  const copy = PET_PAGE_COPY[lang];
  const t = copy.tag;
  useDocumentHead([{ title: t.documentTitle }]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/emergency/tag/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!alive) return;
        setCard(d.card);
        setState("ok");
      })
      .catch(() => alive && setState("notfound"));
    return () => {
      alive = false;
    };
  }, [token]);

  const sendRelay = async () => {
    try {
      await fetch(`/api/public/emergency/tag/${encodeURIComponent(token)}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
    } catch {
      // best-effort; still acknowledge
    }
    setSent(true);
  };

  const header = <PetPageHeader lang={lang} setLang={setLang} copy={copy} />;
  const page = { minHeight: "100vh", background: BRAND.cream };

  if (state === "loading") {
    return (
      <div style={page}>
        <div style={wrap}>
          {header}
          <p style={{ color: BRAND.muted, textAlign: "center" }}>{copy.loading}</p>
        </div>
      </div>
    );
  }
  if (state === "notfound") {
    return (
      <div style={page}>
        <div style={wrap}>
          {header}
          <div style={{ textAlign: "center", color: BRAND.muted }}>
            <h2 style={{ color: BRAND.brown, fontSize: 20, fontWeight: 800, margin: "16px 0 8px" }}>{t.notActiveTitle}</h2>
            <p>{t.notActiveBody}</p>
          </div>
        </div>
      </div>
    );
  }

  const pet = card.pet || {};
  const lost = card.lost;
  const contact = card.contact || {};
  const medical = card.medical;
  const row = (label, value) => <PetRow label={label} value={value} emptyText={copy.notRecorded} />;
  const contactLink = {
    display: "block",
    textAlign: "center",
    background: BRAND.coral,
    color: "#fff",
    padding: 12,
    borderRadius: 12,
    textDecoration: "none",
    fontWeight: 700,
  };

  return (
    <div style={page}>
      <div style={wrap}>
        {header}

        {lost && (
          <div
            data-testid="lost-banner"
            style={{ background: LOST_RED, color: "#fff", borderRadius: 12, padding: 12, marginBottom: 12, textAlign: "center", fontWeight: 700 }}
          >
            {[
              t.lost,
              lost.reward ? t.reward.replace("{value}", () => lost.reward) : null,
              lost.last_seen_area ? t.lastSeen.replace("{value}", () => lost.last_seen_area) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}

        <div style={{ background: BRAND.card, borderRadius: 16, padding: 16, border: `1px solid ${BRAND.peach}` }}>
          <div style={{ textAlign: "center" }}>
            {pet.avatar_url ? (
              <img src={pet.avatar_url} alt={pet.name || t.petFallback} style={{ width: 120, height: 120, borderRadius: 60, objectFit: "cover" }} />
            ) : (
              <div aria-hidden="true" style={{ width: 120, height: 120, borderRadius: 60, background: BRAND.cream, margin: "0 auto", lineHeight: "120px", fontSize: 48 }}>🐶</div>
            )}
            <h1 style={{ color: BRAND.brown, margin: "8px 0 2px", fontSize: 26, fontWeight: 800 }}>{pet.name || t.petFallback}</h1>
            <p style={{ color: BRAND.coral, fontWeight: 700, margin: 0 }}>{t.hasHome}</p>
          </div>

          <div style={{ marginTop: 12 }}>
            {row(copy.species, copy.speciesValues[String(pet.species || "").toLowerCase()] || pet.species)}
            {row(copy.breed, pet.breed)}
            {row(copy.microchip, card.microchip_id)}
          </div>

          {medical && (
            <div data-testid="medical-section" style={{ marginTop: 16 }}>
              <h3 style={{ color: BRAND.brown, fontSize: 17, fontWeight: 800 }}>{t.medicalHeading}</h3>
              {row(copy.bloodType, medical.blood_type)}
              {row(copy.spayNeuter, copy.spayValues[medical.spayed_neutered_status] || medical.spayed_neutered_status)}
              {row(copy.allergies, (medical.allergies || []).map((a) => a.allergen).join(", "))}
              {row(copy.conditions, (medical.conditions || []).map((c) => c.condition).join(", "))}
              {row(t.notes, medical.medical_notes)}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            {contact.mode === "phone" && contact.value && (
              <a href={`tel:${contact.value}`} style={contactLink}>
                {t.callOwner}
              </a>
            )}
            {contact.mode === "email" && contact.value && (
              <a href={`mailto:${contact.value}`} style={contactLink}>
                {t.emailOwner}
              </a>
            )}
            {contact.mode === "relay" &&
              (sent ? (
                <p data-testid="relay-sent" style={{ textAlign: "center", color: BRAND.muted }}>
                  {t.relaySent}
                </p>
              ) : (
                <div>
                  <label htmlFor="relay-message" style={{ display: "block", color: BRAND.brown, fontWeight: 700 }}>
                    {t.relayLabel}
                  </label>
                  <p id="relay-hint" style={{ color: BRAND.brown, fontSize: 14, margin: "4px 0 8px" }}>
                    {t.relayHint}
                  </p>
                  <textarea
                    id="relay-message"
                    data-testid="relay-message"
                    aria-describedby="relay-hint"
                    maxLength={500}
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    placeholder={t.relayPlaceholder}
                    style={{ width: "100%", minHeight: 96, borderRadius: 12, border: `1px solid ${BRAND.peach}`, padding: 10, boxSizing: "border-box", fontSize: 16, fontFamily: "inherit" }}
                  />
                  <button
                    data-testid="relay-send"
                    onClick={sendRelay}
                    style={{ marginTop: 8, width: "100%", background: BRAND.coral, color: "#fff", padding: 12, borderRadius: 12, border: "none", fontWeight: 700, cursor: "pointer" }}
                  >
                    {t.relaySend}
                  </button>
                </div>
              ))}
          </div>
        </div>

        <p style={{ color: BRAND.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>{copy.footer}</p>
      </div>
    </div>
  );
}
