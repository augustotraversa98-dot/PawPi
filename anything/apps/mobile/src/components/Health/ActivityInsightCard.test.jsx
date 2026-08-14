// E9 renderer contract: every server kind maps to POSITIVE copy, no kind renders a negative
// comparison, and the copy never contains shaming/negative-comparison language. Uses the real EN
// strings via a tiny resolver.

import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import { activityInsightText } from "./ActivityInsightCard";

function makeT(dict) {
  return (key, vars = {}) => {
    const val = key.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
    if (typeof val !== "string") throw new Error(`missing i18n key: ${key}`);
    return val.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
  };
}

const KINDS = [
  { kind: "cohort_top", params: { percentile: 80, breed: "Lab" } },
  { kind: "best_month", params: { walks: 5 } },
  { kind: "more_than_last", params: { diff: 2 } },
  { kind: "keep_going", params: {} },
  { kind: "gentle_nudge", params: {} },
];

// Negative-comparison / shaming language that must NEVER appear (EN + ES).
const BANNED = [
  "less active",
  "worse",
  "behind",
  "not enough",
  "lazy",
  "menos activo",
  "peor",
  "atras",
  "atrás",
  "vago",
];

describe("activityInsightText — positive only", () => {
  for (const dict of [en, es]) {
    const t = makeT(dict);
    for (const d of KINDS) {
      it(`${d.kind} renders positive copy in both locales`, () => {
        const text = activityInsightText(t, d, "Rex");
        expect(typeof text).toBe("string");
        const low = text.toLowerCase();
        for (const bad of BANNED) expect(low.includes(bad)).toBe(false);
      });
    }
  }

  it("returns null for an unknown/absent kind (renders nothing)", () => {
    expect(activityInsightText(makeT(en), null, "Rex")).toBeNull();
    expect(activityInsightText(makeT(en), { kind: "nope" }, "Rex")).toBeNull();
  });

  it("every kind has a disclaimer string present", () => {
    expect(en.activityInsight.disclaimer).toBeTruthy();
    expect(es.activityInsight.disclaimer).toBeTruthy();
  });
});
