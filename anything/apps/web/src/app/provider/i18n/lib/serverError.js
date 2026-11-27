import serverErrors from "../serverErrors";
import { fill } from "./format";

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The key of the dictionary entry whose English text is this message ({placeholders} match any value).
function lookup(messages, message) {
  for (const [key, template] of Object.entries(messages ?? {})) {
    const names = [];
    const pattern = template
      .split(/\{(\w+)\}/)
      .map((piece, i) => {
        if (i % 2 === 0) return escape(piece);
        names.push(piece);
        return "(.+?)";
      })
      .join("");
    const match = message.match(new RegExp(`^${pattern}$`));
    if (match) {
      return { key, values: Object.fromEntries(names.map((name, i) => [name, match[i + 1]])) };
    }
  }
  return null;
}

// The generic texts the server and our fetch helper use for a failure with nothing more to say.
const GENERIC = /^(Failed to |Request failed \()/;

/**
 * What to show for a failed request. English is the message as sent, else `fallback`. Spanish translates the
 * messages listed in `area.en.server` or the shared serverErrors dictionary, uses `fallback` for generic failures,
 * and shows any other message as sent.
 */
export function serverErrorMessage(error, lang, fallback, area) {
  const message = typeof error === "string" ? error : error?.message;
  if (!message) return fallback;
  if (lang !== "es") return message;
  for (const dictionary of [area && { en: area.en.server, es: area.es.server }, serverErrors]) {
    if (!dictionary) continue;
    const found = lookup(dictionary.en, message);
    if (found) return fill(dictionary.es[found.key], found.values);
  }
  return GENERIC.test(message) ? fallback : message;
}
