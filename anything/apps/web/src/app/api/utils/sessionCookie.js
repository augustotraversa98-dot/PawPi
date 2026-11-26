// SameSite for the Auth.js SESSION cookie (the CSRF and callback-url cookies are left as they were).
//
// Today, on https, the session cookie is SameSite=None: it was needed for the cross-site mobile WebView on the original
// platform. Lax is the stricter setting (the browser stops attaching the cookie to cross-site sub-requests and POSTs, while
// still sending it on ordinary top-level link navigations), but it has to be tried on real devices first: the mobile app's
// sign-in WebView, the system-browser Google flow and iOS Safari all handle cookies slightly differently. So it is opt-in:
//
//   AUTH_COOKIE_SAMESITE=lax   -> newly issued session cookies are SameSite=Lax
//   unset / anything else      -> unchanged (SameSite=None on https)
//
// Plain http (local / LAN development) is always Lax, as before (a non-Secure cookie cannot be SameSite=None).
// The flag only affects cookies issued after it is switched; an existing None cookie is replaced the next time Auth.js
// re-issues the session. Unsetting the flag reverts the same way.
export function resolveSessionCookieSameSite({ useSecure, env = process.env }) {
  if (!useSecure) return 'lax';
  return String(env.AUTH_COOKIE_SAMESITE ?? '').trim().toLowerCase() === 'lax' ? 'lax' : 'none';
}
