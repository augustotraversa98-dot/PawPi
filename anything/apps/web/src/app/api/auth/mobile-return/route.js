import { getToken } from "@auth/core/jwt";

// GET /api/auth/mobile-return — the hand-back point for the system-browser Google flow.
//
// The mobile app opens the Google OAuth flow in the system browser (WebBrowser.openAuthSessionAsync)
// with this route as @auth/core's post-login callbackUrl. By the time the browser lands here the
// @auth/core session cookie is set, so we read the caller's session JWT (raw, the exact value the
// app stores + sends as a Bearer on every API call) and 302-redirect to the app's custom scheme,
// carrying the token. openAuthSessionAsync resolves the moment the browser is redirected to the
// pawpi:// URL, handing the deep link back to the app, which parses the token and stores it via the
// same useAuthStore path as email/password.
//
// This is NOT an @auth/core action (is-auth-action.ts), so the auth middleware passes it through.
//
// Open-redirect safety: we ONLY ever redirect to a custom app scheme (validated to start with the
// app scheme below), never to an arbitrary http(s) origin, so this can't be abused as an open
// redirect. The token travels solely OS→app over the custom scheme; no web server sees it.

const DEFAULT_RETURN = "pawpi://auth-callback";
const ALLOWED_SCHEME = "pawpi://";

function resolveReturnTarget(request) {
  try {
    const url = new URL(request.url);
    const requested = url.searchParams.get("return");
    if (requested && requested.startsWith(ALLOWED_SCHEME)) {
      return requested;
    }
  } catch {
    // fall through to the default
  }
  return DEFAULT_RETURN;
}

function redirectTo(target) {
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  const returnBase = resolveReturnTarget(request);

  // Same forwarded-proto handling as /api/auth/token — the raw request scheme is http behind
  // Railway's TLS terminator even on real https, so trust x-forwarded-proto first.
  const isSecure =
    process.env.AUTH_URL?.startsWith("https") ||
    request.headers.get("x-forwarded-proto") === "https" ||
    (request.url?.startsWith("https") ?? false);

  const [raw, jwt] = await Promise.all([
    getToken({ req: request, secret: process.env.AUTH_SECRET, secureCookie: isSecure, raw: true }),
    getToken({ req: request, secret: process.env.AUTH_SECRET, secureCookie: isSecure }),
  ]);

  const sep = returnBase.includes("?") ? "&" : "?";

  if (!jwt || !raw) {
    return redirectTo(`${returnBase}${sep}error=unauthorized`);
  }

  const params = new URLSearchParams({ token: raw });
  if (jwt.sub) params.set("uid", String(jwt.sub));
  if (jwt.email) params.set("email", String(jwt.email));
  if (jwt.name) params.set("name", String(jwt.name));

  return redirectTo(`${returnBase}${sep}${params.toString()}`);
}
