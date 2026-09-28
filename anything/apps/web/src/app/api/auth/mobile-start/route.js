// GET /api/auth/mobile-start?provider=google&return=pawpi://auth-callback
//
// Kicks off a web OAuth sign-in for the mobile app INSIDE the system browser. The mobile app
// opens this URL with WebBrowser.openAuthSessionAsync. It cannot open @auth/core's OAuth start
// directly because that start is a POST that needs a CSRF token whose cookie must live in the
// SAME browser that will later receive the OAuth callback (PKCE/state cookies). So this returns a
// tiny self-submitting page that, in the browser: fetches the CSRF token (setting the CSRF
// cookie), then POSTs to /api/auth/signin/<provider> with callbackUrl=/api/auth/mobile-return.
// After the provider round-trip, @auth/core lands on /api/auth/mobile-return, which 302s to the
// app's pawpi:// scheme with the session token.
//
// This is NOT an @auth/core action (is-auth-action.ts) so the auth middleware passes it through.
// No secrets are emitted; the CSRF token is fetched client-side by the browser itself.

// Only providers we actually wire as web OAuth in __create/index.ts. Apple is native (no browser
// start), so it is intentionally not allowed here.
const ALLOWED_PROVIDERS = new Set(["google"]);
const ALLOWED_SCHEME = "pawpi://";
const DEFAULT_RETURN = "pawpi://auth-callback";

// Escape a value for safe embedding inside an inline <script> (prevents a </script> breakout).
function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function GET(request) {
  let provider = "google";
  let returnTarget = DEFAULT_RETURN;
  try {
    const url = new URL(request.url);
    const p = url.searchParams.get("provider");
    if (p) provider = p;
    const r = url.searchParams.get("return");
    if (r && r.startsWith(ALLOWED_SCHEME)) returnTarget = r;
  } catch {
    // use defaults
  }

  if (!ALLOWED_PROVIDERS.has(provider)) {
    return new Response("Unsupported provider", { status: 400 });
  }

  const callbackUrl = `/api/auth/mobile-return?return=${encodeURIComponent(returnTarget)}`;

  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Signing in…</title></head>
  <body>
    <p>Signing in…</p>
    <form id="f" method="POST" action="/api/auth/signin/${provider}">
      <input type="hidden" name="csrfToken" />
      <input type="hidden" name="callbackUrl" />
    </form>
    <script>
      (function () {
        var provider = ${inlineJson(provider)};
        var callbackUrl = ${inlineJson(callbackUrl)};
        var form = document.getElementById("f");
        form.callbackUrl.value = callbackUrl;
        fetch("/api/auth/csrf", { credentials: "include", headers: { Accept: "application/json" } })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            form.csrfToken.value = (data && data.csrfToken) || "";
            form.submit();
          })
          .catch(function () {
            document.body.innerHTML = "<p>Could not start sign-in. Please try again.</p>";
          });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
