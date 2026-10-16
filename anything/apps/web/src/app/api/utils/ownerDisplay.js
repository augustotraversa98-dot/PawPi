// Owner / user identity helpers — PRIVACY (QA 2026-10-16 bug 04).
//
// An e-mail address (or any part of it, e.g. its local-part) is private. It used to leak
// because new `user_profiles.username` values were derived from `email.split("@")[0]` and
// then shown to OTHER users as the owner's name ("by augusto+demo2"). Rules enforced here:
//
//   1. A username is NEVER derived from an e-mail address (see usernameBaseFor).
//   2. The name we show for another user is their real display name (`full_name`) when set;
//      otherwise the API returns null/"" and the client renders a localized neutral fallback
//      ("Pet parent" / "Dueño/a"). The `username` is never used as a display name.

// Base for a new username: a slug of the person's name, or a random neutral handle.
// Deliberately takes NO e-mail argument so it cannot be derived from one by mistake.
export function usernameBaseFor(fullName) {
  const slug =
    typeof fullName === "string"
      ? fullName
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "")
          .slice(0, 24)
      : "";
  if (slug.length >= 3) return slug;
  return `pawpi_${Math.random().toString(36).slice(2, 8)}`;
}

// The name safe to show other users: trimmed full_name, else null (never username/e-mail).
export function publicOwnerName(row) {
  const name = typeof row?.full_name === "string" ? row.full_name.trim() : "";
  return name || null;
}

// Append a short random suffix until `base` is free (bounded, with a timestamp fallback
// that guarantees termination). `exists(candidate)` reports whether it is already taken, so
// a duplicate username never surfaces as a raw duplicate-key 23505 → 500.
export async function uniqueUsername(base, exists) {
  if (!(await exists(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}_${Math.floor(Math.random() * 10000)}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}_${Date.now()}`;
}
