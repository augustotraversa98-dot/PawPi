// Keeps the Terms acceptance of someone who continued with Google, Apple or Microsoft on the website. Those sign-ins
// leave the page and come back signed in, so the click is remembered in this browser and written once the session
// exists. (The email sign-up form records its own.) Never blocks anything.
import { useEffect } from "react";
import { useSession } from "@auth/create/react";

const KEY = "pawpi.socialTermsClickedAt";
// Long enough to finish at the provider; an abandoned attempt is forgotten.
const FRESH_MS = 10 * 60 * 1000;

export function rememberSocialConsent() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // private window or blocked storage: nothing to remember
  }
}

// The remembered click, taken once.
function takeRememberedClick() {
  try {
    const at = Number(window.localStorage.getItem(KEY));
    window.localStorage.removeItem(KEY);
    return at > 0 && Date.now() - at < FRESH_MS;
  } catch {
    return false;
  }
}

export default function RecordSocialConsent() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated" || !takeRememberedClick()) return;
    fetch("/api/legal/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ source: "web_social" }),
    }).catch(() => console.warn("[consent] could not record the Terms acceptance"));
  }, [status]);
  return null;
}
