// An es.json value identical to its en.json value is almost always an untranslated string that silently
// "works" (parity passes, the English text just ships to Spanish users). Anything legitimately identical —
// brand names, loanwords that are the same in Argentine Spanish, units, placeholders-only — is listed here
// with the reason. To add an entry you must be sure the Spanish copy really is the same word.
const en = require("./locales/en.json");
const es = require("./locales/es.json");

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const enFlat = flatten(en);
const esFlat = flatten(es);

// key -> why the Spanish value is legitimately the same as the English one.
const SAME_ON_PURPOSE = {
  "settings.english": "language name in its own language",
  "settings.spanish": "language name in its own language (Español)",
  "health.trackingAppleHealthName": "brand name",
  "health.trackingAppleWatchName": "brand name",
  "packStreaks.boop": "feature name",
  "common.error": "same word",
  "health.vetRecord.errorTitle": "same word (Error)",
  "health.feeding.errorTitle": "same word (Error)",
  "health.vetAppt.errorTitle": "same word (Error)",
  "health.addNote.errorTitle": "same word (Error)",
  "health.photoCheck.errorTitle": "same word (Error)",
  "onboarding.previewSaveErrorTitle": "same word (Error)",
  "feed.errorSaveTitle": "same word (Error)",
  "health.vetRecord.roleEditor": "same word (Editor)",
  "health.generalCheck.ok": "OK",
  "health.careRing.streakChip": "emoji + number only",
  "health.feeding.issueSubtitle": "placeholders only",
  "health.wellness.requiredField": "placeholder + asterisk only",
  "storefront.discountPct": "number format only",
  "leaderboard.xp": "XP unit",
  "bookingSummary.none": "em dash",
  "business.bookings.noPet": "em dash",
  "business.home.video": "same word (Video)",
  "community.category.General": "same word (General)",
  "booking.generalChip": "same word (General)",
  "routineCard.wellness.general": "same word (General)",
  "health.feeding.appetiteNormal": "same word (Normal)",
  "walkFeedback.level.normal": "same word (Normal)",
  "walkFeedback.paceOpt.normal": "same word (Normal)",
  "walkItem.paceNormal": "same word (normal)",
  "health.feeding.finishedNo": "same word (No)",
  "health.feeding.no": "same word (No)",
  "trackers.shared.no": "same word (No)",
  "trackers.shared.noLabel": "same word (No)",
  "trackers.shared.colorLabel": "same word (Color)",
  "trackers.poo.colorLabel": "same word (Color)",
  "trackers.pee.colorLabel": "same word (Color)",
  "trackers.foodWater.snacksLabel": "Argentine Spanish says 'snacks'",
  "trackers.weight.shape.ideal": "same word (Ideal)",
  "emergencyCard.microchip": "same word (Microchip)",
  "discover.placeCat.cafe": "same word (Cafés)",
  "weeklyDigest.emailToggle": "same word (Email)",
  "lifeStage.seniorShort": "Argentine Spanish says 'senior'",
  "trackers.walk.start.scheduledMinutes": "{{count}} min — same abbreviation",
  "trackers.walk.start.elapsedMinutes": "{{count}} min — same abbreviation",
  "walking.minutes_one": "{{count}} min — same abbreviation",
  "walking.minutes_other": "{{count}} min — same abbreviation",
  "walkItem.minutes_one": "1 min — same abbreviation",
  "walkItem.minutes_other": "{{count}} min — same abbreviation",
  "walkFeedback.minutes_one": "1 min — same abbreviation",
  "walkFeedback.minutes_other": "{{count}} min — same abbreviation",
  "sitting.videos_one": "🎥 {{count}} video — same word",
  "sitting.videos_other": "🎥 {{count}} videos — same word",
  "routinesUi.medicalCareIssue.no": "same word (No)",
  "screensUi.training.sessionMeta": "placeholders and the min abbreviation only",
  "healthUi.walkCountdownCard.summary": "placeholders and the min abbreviation only",
};

describe("es.json is actually translated", () => {
  test("no es value equals its en value unless allowlisted with a reason", () => {
    const identical = Object.keys(enFlat).filter(
      (k) => typeof enFlat[k] === "string" && enFlat[k] === esFlat[k] && enFlat[k].trim() !== "",
    );
    const untranslated = identical.filter((k) => !(k in SAME_ON_PURPOSE));
    expect(untranslated).toEqual([]);
  });

  test("the allowlist has no stale entries (every key is still identical in en and es)", () => {
    const stale = Object.keys(SAME_ON_PURPOSE).filter(
      (k) => !(k in enFlat) || !(k in esFlat) || enFlat[k] !== esFlat[k],
    );
    expect(stale).toEqual([]);
  });
});
