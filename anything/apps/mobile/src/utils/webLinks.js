import { getI18n } from "react-i18next";

// For links the OWNER opens from the app to one of PawPi's own web pages: asks the page for the
// app's language (?lang=es|en), so a language chosen in the app is respected there too. Never use it
// for a link that is shared with, or shown to, someone else: that page follows its reader's language.
// Returns the address unchanged when the app's language is not known.
export function withAppLanguage(url) {
  if (!url) return url;
  let language;
  try {
    language = getI18n()?.language;
  } catch {
    return url;
  }
  if (!language) return url;
  const lang = String(language).toLowerCase().startsWith("en") ? "en" : "es";
  const [address, ...hash] = String(url).split("#");
  const [path, query = ""] = address.split("?");
  const params = query.split("&").filter((p) => p && !p.startsWith("lang="));
  params.push(`lang=${lang}`);
  return [`${path}?${params.join("&")}`, ...hash].join("#");
}
