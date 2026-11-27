// Keeps a record link's token across signing in, in this tab only. The sign-in address carries a one-off id, never the
// token, and each trip has its own, so two links signing in side by side never take each other's.

export const RETURN_PARAM = "return";
export const RETURN_KEY_PREFIX = "pawpi.recordLink.return.";

export const newReturnId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export const signInHref = (id) =>
  `/account/signin?callbackUrl=${encodeURIComponent(`/shared-record?${RETURN_PARAM}=${id}`)}`;

// Storage can be unavailable (private windows, blocked site data): the visitor then opens the link again.
export function keepReturnToken(id, token) {
  try {
    window.sessionStorage.setItem(RETURN_KEY_PREFIX + id, token);
  } catch {
    /* unavailable */
  }
}

/** The kept token, used once; null when there is none. */
export function takeReturnToken(id) {
  try {
    const key = RETURN_KEY_PREFIX + id;
    const token = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return token;
  } catch {
    return null;
  }
}
