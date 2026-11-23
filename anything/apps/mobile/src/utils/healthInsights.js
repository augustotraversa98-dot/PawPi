// Health intelligence (ticket 2.50 Part B) — PURE, rule/statistical trend detection over the
// Vet Summary aggregation. NO LLM, NO diagnosis: every flag is framed as "worth mentioning to
// your vet". Empty-safe: thin data yields NO flags (never invented findings).
//
// Thresholds are deliberately conservative defaults; tune later. All inputs come from the
// /api/vet-record/full-summary aggregation shape.

import { tr } from "@/utils/healthText";

const SEVERITY = { INFO: "info", NOTABLE: "notable" };

// Localized phrase helper: English text is the fallback (identical to the pre-i18n copy).
const ins = (key, en, params) => tr(`healthDataUi.insights.${key}`, en, params);

// Human labels for the Quick Check area keys stored in the `areas` jsonb (eyes, ears, teeth,
// skin, paws, face, mood, energy). QUICK_CHECK_AREA_LABELS is the English fallback table;
// quickCheckAreaLabel() resolves the localized label by key.
export const QUICK_CHECK_AREA_LABELS = {
  eyes: "Eyes",
  ears: "Ears",
  teeth: "Teeth & mouth",
  skin: "Skin & fur",
  paws: "Paws",
  face: "Face",
  mood: "Mood",
  energy: "Energy",
};
export const quickCheckAreaLabel = (key) =>
  QUICK_CHECK_AREA_LABELS[key]
    ? ins(`areas.${key}`, QUICK_CHECK_AREA_LABELS[key])
    : key;

const petFallback = () => tr("routineCard.yourPet", "Your pet");

// How much data counts as "enough" to bother surfacing trends at all.
export function hasEnoughData(summary) {
  if (!summary) return false;
  const n =
    (summary.food?.count || 0) +
    (summary.poo?.count || 0) +
    (summary.pee?.count || 0) +
    (summary.vomit?.events?.length || 0) +
    (summary.weight?.series?.length || 0) +
    (summary.walks?.count || 0) +
    (summary.wellness?.count || 0) +
    (summary.generalChecks?.count || 0) +
    (summary.photoChecks?.count || 0);
  return n >= 5;
}

// Percent change first→last of the weight series (null if <2 points).
export function weightChangePct(series) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const first = series[0]?.weight;
  const last = series[series.length - 1]?.weight;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return ((last - first) / first) * 100;
}

/**
 * Detect non-diagnostic flags from the summary. Returns [] when there isn't enough data or
 * nothing crosses a threshold. Each flag: { key, severity, title, detail }.
 */
