// Test helper: a react-i18next mock whose t() resolves against a REAL catalog with
// {{var}} interpolation. Screen tests can then assert real copy AND a mistyped or
// missing key fails loudly (it renders as the raw key). Usage:
//
//   jest.mock("react-i18next", () =>
//     require("@/i18n/testMock").makeReactI18nextMock());        // English
//   jest.mock("react-i18next", () =>
//     require("@/i18n/testMock").makeReactI18nextMock("es"));    // Spanish
//
// Pass "es" to prove a surface actually localizes rather than merely calling t()
// (an English-only catalog entry would pass an English-resolving test either way).
//
// Kept out of index.js so production code never pulls in the test resolver.
function makeReactI18nextMock(lang = "en") {
  const catalog =
    lang === "es" ? require("./locales/es.json") : require("./locales/en.json");
  const resolve = (k) =>
    k.split(".").reduce((o, part) => (o == null ? o : o[part]), catalog);
  return {
    useTranslation: () => ({
      t: (key, vars) => {
        let s = resolve(key);
        if (typeof s !== "string") return key;
        if (vars)
          for (const [name, val] of Object.entries(vars))
            s = s.replace(new RegExp(`{{${name}}}`, "g"), String(val));
        return s;
      },
    }),
  };
}

module.exports = { makeReactI18nextMock };
