import { providerTypeLabel } from "./providerTypeLabel";
const { makeReactI18nextMock } = require("@/i18n/testMock");

// Every value a business can carry: the server's capability list, plus the directory's "pet_friendly".
const TYPES = [
  "vet",
  "groomer",
  "walker",
  "daycare",
  "sitter",
  "trainer",
  "shop",
  "adoption",
  "transport",
  "pharmacy",
  "telehealth",
  "insurance",
  "pet_friendly",
];

describe.each(["en", "es"])("business type words (%s)", (lang) => {
  const { t } = makeReactI18nextMock(lang).useTranslation();
  const catalog = require(`@/i18n/locales/${lang}.json`).discover.cap;

  test.each(TYPES)("%s has its own words", (type) => {
    expect(catalog[type]).toBeTruthy();
    expect(providerTypeLabel(t, type)).toBe(catalog[type]);
    expect(providerTypeLabel(t, type)).not.toBe(type);
  });
});

test("Spanish words for the stored English ids", () => {
  const { t } = makeReactI18nextMock("es").useTranslation();
  expect(providerTypeLabel(t, "vet")).toBe("Veterinaria");
  expect(providerTypeLabel(t, "walker")).toBe("Paseos");
  expect(providerTypeLabel(t, "daycare")).toBe("Guardería");
  expect(providerTypeLabel(t, "shop")).toBe("Tienda");
});

test("an unknown value is shown as stored, tidied up; nothing for none", () => {
  const { t } = makeReactI18nextMock("es").useTranslation();
  expect(providerTypeLabel(t, "dog_spa")).toBe("Dog spa");
  expect(providerTypeLabel(t, "")).toBe("");
  expect(providerTypeLabel(t, null)).toBe("");
  expect(providerTypeLabel(t, undefined)).toBe("");
});
