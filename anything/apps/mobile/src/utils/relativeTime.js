// Relative-time formatter (Ticket 2.38). Pure + now-injectable so it's
// deterministic in tests. Fed a post's created_at, it returns a short bucket
// ("just now", "5m", "1h", "yesterday", "3d") and a locale date for older posts.
export function formatRelativeTime(input, now = Date.now()) {
  if (input == null || input === "") return "";
  const then = typeof input === "number" ? input : Date.parse(input);
  if (Number.isNaN(then)) return "";

  const diffMs = now - then;
  // Clock skew / future timestamps read as fresh rather than negative.
  if (diffMs < 0) return "just now";

  const min = Math.floor(diffMs / 60000);
  const hr = Math.floor(diffMs / 3600000);
  const day = Math.floor(diffMs / 86400000);

  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  if (hr < 24) return `${hr}h`;
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d`;
  return new Date(then).toLocaleDateString();
}
