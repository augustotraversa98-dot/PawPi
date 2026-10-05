import sql from "@/app/api/utils/sql";
import { verifyUnsubscribeToken } from "@/app/api/utils/emailUnsubscribe";
import { isNotifV2Enabled } from "@/app/api/utils/notifV2";

// GET|POST /api/notification-prefs/email-unsubscribe?t=<signed token> — one-click unsubscribe for the
// win-back email (notifications v2, PR 3a). PUBLIC on purpose (clicked from an inbox, no session): the HMAC
// token is the credential, it names exactly one {profile, category}, and the only write is the DEFINER helper
// app_set_email_consent(user, 'winback_email', false). Re-clicking is harmless (idempotent).
//
//   GET  -> a tiny bilingual confirmation page (what a person sees after tapping the link)
//   POST -> 200 JSON (RFC 8058 "List-Unsubscribe-Post" one-click from mail clients)
//
// FLAG: does nothing (no query) unless NOTIF_V2_ENABLED is on — nothing sends these emails while it is off,
// so there is nothing to unsubscribe from. A bad/forged token -> 400 and no write.

const PAGE = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>PawPi</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FFF7EF;color:#3B241B;margin:0;padding:48px 24px;text-align:center">
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1><p style="font-size:16px;line-height:1.5;margin:0">${body}</p></body></html>`;

async function handle(request, wantsJson) {
  const url = new URL(request.url);
  const verified = verifyUnsubscribeToken(url.searchParams.get("t") ?? "");
  const fail = (status) =>
    wantsJson
      ? Response.json({ error: "Invalid unsubscribe link" }, { status })
      : new Response(
          PAGE(
            "This link is not valid · Este enlace no es válido",
            "Open PawPi → Settings → Notifications to change your email preferences.<br>Abrí PawPi → Ajustes → Notificaciones para cambiar tus preferencias de email.",
          ),
          { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
  if (!verified) return fail(400);

  if (isNotifV2Enabled()) {
    try {
      await sql`SELECT app_set_email_consent(${verified.userId}, ${verified.category}, false)`;
    } catch (e) {
      console.error("[email-unsubscribe] non-fatal:", e?.code ?? e?.message);
      // Schema not applied: nothing was ever sent under v2, so there is nothing to undo. Stay quiet.
    }
  }

  return wantsJson
    ? Response.json({ ok: true })
    : new Response(
        PAGE(
          "You're unsubscribed · Listo, ya no recibirás estos emails",
          "We won't send you come-back emails any more. You can turn them on again in the app.<br>No te vamos a mandar más emails de recordatorio. Podés volver a activarlos desde la app.",
        ),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
      );
}

async function GET(request) {
  return handle(request, false);
}
async function POST(request) {
  return handle(request, true);
}

export { GET, POST };
