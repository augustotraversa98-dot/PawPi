// Pure text export of a Vet Summary (ticket 2.50). Produces a clean, shareable plain-text
// block (the "Share with vet" / "Export" payload) from the real aggregation + flags +
// owner's questions. Empty-safe. Non-diagnostic — it's a tracking summary, not a diagnosis.
import { normalizeWeightUnit } from "@/utils/weightUnitAlias";
import { getDisclaimer, quickCheckAreaLabel } from "./healthInsights";
import { tr } from "@/utils/healthText";
import { breedLabel } from "@/data/dogBreeds";

// Localized phrase helper; the English text is the fallback (identical to the pre-i18n copy).
const vt = (key, en, params) => tr(`healthDataUi.vetText.${key}`, en, params);

function fmtRange(range) {
  if (!range?.from || !range?.to) return "";
  return `${range.from} → ${range.to}`;
}

export function summaryToText(summary, flags = [], questions = []) {
  if (!summary) return "";
  const name = summary.pet?.name || vt("defaultName", "Pet");
  const L = [];
  L.push(vt("title", "PawPi Vet Summary — {{name}}", { name }));
  if (summary.pet?.breed) L.push(breedLabel((key) => tr(key), summary.pet.breed));
  L.push(vt("period", "Period: {{range}}", { range: fmtRange(summary.range) }));
  L.push("");

  const realFlags = (flags || []).filter(Boolean);
  if (realFlags.length > 0) {
    L.push(vt("worth", "Worth discussing with your vet:"));
    for (const f of realFlags) L.push(`• ${f.title}${f.detail ? ` — ${f.detail}` : ""}`);
    L.push("");
  }

  L.push(vt("logsHeader", "Logs in this period:"));
  L.push(
    `• ${vt("food", "Food logs: {{count}}", { count: summary.food?.count || 0 })}${
      summary.food?.lowAppetiteCount
        ? ` (${vt("lowAppetite", "{{count}} low appetite", { count: summary.food.lowAppetiteCount })})`
        : ""
    }`,
  );
  L.push(
    `• ${vt("stool", "Stool: {{count}}", { count: summary.poo?.count || 0 })}${
      summary.poo?.abnormalCount
        ? ` (${vt("abnormal", "{{count}} abnormal", { count: summary.poo.abnormalCount })})`
        : ""
    }`,
  );
  L.push(
    `• ${vt("urination", "Urination: {{count}}", { count: summary.pee?.count || 0 })}${
      summary.pee?.concernCount
        ? ` (${vt("withConcerns", "{{count}} with concerns", { count: summary.pee.concernCount })})`
        : ""
    }`,
  );
  L.push(`• ${vt("vomiting", "Vomiting episodes: {{count}}", { count: summary.vomit?.episodes || 0 })}`);
  if (summary.weight?.series?.length) {
    const s = summary.weight.series;
    L.push(
      `• ${vt(
        "weight",
        s.length > 1
          ? "Weight: {{first}} → {{last}} ({{count}} weigh-ins)"
          : "Weight: {{first}} → {{last}} ({{count}} weigh-in)",
        {
          first: `${s[0].weight}${normalizeWeightUnit(s[0].unit)}`,
          last: `${s[s.length - 1].weight}${normalizeWeightUnit(s[s.length - 1].unit)}`,
          count: s.length,
        },
      )}`,
    );
  }
  L.push(
    `• ${vt("walks", "Walks: {{count}} ({{minutes}} min)", {
      count: summary.walks?.count || 0,
      minutes: summary.walks?.totalMinutes || 0,
    })}`,
  );
  L.push(`• ${vt("photoChecks", "Photo checks: {{count}}", { count: summary.photoChecks?.count || 0 })}`);
  const gcAreas = summary.generalChecks?.areasChanged || [];
  L.push(
    `• ${
      gcAreas.length
        ? vt("quickChecksChanged", "Quick checks: {{count}} (changed: {{areas}})", {
            count: summary.generalChecks?.count || 0,
            areas: gcAreas.map(quickCheckAreaLabel).join(", "),
          })
        : vt("quickChecks", "Quick checks: {{count}}", { count: summary.generalChecks?.count || 0 })
    }`,
  );

  if ((summary.meds || []).length) {
    L.push("");
    L.push(vt("medsHeader", "Medications:"));
    for (const m of summary.meds) {
      L.push(
        `• ${m.name}${m.dose ? ` (${m.dose})` : ""}: ${vt(
          "dosesGiven",
          "{{given}}/{{total}} doses given",
          { given: m.given, total: m.total },
        )}`,
      );
    }
  }

  const cur = [
    ...(summary.conditions || []).map((c) => c.condition),
    ...(summary.allergies || []).map((a) =>
      tr("health.vetSummary.allergyLine", "Allergy: {{allergen}}", { allergen: a.allergen }),
    ),
  ].filter(Boolean);
  if (cur.length) {
    L.push("");
    L.push(vt("conditionsHeader", "Conditions & allergies:"));
    for (const c of cur) L.push(`• ${c}`);
  }

  const qs = (questions || []).map((q) => (q || "").trim()).filter(Boolean);
  if (qs.length) {
    L.push("");
    L.push(vt("questionsHeader", "Questions for the vet:"));
    for (const q of qs) L.push(`• ${q}`);
  }

  L.push("");
  L.push(getDisclaimer());
  return L.join("\n");
}
