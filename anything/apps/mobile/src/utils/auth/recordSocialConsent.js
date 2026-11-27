// Someone continued with Apple or Google under the "by continuing, you agree" line (SocialSignInButtons): keep that
// acceptance on the server. The email sign-up form records its own. Never blocks or fails the sign-in: the account
// already exists by now, so a failed write is retried once and then only logged.
//
// The token is passed in explicitly because this runs while the new session is still being stored.
export async function recordSocialConsent(jwt) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/legal/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ source: "mobile_social" }),
      });
      if (res.ok) return true;
    } catch {
      // network error: fall through to the retry
    }
  }
  console.warn("[consent] could not record the Terms acceptance");
  return false;
}
