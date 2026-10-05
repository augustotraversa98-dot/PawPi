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
