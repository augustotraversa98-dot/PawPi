// E5 guardrail: NO notification copy shames the owner. The whole system celebrates the dog.
// This greps the source-of-truth locale strings (EN + ES) for the wanted-trigger categories,
// plus the reframed care-reminder generator, for guilt/shame language.
//
// NOTE: "misses" / "extraña" are deliberately NOT banned — the spec's approved warm dormant
// copy is exactly "Bella misses Rex" (a friend's real feeling), never "you haven't opened".

import fs from "fs";
import path from "path";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";

// Owner-shaming / guilt / chore-urgency language, EN + ES.
const BANNED = [
  "overdue",
  "you forgot",
  "forgot",
  "you didn't",
  "you haven't",
  "haven't opened",
  "neglect",
  "you failed",
  "disappointed",
  "bad owner",
  "you missed",
  "lazy",
  "you're sad",
  "is sad",
  // Spanish
  "olvidaste",
  "descuidaste",
  "no abriste",
  "no entraste",
  "vago",
  "mal dueño",
];

function collectStrings(obj, acc = []) {
  if (typeof obj === "string") {
    acc.push(obj);
  } else if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) collectStrings(v, acc);
  }
  return acc;
}

function assertClean(strings, where) {
  const lowered = strings.map((s) => s.toLowerCase());
  for (const bad of BANNED) {
    for (let i = 0; i < lowered.length; i++) {
      expect(
        lowered[i].includes(bad)
          ? `GUILT COPY in ${where}: "${strings[i]}" contains "${bad}"`
          : "clean",
      ).toBe("clean");
    }
  }
}

describe("no guilt/shame in engagement notification copy", () => {
  it("EN + ES engageNotif + notifPrefs are clean", () => {
    for (const [locale, dict] of [
      ["en", en],
      ["es", es],
    ]) {
      assertClean(collectStrings(dict.engageNotif), `${locale}.engageNotif`);
      assertClean(collectStrings(dict.notifPrefs), `${locale}.notifPrefs`);
    }
  });

  it("the daily-return re-engagement copy is warm, not guilt", () => {
    assertClean([en.gettingStarted.dailyReminderBody], "en.gettingStarted.dailyReminderBody");
    assertClean([es.gettingStarted.dailyReminderBody], "es.gettingStarted.dailyReminderBody");
  });

  it("the reframed care-reminder generator has no 'is overdue' user copy", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "notificationGenerator.js"),
      "utf8",
    );
    expect(src.includes("is overdue.")).toBe(false);
    expect(src.includes("is due now.")).toBe(false);
  });
});
