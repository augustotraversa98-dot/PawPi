// The name we show for ANOTHER user is their real display name; if they haven't set one we
// show a neutral, localized fallback ("Pet parent" / "Dueño/a"). We never show a username or
// anything derived from an e-mail address (privacy, QA 2026-10-16 bug 04). The API also stops
// returning the e-mail-derived username as a name, this is the matching client rule.
export function ownerDisplayName(name, t) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed || t("common.petParent");
}
