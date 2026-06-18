import { useEffect, useState } from "react";
import { useParams } from "react-router";

// PUBLIC pet tag page (ticket 2.51) — the permanent printed QR lands here. NO login, NO
// app-install wall. Renders ONLY the basic fields the DEFINER fn whitelisted (+ medical iff the
// owner enabled it). A stranger can relay a message to the owner (relay mode) or tap a direct
// phone/email when the owner chose to expose it. Non-diagnostic by design.

const C = {
  coral: "#FF6F61",
  cream: "#FFF7EF",
  card: "#FFFFFF",
  warm: "#3B241B",
  muted: "#7A6254",
  line: "#FFD9B3",
  danger: "#C2410C",
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

export default function PublicTagPage() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ok | notfound
  const [card, setCard] = useState(null);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

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

  const wrap = { maxWidth: 480, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" };

  if (state === "loading") {
    return <div style={{ ...wrap, color: C.muted }}>Loading…</div>;
  }
  if (state === "notfound") {
    return (
      <div style={{ ...wrap, textAlign: "center", color: C.muted }}>
        <h2 style={{ color: C.warm }}>Tag not active</h2>
        <p>This pet tag isn’t active right now.</p>
      </div>
    );
  }

  const pet = card.pet || {};
  const lost = card.lost;
  const contact = card.contact || {};
  const medical = card.medical;

  return (
    <div style={{ minHeight: "100vh", background: C.cream }}>
      <div style={wrap}>
        <div style={{ textAlign: "center", color: C.coral, fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
          🐾 PawPi
        </div>

        {lost && (
          <div
            data-testid="lost-banner"
            style={{ background: C.danger, color: "#fff", borderRadius: 12, padding: 12, marginBottom: 12, textAlign: "center", fontWeight: 700 }}
          >
            This pet is reported LOST
            {lost.reward ? ` · Reward: ${lost.reward}` : ""}
            {lost.last_seen_area ? ` · Last seen: ${lost.last_seen_area}` : ""}
          </div>
        )}

        <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}` }}>
          <div style={{ textAlign: "center" }}>
            {pet.avatar_url ? (
              <img src={pet.avatar_url} alt={pet.name} style={{ width: 120, height: 120, borderRadius: 60, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 120, height: 120, borderRadius: 60, background: C.cream, margin: "0 auto", lineHeight: "120px", fontSize: 48 }}>🐶</div>
            )}
            <h1 style={{ color: C.warm, margin: "8px 0 2px" }}>{pet.name || "This pet"}</h1>
            <p style={{ color: C.coral, fontWeight: 700, margin: 0 }}>This dog has a home 💛</p>
          </div>

          <div style={{ marginTop: 12 }}>
            <Row label="Species" value={pet.species} />
            <Row label="Breed" value={pet.breed} />
            <Row label="Microchip" value={card.microchip_id} />
          </div>

          {medical && (
            <div data-testid="medical-section" style={{ marginTop: 16 }}>
              <h3 style={{ color: C.warm }}>Medical (for a vet)</h3>
              <Row label="Blood type" value={medical.blood_type} />
              <Row label="Spay/neuter" value={medical.spayed_neutered_status} />
              <Row
                label="Allergies"
                value={(medical.allergies || []).map((a) => a.allergen).join(", ")}
              />
              <Row
                label="Conditions"
                value={(medical.conditions || []).map((c2) => c2.condition).join(", ")}
              />
              <Row label="Notes" value={medical.medical_notes} />
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            {contact.mode === "phone" && contact.value && (
              <a href={`tel:${contact.value}`} style={{ display: "block", textAlign: "center", background: C.coral, color: "#fff", padding: 12, borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>
                Call the owner
              </a>
            )}
            {contact.mode === "email" && contact.value && (
              <a href={`mailto:${contact.value}`} style={{ display: "block", textAlign: "center", background: C.coral, color: "#fff", padding: 12, borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>
                Email the owner
              </a>
            )}
            {contact.mode === "relay" &&
              (sent ? (
                <p data-testid="relay-sent" style={{ textAlign: "center", color: C.muted }}>
                  Thanks — the owner has been notified.
                </p>
              ) : (
                <div>
                  <textarea
                    data-testid="relay-message"
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    placeholder="Found this pet? Send the owner a message (e.g. where you are)."
                    style={{ width: "100%", minHeight: 72, borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, boxSizing: "border-box" }}
                  />
                  <button
                    data-testid="relay-send"
                    onClick={sendRelay}
                    style={{ marginTop: 8, width: "100%", background: C.coral, color: "#fff", padding: 12, borderRadius: 12, border: "none", fontWeight: 700 }}
                  >
                    Contact the owner
                  </button>
                </div>
              ))}
          </div>
        </div>

        <p style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>
          PawPi organizes a pet’s existing information for a real vet. It does not provide a diagnosis.
        </p>
      </div>
    </div>
  );
}
