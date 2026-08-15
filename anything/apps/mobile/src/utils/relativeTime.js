// Relative-time formatter (Ticket 2.38; night-run A2b). Pure + now-injectable so it's
// deterministic in tests. Fed a post's created_at, it returns a short bucket
// ("just now", "5m", "1h", "yesterday", "3d") and a locale date for older posts.
//
// HONESTY: a missing/unparseable timestamp returns "" (empty) — callers render nothing rather
// than a fabricated "just now". Never fall back to a hardcoded time string at the call site.
//
// i18n (EN+ES guardrail): pass a translator to localize every bucket. The 2nd argument accepts
// either a number (the `now` epoch, back-compat) or an options object `{ now, t }` where `t` is
// react-i18next's translate fn. Without `t`, English literals are returned (back-compat for the
// pure unit tests + any untranslated caller). Keys live under `feed.*` in the locale files.
export function formatRelativeTime(input, nowOrOpts = Date.now()) {
  // Back-compat: 2nd arg may be the `now` epoch (number) or an options object.
  const opts =
    typeof nowOrOpts === "number" || nowOrOpts == null
      ? { now: nowOrOpts ?? Date.now() }
      : nowOrOpts;
  const now = opts.now ?? Date.now();
  const t = opts.t;

  // Localized label helper — uses `t` when provided, else the English literal fallback.
  const label = (key, enFallback, params) =>
    t ? t(`feed.${key}`, params) : enFallback;

  if (input == null || input === "") return "";
  const then = typeof input === "number" ? input : Date.parse(input);
  if (Number.isNaN(then)) return "";

  const diffMs = now - then;
  // Clock skew / future timestamps read as fresh rather than negative.
  if (diffMs < 0) return label("justNow", "just now");

  const min = Math.floor(diffMs / 60000);
  const hr = Math.floor(diffMs / 3600000);
  const day = Math.floor(diffMs / 86400000);

  if (min < 1) return label("justNow", "just now");
  if (min < 60) return label("minutesShort", `${min}m`, { count: min });
  if (hr < 24) return label("hoursShort", `${hr}h`, { count: hr });
  if (day === 1) return label("yesterday", "yesterday");
  if (day < 7) return label("daysShort", `${day}d`, { count: day });
  return new Date(then).toLocaleDateString();
}
