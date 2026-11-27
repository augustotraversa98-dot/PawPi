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

// The Auth.js session cookie, under its https and http names, including the .0/.1 parts of a large one.
const SESSION_COOKIE_NAME = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

// Set-Cookie values that remove whatever session a request arrived with.
export function expiredSessionCookies(cookieHeader) {
  return String(cookieHeader ?? '')
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => SESSION_COOKIE_NAME.test(name))
    .map((name) => `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${name.startsWith('__Secure-') ? '; Secure' : ''}`);
}

// The cookies Auth.js sets only once it has accepted a sign-in request (its CSRF check passed) and is sending the
// browser to Google, Apple or Microsoft.
const PROVIDER_FLOW_COOKIE = /^(__Secure-)?authjs\.(state|nonce|pkce\.code_verifier)=[^;]/;

// Auth.js links a newly chosen Google / Apple / Microsoft account to whoever is already signed in in that browser, and
// PawPi has no "link another account" feature: a shared or switched account would silently join the earlier person's.
// So every such sign-in, from the app or the website, begins with NO session. The phone's browser keeps one even after
// the app logs out. Register on /api/auth/signin/*.
export function endSessionOnProviderSignIn() {
  return async (c, next) => {
    await next();
    if (c.req.method !== 'POST' || !c.res.headers.getSetCookie().some((v) => PROVIDER_FLOW_COOKIE.test(v))) return;
    for (const cookie of expiredSessionCookies(c.req.header('cookie'))) c.res.headers.append('Set-Cookie', cookie);
  };
}
