// Pure text export of a Vet Summary (ticket 2.50). Produces a clean, shareable plain-text
// block (the "Share with vet" / "Export" payload) from the real aggregation + flags +
// owner's questions. Empty-safe. Non-diagnostic — it's a tracking summary, not a diagnosis.
import { DISCLAIMER, quickCheckAreaLabel } from "./healthInsights";

function fmtRange(range) {
  if (!range?.from || !range?.to) return "";
  return `${range.from} → ${range.to}`;
}

export function summaryToText(summary, flags = [], questions = []) {
  if (!summary) return "";
  const name = summary.pet?.name || "Pet";
  const L = [];
  L.push(`PawPi Vet Summary — ${name}`);
  if (summary.pet?.breed) L.push(summary.pet.breed);
  L.push(`Period: ${fmtRange(summary.range)}`);
  L.push("");

  const realFlags = (flags || []).filter(Boolean);
  if (realFlags.length > 0) {
    L.push("Worth discussing with your vet:");
    for (const f of realFlags) L.push(`• ${f.title}${f.detail ? ` — ${f.detail}` : ""}`);
    L.push("");
  }

  L.push("Logs in this period:");
  L.push(`• Food logs: ${summary.food?.count || 0}${summary.food?.lowAppetiteCount ? ` (${summary.food.lowAppetiteCount} low appetite)` : ""}`);
  L.push(`• Stool: ${summary.poo?.count || 0}${summary.poo?.abnormalCount ? ` (${summary.poo.abnormalCount} abnormal)` : ""}`);
  L.push(`• Urination: ${summary.pee?.count || 0}${summary.pee?.concernCount ? ` (${summary.pee.concernCount} with concerns)` : ""}`);
  L.push(`• Vomiting episodes: ${summary.vomit?.episodes || 0}`);
  if (summary.weight?.series?.length) {
    const s = summary.weight.series;
    L.push(`• Weight: ${s[0].weight}${s[0].unit} → ${s[s.length - 1].weight}${s[s.length - 1].unit} (${s.length} weigh-in${s.length > 1 ? "s" : ""})`);
  }
  L.push(`• Walks: ${summary.walks?.count || 0} (${summary.walks?.totalMinutes || 0} min)`);
  L.push(`• Photo checks: ${summary.photoChecks?.count || 0}`);
  const gcAreas = summary.generalChecks?.areasChanged || [];
  L.push(
    `• Quick checks: ${summary.generalChecks?.count || 0}${
      gcAreas.length ? ` (changed: ${gcAreas.map(quickCheckAreaLabel).join(", ")})` : ""
    }`,
  );

  if ((summary.meds || []).length) {
    L.push("");
    L.push("Medications:");
    for (const m of summary.meds) {
      L.push(`• ${m.name}${m.dose ? ` (${m.dose})` : ""}: ${m.given}/${m.total} doses given`);
    }
  }

  const cur = [
    ...(summary.conditions || []).map((c) => c.condition),
    ...(summary.allergies || []).map((a) => `Allergy: ${a.allergen}`),
  ].filter(Boolean);
  if (cur.length) {
    L.push("");
    L.push("Conditions & allergies:");
    for (const c of cur) L.push(`• ${c}`);
  }

  const qs = (questions || []).map((q) => (q || "").trim()).filter(Boolean);
  if (qs.length) {
    L.push("");
    L.push("Questions for the vet:");
    for (const q of qs) L.push(`• ${q}`);
  }

  L.push("");
  L.push(DISCLAIMER);
  return L.join("\n");
}
