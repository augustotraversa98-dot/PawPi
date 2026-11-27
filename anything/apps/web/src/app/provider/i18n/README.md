# Words of the provider panel

Spanish (es-AR, voseo) and English. The viewer's language is chosen by `src/lib/publicPet/lang.js`, the same rule
as the public pet pages and the vet invite page: `?lang=` → the choice made with the ES / EN switch → the browser's
first language (`en*` is English, anything else is Spanish). No business or account setting takes part.

## Layout

| Path | What |
| --- | --- |
| `<area>.js` | One dictionary per area, `export default { en, es }`. Every `.js` file here (not in a subfolder) is a dictionary. |
| `lib/useProviderCopy.js` | `const { t, lang } = useProviderCopy(areaCopy);` |
| `lib/format.js` | `fill`, `plural`, `formatNumber`, `formatMoney`, `formatDate`, `formatTime`, `formatDateTime`, `formatMonth`. |
| `lib/labels.js` | Names of stored values: business types, offerings, sections, roles, booking statuses (`offerings.js`). |
| `lib/serverError.js` | `serverErrorMessage(error, lang, fallback, areaCopy)` for anything the API sends back. |
| `shared.js` | Uploaders, "Advanced", weekdays, opening hours, amount and duration errors. |
| `pending/*.json` | Files not translated yet, if any (every file is translated today). The lists only shrink. |

## Translating a file

1. Add or extend `<area>.js`. `en` is the wording the screen has today, unchanged. `es` is Argentine Spanish
   (voseo: "podés", "elegí", "tu negocio"). Plurals are `{ one, other }` with `{count}`. Words that are the same in
   both languages are listed in `export const SAME_IN_BOTH = ["a.key"];`. Strings only, no functions.
2. In the component: `const { t, lang } = useProviderCopy(areaCopy);`, then `t.some.key`, `fill(...)`, `plural(...)`.
   Plain modules take `lang` as an argument and default to `"en"`.
3. Dates, numbers and money go through `lib/format.js` (es-AR, `dd/MM/yyyy`, 24 h). `shared.js` has the weekdays;
   `lib/hours.js` and `lib/money.js` take `lang` (pass it: they default to English).
4. Stored values (`status`, `role`, `capability`) stay as they are in code and requests; translate only what is shown,
   with `lib/labels.js`. A CSS `capitalize` class on such a value applies to English only.
5. Toasts, `confirm()` / `prompt()` texts, `aria-label`, `placeholder`, `alt` and fallbacks such as `|| "Pet"` are
   copy too. Replace `error?.message || "…"` with `serverErrorMessage(error, lang, t.…, areaCopy)` and list the
   messages that screen can receive under `server` in both languages (`en` = the server's exact text; `{name}`
   matches a variable part).
6. A form rule's message should be a dictionary key, looked up at render, so a shown error follows the switch.
7. Keep text out of state that outlives a language switch.
8. Remove the file from your list in `pending/`. Delete an empty list. Do not edit another slice's list.
9. Existing tests run with an English browser and keep passing unchanged. Add Spanish tests
   (see `components/panelSpanish.test.jsx`):
   `vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["es-AR"]);`

## Guards

- `dictionaries.test.js`: same keys and placeholders in both languages, nothing empty or left in English.
- `hardcodedEnglish.test.js`: no text a person reads outside a dictionary, in any file not listed in `pending/`.
  For a string nobody reads, add `i18n-ok: <reason>` in a comment on the line or the one above.

`src/lib/vetInvite/copy.js` is an older bilingual dictionary that predates this folder.
