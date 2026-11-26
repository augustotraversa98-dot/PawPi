import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  PET_PAGE_WRAP as wrap,
  OwnerContact,
  PetPageHeader,
  PetRow,
  phoneLink,
} from "@/components/publicPet/PetPageParts";
import { BRAND } from "@/lib/brand/tokens";
import { useDocumentHead } from "@/lib/legal/head";
import { PET_PAGE_COPY } from "@/lib/publicPet/copy";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";

// PUBLIC revocable vet card page (ticket 2.51) — a vet opens the link the owner shared. NO login.
// The DEFINER fn returns the scoped card (full|basic) ONLY while the link is non-revoked +
// non-expired; otherwise the API 404s and this page shows a clean "no longer valid" message.
// Non-diagnostic by design. EN + ES (lib/publicPet).

export default function PublicVetCardPage() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ok | invalid
  const [card, setCard] = useState(null);
  const { lang, setLang } = useVisitorLang();
  const copy = PET_PAGE_COPY[lang];
  const t = copy.card;
  useDocumentHead([{ title: t.documentTitle }]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/emergency/card/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!alive) return;
        setCard(d.card);
        setState("ok");
      })
      .catch(() => alive && setState("invalid"));
    return () => {
      alive = false;
    };
  }, [token]);

  const header = <PetPageHeader lang={lang} setLang={setLang} copy={copy} heading={t.heading} />;
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
  if (state === "invalid") {
    return (
      <div style={page}>
        <div style={wrap}>
          {header}
          <div data-testid="invalid-link" style={{ textAlign: "center", color: BRAND.muted }}>
            <h2 style={{ color: BRAND.brown, fontSize: 20, fontWeight: 800, margin: "16px 0 8px" }}>{t.invalidTitle}</h2>
            <p>{t.invalidBody}</p>
          </div>
        </div>
      </div>
    );
  }

  const pet = card.pet || {};
  const medical = card.medical;
  // The server leaves the emergency contact out when the finder setting is Relay or None: no rows then,
  // rather than a misleading "Not recorded".
  const sharesEmergencyContact =
    !!medical && ("emergency_contact_name" in medical || "emergency_contact_phone" in medical);
  const row = (label, value) => <PetRow label={label} value={value} emptyText={copy.notRecorded} />;

  return (
    <div style={page}>
      <div style={wrap}>
        {header}
        <div style={{ background: BRAND.card, borderRadius: 16, padding: 16, border: `1px solid ${BRAND.peach}` }}>
          <div style={{ textAlign: "center" }}>
            {pet.avatar_url ? (
              <img src={pet.avatar_url} alt={pet.name || t.petFallback} style={{ width: 110, height: 110, borderRadius: 55, objectFit: "cover" }} />
            ) : (
              <div aria-hidden="true" style={{ width: 110, height: 110, borderRadius: 55, background: BRAND.cream, margin: "0 auto", lineHeight: "110px", fontSize: 44 }}>🐶</div>
            )}
            <h1 style={{ color: BRAND.brown, margin: "8px 0 2px", fontSize: 26, fontWeight: 800 }}>{pet.name || t.petFallback}</h1>
          </div>
          <div style={{ marginTop: 12 }}>
            {row(copy.species, copy.speciesValues[String(pet.species || "").toLowerCase()] || pet.species)}
            {row(copy.breed, pet.breed)}
            {row(copy.microchip, card.microchip_id)}
          </div>

          <OwnerContact contact={card.contact} copy={copy} />

          {medical ? (
            <div data-testid="medical-section" style={{ marginTop: 16 }}>
              <h3 style={{ color: BRAND.brown, fontSize: 17, fontWeight: 800 }}>{t.medicalHeading}</h3>
              {row(copy.bloodType, medical.blood_type)}
              {row(copy.spayNeuter, copy.spayValues[medical.spayed_neutered_status] || medical.spayed_neutered_status)}
              {row(copy.allergies, (medical.allergies || []).map((a) => a.allergen).join(", "))}
              {row(copy.conditions, (medical.conditions || []).map((c) => c.condition).join(", "))}
              {row(t.medicalNotes, medical.medical_notes)}
              {row(t.primaryVet, medical.primary_vet_name)}
              {row(t.vetPhone, phoneLink(medical.vet_phone))}
              {sharesEmergencyContact ? (
                <>
                  {row(t.emergencyContact, medical.emergency_contact_name)}
                  {row(t.emergencyPhone, phoneLink(medical.emergency_contact_phone))}
                </>
              ) : null}
            </div>
          ) : (
            <p style={{ color: BRAND.muted, marginTop: 16 }}>{t.basicScope}</p>
          )}
        </div>
        <p style={{ color: BRAND.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>{copy.footer}</p>
      </div>
    </div>
  );
}
