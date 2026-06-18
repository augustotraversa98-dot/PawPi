import { useEffect, useState } from "react";
import { useParams } from "react-router";

// PUBLIC revocable vet card page (ticket 2.51) — a vet opens the link the owner shared. NO login.
// The DEFINER fn returns the scoped card (full|basic) ONLY while the link is non-revoked +
// non-expired; otherwise the API 404s and this page shows a clean "no longer valid" message.
// Non-diagnostic by design.

const C = {
  coral: "#FF6F61",
  cream: "#FFF7EF",
  card: "#FFFFFF",
  warm: "#3B241B",
  muted: "#7A6254",
  line: "#FFD9B3",
};

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
      <span style={{ color: C.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ color: C.warm, fontWeight: 700, textAlign: "right" }}>
        {value == null || value === "" ? "Not recorded" : value}
      </span>
    </div>
  );
}

export default function PublicVetCardPage() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ok | invalid
  const [card, setCard] = useState(null);

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

  const wrap = { maxWidth: 480, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" };

  if (state === "loading") {
    return <div style={{ ...wrap, color: C.muted }}>Loading…</div>;
  }
  if (state === "invalid") {
    return (
      <div data-testid="invalid-link" style={{ ...wrap, textAlign: "center", color: C.muted }}>
        <h2 style={{ color: C.warm }}>Link no longer valid</h2>
        <p>This emergency link has expired or was revoked by the owner.</p>
      </div>
    );
  }

  const pet = card.pet || {};
  const medical = card.medical;

  return (
    <div style={{ minHeight: "100vh", background: C.cream }}>
      <div style={wrap}>
        <div style={{ textAlign: "center", color: C.coral, fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
          🐾 PawPi · Emergency Card
        </div>
        <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}` }}>
          <div style={{ textAlign: "center" }}>
            {pet.avatar_url ? (
              <img src={pet.avatar_url} alt={pet.name} style={{ width: 110, height: 110, borderRadius: 55, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 110, height: 110, borderRadius: 55, background: C.cream, margin: "0 auto", lineHeight: "110px", fontSize: 44 }}>🐶</div>
            )}
            <h1 style={{ color: C.warm, margin: "8px 0 2px" }}>{pet.name || "Pet"}</h1>
          </div>
          <div style={{ marginTop: 12 }}>
            <Row label="Species" value={pet.species} />
            <Row label="Breed" value={pet.breed} />
            <Row label="Microchip" value={card.microchip_id} />
          </div>

          {medical ? (
            <div data-testid="medical-section" style={{ marginTop: 16 }}>
              <h3 style={{ color: C.warm }}>Medical</h3>
              <Row label="Blood type" value={medical.blood_type} />
              <Row label="Spay/neuter" value={medical.spayed_neutered_status} />
              <Row label="Allergies" value={(medical.allergies || []).map((a) => a.allergen).join(", ")} />
              <Row label="Conditions" value={(medical.conditions || []).map((c2) => c2.condition).join(", ")} />
              <Row label="Medical notes" value={medical.medical_notes} />
              <Row label="Primary vet" value={medical.primary_vet_name} />
              <Row label="Vet phone" value={medical.vet_phone} />
              <Row label="Emergency contact" value={medical.emergency_contact_name} />
              <Row label="Emergency phone" value={medical.emergency_contact_phone} />
            </div>
          ) : (
            <p style={{ color: C.muted, marginTop: 16 }}>This is a basic-scope link (no medical details).</p>
          )}
        </div>
        <p style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>
          PawPi organizes a pet’s existing information for a real vet. It does not provide a diagnosis.
        </p>
      </div>
    </div>
  );
}