export function detectHealthFlags(summary) {
  if (!summary) return [];
  const flags = [];
  const name = summary.pet?.name || petFallback();

  // Quick Check ("general check") changes are DIRECT owner-reported observations, not
  // statistical trends — surface them even when there isn't otherwise much data yet.
  const areasChanged = summary.generalChecks?.areasChanged || [];
  if (areasChanged.length > 0) {
    const labels = areasChanged.map(quickCheckAreaLabel);
    flags.push({
      key: "quick-check-changes",
      severity: SEVERITY.NOTABLE,
      title:
        labels.length === 1
          ? ins("quickCheckOneTitle", "Quick Check: {{area}} looked different", {
              area: labels[0].toLowerCase(),
            })
          : ins("quickCheckManyTitle", "Quick Check flagged {{count}} areas", {
              count: labels.length,
            }),
      detail:
        labels.length > 1
          ? ins(
              "quickCheckDetail",
              '{{labels}} were marked "changed" during a Quick Check this period.',
              { count: labels.length, labels: labels.join(", ") },
            )
          : ins(
              "quickCheckDetail",
              '{{labels}} was marked "changed" during a Quick Check this period.',
              { count: labels.length, labels: labels.join(", ") },
            ),
    });
  }

  // The statistical/threshold trends below only make sense with enough data.
  if (!hasEnoughData(summary)) return flags;

  // Weight trend — a >=5% loss or >=10% gain across the range is worth a mention.
  const pct = weightChangePct(summary.weight?.series);
  if (pct != null) {
    if (pct <= -5) {
      flags.push({
        key: "weight-loss",
        severity: SEVERITY.NOTABLE,
        title: ins("weightLossTitle", "Weight is trending down"),
        detail: ins(
          "weightLossDetail",
          "{{name}}'s logged weight dropped about {{pct}}% over this period.",
          { name, pct: Math.abs(pct).toFixed(0) },
        ),
      });
    } else if (pct >= 10) {
      flags.push({
        key: "weight-gain",
        severity: SEVERITY.INFO,
        title: ins("weightGainTitle", "Weight is trending up"),
        detail: ins(
          "weightGainDetail",
          "{{name}}'s logged weight rose about {{pct}}% over this period.",
          { name, pct: pct.toFixed(0) },
        ),
      });
    }
  }

  // Vomiting frequency.
  const episodes = summary.vomit?.episodes || 0;
  if (episodes >= 3) {
    flags.push({
      key: "vomiting",
      severity: SEVERITY.NOTABLE,
      title: ins("vomitingTitle", "Repeated vomiting logged"),
      detail: ins(
        "vomitingDetail",
        "{{count}} vomiting episodes were recorded in this period.",
        { count: episodes },
      ),
    });
  }

  // Abnormal stool (blood / mucus / straining).
  const abnormalPoo = summary.poo?.abnormalCount || 0;
  if (abnormalPoo >= 3) {
    flags.push({
      key: "stool",
      severity: SEVERITY.NOTABLE,
      title: ins("stoolTitle", "Several abnormal stool entries"),
      detail: ins(
        "stoolDetail",
        "{{count}} stool logs noted blood, mucus, or straining.",
        { count: abnormalPoo },
      ),
    });
  }

  // Urinary concerns.
  const peeConcern = summary.pee?.concernCount || 0;
  if (peeConcern >= 2) {
    flags.push({
      key: "urinary",
      severity: SEVERITY.NOTABLE,
      title: ins("urinaryTitle", "Urinary changes logged"),
      detail: ins(
        "urinaryDetail",
        "{{count}} urination logs noted difficulty, pain, blood, or increased thirst.",
        { count: peeConcern },
      ),
    });
  }

  // Appetite drift.
  const lowAppetite = summary.food?.lowAppetiteCount || 0;
  if (lowAppetite >= 3) {
    flags.push({
      key: "appetite",
      severity: SEVERITY.INFO,
      title: ins("appetiteTitle", "Reduced appetite noted"),
      detail: ins(
        "appetiteDetail",
        "{{count}} feeding logs noted low or reduced appetite.",
        { count: lowAppetite },
      ),
    });
  }

  // Medication adherence — any missed dose is worth flagging.
  for (const m of summary.meds || []) {
    if ((m.missed || 0) > 0 && (m.total || 0) > 0) {
      const pctGiven = Math.round((m.given / m.total) * 100);
      flags.push({
        key: `med-${m.name}`,
        severity: SEVERITY.INFO,
        title: ins(
          "medMissedTitle",
          m.missed > 1
            ? "{{name}}: {{count}} missed doses"
            : "{{name}}: {{count}} missed dose",
          { name: m.name, count: m.missed },
        ),
        detail: ins(
          "medAdherenceDetail",
          "{{pct}}% adherence ({{given}}/{{total}} doses given).",
          { pct: pctGiven, given: m.given, total: m.total },
        ),
      });
    }
  }

  return flags;
}

/**
 * A friendly, RULE-BASED recap paragraph (the always-works baseline; an env-gated LLM recap
 * can replace this server-side without changing the UI). Empty-safe + never diagnostic.
 */
export function buildRecap(summary, flags) {
  const name = summary?.pet?.name || petFallback();
  if (!hasEnoughData(summary)) {
    return ins(
      "recapNotEnough",
      "There isn't quite enough logged yet to spot trends for {{name}}. Keep logging daily and the insights will sharpen over time.",
      { name },
    );
  }
  if (!flags || flags.length === 0) {
    return ins(
      "recapNothing",
      "Nothing notable stood out in {{name}}'s logs for this period — a good baseline to share with your vet. Keep up the daily tracking.",
      { name },
    );
  }
  const titles = flags.map((f) => f.title.toLowerCase());
  return ins(
    "recapSome",
    "A few things in {{name}}'s logs may be worth mentioning at your next visit: {{titles}}. This is a tracking aid, not a diagnosis — your vet can interpret what it means.",
    { name, titles: titles.join("; ") },
  );
}

// English text (kept as an export for back-compat); render with getDisclaimer() so it localizes.
export const DISCLAIMER =
  "PawPi helps you track changes and prepare better conversations with your veterinarian. It does not diagnose or replace professional veterinary care.";
export const getDisclaimer = () => tr("health.disclaimer", DISCLAIMER);
