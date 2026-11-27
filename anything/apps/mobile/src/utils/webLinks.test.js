import i18n from "@/i18n";
import { withAppLanguage } from "./webLinks";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

test.each([
  ["es", "https://www.pawpi.info/provider", "https://www.pawpi.info/provider?lang=es"],
  ["en", "https://www.pawpi.info/privacy", "https://www.pawpi.info/privacy?lang=en"],
  ["es", "https://www.pawpi.info/support?from=app", "https://www.pawpi.info/support?from=app&lang=es"],
  ["es", "https://www.pawpi.info/privacy?lang=en#data", "https://www.pawpi.info/privacy?lang=es#data"],
])("in %s, %s opens as %s", async (language, url, expected) => {
  await i18n.changeLanguage(language);
  expect(withAppLanguage(url)).toBe(expected);
});

test("no address stays no address", () => {
  expect(withAppLanguage("")).toBe("");
  expect(withAppLanguage(null)).toBeNull();
});
