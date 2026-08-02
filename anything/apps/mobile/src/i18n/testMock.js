// Test helper: a react-i18next mock whose t() resolves against the REAL English
// catalog with {{var}} interpolation. Screen tests can then assert English copy
// AND a mistyped/missing key fails loudly (it renders as the raw key). Usage:
//
//   jest.mock("react-i18next", () =>
//     require("@/i18n/testMock").makeReactI18nextMock());
//
// Kept out of index.js so production code never pulls in the test resolver.
function makeReactI18nextMock() {
  const en = require("./locales/en.json");
  const resolve = (k) =>
    k.split(".").reduce((o, part) => (o == null ? o : o[part]), en);
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
