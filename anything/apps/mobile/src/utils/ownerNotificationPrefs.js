// ownerNotificationPrefs — SERVER-backed pet-owner notification preferences (notifications v2).
//
// GET/PUT /api/notification-prefs also carries the owner categories (today: the win-back EMAIL consent). The
// server only includes `owner_prefs` while its NOTIF_V2_ENABLED flag is on, so the absence of that key is how
// this app knows to hide the controls (no fake switch against a backend that ignores it). Never throws.

/**
 * @returns {Promise<Record<string, boolean> | null>} the owner prefs, or null when the server does not offer them
 */
export async function getOwnerNotificationPrefs() {
  try {
    const res = await fetch("/api/notification-prefs");
    if (!res.ok) return null;
    const data = await res.json();
    const owner = data && typeof data.owner_prefs === "object" ? data.owner_prefs : null;
    return owner && Object.keys(owner).length > 0 ? owner : null;
  } catch {
    return null;
  }
}

/**
 * Persist one owner category. Resolves true when the server accepted it.
 * @param {string} category
 * @param {boolean} enabled
 */
export async function setOwnerCategoryEnabled(category, enabled) {
  try {
    const res = await fetch("/api/notification-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, enabled: !!enabled }),
    });
    return !!res.ok;
  } catch {
    return false;
  }
}

// ── Quiet hours (notifications v2, PR 3c) ──────────────────────────────────────────────────────────────────
// While the owner's local clock is inside the window the SERVER does not ring their phone (the in-app inbox is
// unaffected). Default 22:00-08:00, on. The endpoint answers {skipped:"disabled"} while the server flag is off,
// which is how the app knows to hide the control (null here).

/** @returns {Promise<{enabled:boolean,start:number,end:number}|null>} */
export async function getQuietHours() {
  try {
    const res = await fetch("/api/notification-prefs/quiet-hours");
    if (!res.ok) return null;
    const d = await res.json();
    if (typeof d?.enabled !== "boolean" || !Number.isInteger(d.start) || !Number.isInteger(d.end)) return null;
    return { enabled: d.enabled, start: d.start, end: d.end };
  } catch {
    return null;
  }
}

/**
 * Persist a partial quiet-hours change ({enabled?, start?, end?}). Resolves the saved settings, or null on failure.
 */
export async function setQuietHours(patch) {
  try {
    const res = await fetch("/api/notification-prefs/quiet-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (typeof d?.enabled !== "boolean") return null;
    return { enabled: d.enabled, start: d.start, end: d.end };
  } catch {
    return null;
  }
}

/** "22" -> "22:00" (24-hour clock, as everywhere else in the app). */
export function formatHour(h) {
  return `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;
}
