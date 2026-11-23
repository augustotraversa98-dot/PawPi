// The curriculum data keeps English as the FALLBACK; what users read comes from the `trainingUi`
// locale namespace addressed by the stable program/session keys. These pins make sure the two
// catalogs stay complete, in step with the data, and that stored ids never change.
import {
  TRAINING_PROGRAMS,
  completionId,
  difficultyLabel,
  programTitle,
  programSummary,
  sessionTitle,
  sessionObjective,
  sessionSteps,
  sessionTips,
} from "./trainingCurriculum";

const en = require("@/i18n/locales/en.json").trainingUi;
const es = require("@/i18n/locales/es.json").trainingUi;

const tFor = (catalog) => (key) =>
  key.split(".").reduce((o, part) => (o == null ? o : o[part]), { trainingUi: catalog }) ?? key;

describe("training curriculum localization", () => {
  test("stable ids are untouched (progress rows reference them)", () => {
    expect(completionId("puppy-essentials", "name-recognition")).toBe(
      "puppy-essentials/name-recognition",
    );
    expect(TRAINING_PROGRAMS.map((p) => p.key)).toEqual([
      "puppy-essentials",
      "basic-obedience",
      "leash-manners",
      "reliable-recall",
      "impulse-control",
      "socialization",
      "tricks",
      "senior-enrichment",
    ]);
    // difficulty stays the English enum on the data (it is a lookup key for badge colours).
    expect(TRAINING_PROGRAMS[0].difficulty).toBe("Beginner");
  });

  test("the English catalog mirrors the data exactly (no drift)", () => {
    const t = tFor(en);
    for (const p of TRAINING_PROGRAMS) {
      expect(programTitle(t, p)).toBe(p.title);
      expect(programSummary(t, p)).toBe(p.summary);
      for (const s of p.sessions) {
        expect(en.programs[p.key].sessions[s.key].title).toBe(s.title);
        expect(sessionObjective(t, p.key, s)).toBe(s.objective);
        expect(sessionSteps(t, p.key, s)).toEqual(s.steps);
        expect(sessionTips(t, p.key, s)).toEqual(s.tips);
      }
    }
  });

  test("every program, session, step and tip has a distinct Spanish translation", () => {
    const t = tFor(es);
    for (const p of TRAINING_PROGRAMS) {
      expect(programTitle(t, p)).not.toBe(p.title);
      expect(programSummary(t, p)).not.toBe(p.summary);
      for (const s of p.sessions) {
        expect(sessionTitle(t, p.key, s)).not.toBe(s.title);
        expect(sessionObjective(t, p.key, s)).not.toBe(s.objective);
        sessionSteps(t, p.key, s).forEach((x, i) => expect(x).not.toBe(s.steps[i]));
        sessionTips(t, p.key, s).forEach((x, i) => expect(x).not.toBe(s.tips[i]));
      }
    }
  });

  test("difficulty labels are localized", () => {
    const t = tFor(es);
    expect(difficultyLabel(t, "Beginner")).toBe("Principiante");
    expect(difficultyLabel(t, "Intermediate")).toBe("Intermedio");
    expect(difficultyLabel(t, "Advanced")).toBe("Avanzado");
  });

  test("falls back to the English data when a key is missing (never a raw key)", () => {
    const t = (key) => key; // i18next returns the key itself for a missing entry
    const p = TRAINING_PROGRAMS[0];
    expect(programTitle(t, p)).toBe(p.title);
    expect(sessionSteps(t, p.key, p.sessions[0])).toEqual(p.sessions[0].steps);
    expect(difficultyLabel(t, "Beginner")).toBe("Beginner");
  });
});
