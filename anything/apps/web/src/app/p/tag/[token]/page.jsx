import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  PET_PAGE_BUTTON,
  PET_PAGE_WRAP as wrap,
  EmergencyContact,
  OwnerContact,
  PetPageHeader,
  PetRow,
} from "@/components/publicPet/PetPageParts";
import { BRAND } from "@/lib/brand/tokens";
import { useDocumentHead } from "@/lib/legal/head";
import { PET_PAGE_COPY } from "@/lib/publicPet/copy";
import { FINDER_LIMITS, cleanFinderFields, finderContactError } from "@/lib/publicPet/finder";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";

// PUBLIC pet tag page (ticket 2.51) — the permanent printed QR lands here. NO login, NO
// app-install wall. Renders ONLY the basic fields the DEFINER fn whitelisted (+ medical iff the
// owner enabled it, + the emergency contact iff the owner enabled that). A stranger can tap the
// owner's phone/email when the owner chose to expose it; otherwise (relay mode, or phone/email
// with nothing saved) they can send a message with a phone or email so the family can answer.
// Non-diagnostic by design. EN + ES (lib/publicPet).

const LOST_RED = "#C2410C";

const ERROR_COPY = {
  contact_required: "errorContactRequired",
  invalid_phone: "errorPhone",
  invalid_email: "errorEmail",
  too_many: "errorTooMany",
  send_failed: "errorSend",
};

const FINDER_FIELDS = [
  { key: "name", label: "finderName", type: "text", autoComplete: "name", max: FINDER_LIMITS.name },
  { key: "phone", label: "finderPhone", type: "tel", autoComplete: "tel", max: FINDER_LIMITS.phone },
  { key: "email", label: "finderEmail", type: "email", autoComplete: "email", max: FINDER_LIMITS.email },
];

const INPUT = {
  width: "100%",
  borderRadius: 12,
  border: `1px solid ${BRAND.peach}`,
  padding: 10,
  boxSizing: "border-box",
  fontSize: 16,
  fontFamily: "inherit",
};

export default function PublicTagPage() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ok | notfound
  const [card, setCard] = useState(null);
  const [msg, setMsg] = useState("");
  const [finder, setFinder] = useState({ name: "", phone: "", email: "" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null); // a key of ERROR_COPY
  const inFlight = useRef(false);
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

  // "Sent" only when the server says so: a finder who reads "the family was told" stops trying.
  const sendRelay = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    const fields = cleanFinderFields({ ...finder, message: msg });
    const problem = finderContactError(fields);
    setError(problem);
    if (problem) return;
    inFlight.current = true;
    setSending(true);
    try {
      const response = await fetch(`/api/public/emergency/tag/${encodeURIComponent(token)}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fields.message,
          finderName: fields.name,
          finderPhone: fields.phone,
          finderEmail: fields.email,
        }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok === true) setSent(true);
      else if (response.status === 429) setError("too_many");
      else setError(ERROR_COPY[data?.error] ? data.error : "send_failed");
    } catch {
      setError("send_failed");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
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
  // The server says when the page takes messages. A database without 0146 does not say: only relay does.
  const takesMessages = contact.accepts_message ?? contact.mode === "relay";
  const medical = card.medical;
  const row = (label, value) => <PetRow label={label} value={value} emptyText={copy.notRecorded} />;

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

          <OwnerContact contact={contact} copy={copy} />
          <EmergencyContact contact={card.emergency_contact} copy={copy} />

          {takesMessages && (
            <div style={{ marginTop: 16 }}>
              {sent ? (
                <p data-testid="relay-sent" role="status" style={{ textAlign: "center", color: BRAND.muted }}>
                  {t.relaySent}
                </p>
              ) : (
                <form noValidate onSubmit={sendRelay}>
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
                    maxLength={FINDER_LIMITS.message}
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    placeholder={t.relayPlaceholder}
                    style={{ ...INPUT, minHeight: 96 }}
                  />
                  {FINDER_FIELDS.map((field) => (
                    <div key={field.key} style={{ marginTop: 10 }}>
                      <label htmlFor={`finder-${field.key}`} style={{ display: "block", color: BRAND.brown, fontWeight: 700, marginBottom: 4 }}>
                        {t[field.label]}
                      </label>
                      <input
                        id={`finder-${field.key}`}
                        data-testid={`finder-${field.key}`}
                        type={field.type}
                        autoComplete={field.autoComplete}
                        maxLength={field.max}
                        value={finder[field.key]}
                        onChange={(e) => {
                          const { value } = e.target;
                          setFinder((current) => ({ ...current, [field.key]: value }));
                          setError(null);
                        }}
                        aria-describedby={field.key === "name" ? undefined : "finder-needed"}
                        style={INPUT}
                      />
                    </div>
                  ))}
                  <p id="finder-needed" style={{ color: BRAND.brown, fontSize: 14, margin: "8px 0 0" }}>
                    {t.finderNeeded}
                  </p>
                  {error ? (
                    <p
                      data-testid="relay-error"
                      role="alert"
                      style={{ color: BRAND.brown, background: BRAND.cream, border: `2px solid ${BRAND.coral}`, borderRadius: 12, padding: 10, fontWeight: 700, margin: "8px 0 0" }}
                    >
                      {t[ERROR_COPY[error]]}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    data-testid="relay-send"
                    disabled={sending}
                    style={{ ...PET_PAGE_BUTTON, marginTop: 10, width: "100%", border: "none", cursor: "pointer", fontSize: 16, opacity: sending ? 0.6 : 1 }}
                  >
                    {sending ? t.relaySending : t.relaySend}
                  </button>
                  <p style={{ color: BRAND.muted, fontSize: 12, margin: "8px 0 0" }}>
                    {t.finderPrivacy}{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: BRAND.muted }}>
                      {t.privacyLink}
                    </a>
                  </p>
                </form>
              )}
            </div>
          )}
        </div>

        <p style={{ color: BRAND.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>{copy.footer}</p>
      </div>
    </div>
  );
}
