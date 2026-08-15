import { Expo } from "expo-server-sdk";
import sql from "@/app/api/utils/sql";
import {
  CHANNEL_CLASS,
  channelClassForType,
  businessCategoryForType,
} from "@/app/api/utils/notificationCategories";

// BN2 PR1 — the server→phone REMOTE PUSH layer (expo-server-sdk).
//
// PawPi has only ever scheduled LOCAL reminders on-device; server events wrote the
// in-app bell (app_notify) but never rang the phone. This module adds the send side:
//   • sendPush(recipient, {title, body, data}) — resolve the recipient's Expo push
//     tokens (DEFINER reader, 0109) and send. NEVER throws; log-and-no-ops when there
//     are no tokens or the Expo client errors. iOS delivery stays dark until APNs
//     credentials are configured in EAS/Apple (see docs/night-run-log.md) — the send
//     itself still succeeds from our side; only Apple-side delivery is gated.
//   • pushForNotification({recipient, type, subjectRef, body}) — the POST-app_notify
//     hook: consult the channel catalog + the recipient's notification_prefs and push
//     per the BN2 rule (IN_APP_ONLY→never; PUSH→unless disabled; OPTIONAL_PUSH→only if
//     enabled). Wired from safeNotify() so every emitted bell row is considered.
//
// DEGRADE-CLEAN CONTRACT: this is a best-effort side-channel. A missing 0109 table/fn
// (unmigrated prod), an absent token, or an Expo outage must NEVER fail the underlying
// action or the bell insert. Every path is wrapped and returns quietly.

// One shared Expo client. The access token is OPTIONAL for Expo's push service; when
// EXPO_ACCESS_TOKEN is unset (the current state — no push creds yet) the client still
// constructs and sends, and delivery simply depends on the per-platform credentials
// configured at Expo/Apple. So an unset token is NOT an error here.
let expoClient = null;
function getExpo() {
  if (!expoClient) {
    expoClient = new Expo(
      process.env.EXPO_ACCESS_TOKEN
        ? { accessToken: process.env.EXPO_ACCESS_TOKEN }
        : {},
    );
  }
  return expoClient;
}

// Test seam: reset the memoized client (env changes between cases).
export function __resetExpoClientForTests() {
  expoClient = null;
}

// Resolve a recipient's valid Expo push tokens via the DEFINER reader (0109). The
// send hook runs in the ACTOR's request identity, which can't read the recipient's
// own-row device_push_tokens — the DEFINER function bypasses that. Degrades to [] if
// the table/function is absent (unmigrated).
export async function resolveRecipientTokens(recipient) {
  if (recipient == null) return [];
  let rows;
  try {
    rows = await sql`
      SELECT token, platform FROM app_recipient_push_tokens(${recipient})
    `;
  } catch (e) {
    // 42P01 undefined_table / 42883 undefined_function → feature not migrated yet.
    if (e?.code === "42P01" || e?.code === "42883") return [];
    throw e;
  }
  return (rows ?? [])
    .map((r) => r.token)
    .filter((t) => Expo.isExpoPushToken(t));
}

/**
 * Send an Expo push to every registered device of `recipient`. Never throws.
 * @returns {Promise<{sent:number, skipped?:string}>}
 */
export async function sendPush(recipient, { title, body, data } = {}) {
  try {
    const tokens = await resolveRecipientTokens(recipient);
    if (tokens.length === 0) {
      // No device token (or unmigrated) — nothing to deliver. This is the normal
      // state until users register tokens; log at debug volume, never error.
      console.log(`[sendPush] no push tokens for recipient ${recipient} — no-op`);
      return { sent: 0, skipped: "no-tokens" };
    }
    const messages = tokens.map((to) => ({
      to,
      title: title ?? "PawPi",
      body: body ?? "",
      data: data ?? {},
      sound: "default",
    }));
    const expo = getExpo();
    const chunks = expo.chunkPushNotifications(messages);
    let sent = 0;
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
        sent += chunk.length;
      } catch (err) {
        // A single failed chunk (e.g. APNs unconfigured) must not abort the rest.
        console.error("[sendPush] chunk send failed (non-fatal):", err?.message);
      }
    }
    return { sent };
  } catch (e) {
    console.error("[sendPush] non-fatal:", e?.message);
    return { sent: 0, skipped: "error" };
  }
}

/**
 * Decide whether a notification of `channelClass` should push, given the recipient's
 * stored pref (true/false/undefined-for-absent). Pure — unit-tested directly.
 */
export function decidePush(channelClass, prefEnabled) {
  if (channelClass === CHANNEL_CLASS.IN_APP_ONLY) return false;
  if (channelClass === CHANNEL_CLASS.OPTIONAL_PUSH) return prefEnabled === true;
  // PUSH: absent (undefined) or true → push; only an explicit false suppresses.
  return prefEnabled !== false;
}

/**
 * The post-app_notify hook. Called by safeNotify AFTER a bell row was created
 * (i.e. app_notify returned a non-null id — a self/disabled-category notify never
 * reaches here). Consults the catalog + the recipient's prefs and pushes per rule.
 * Never throws.
 */
export async function pushForNotification({ recipient, actor, type, subjectRef, body }) {
  try {
    const channelClass = channelClassForType(type);
    if (channelClass === CHANNEL_CLASS.IN_APP_ONLY) return { pushed: false };

    // OPTIONAL_PUSH is opt-IN: only push when the recipient explicitly enabled it.
    if (channelClass === CHANNEL_CLASS.OPTIONAL_PUSH) {
      const category = businessCategoryForType(type);
      let prefEnabled;
      if (category) {
        try {
          const rows = await sql`
            SELECT app_notification_pref_enabled(${recipient}, ${category}) AS enabled
          `;
          prefEnabled = rows?.[0]?.enabled ?? undefined;
        } catch (e) {
          if (e?.code !== "42P01" && e?.code !== "42883") throw e;
          prefEnabled = undefined; // unmigrated → treat as absent (OPTIONAL_PUSH ⇒ off)
        }
      }
      if (!decidePush(channelClass, prefEnabled)) return { pushed: false };
    }
    // For PUSH the DB gate (app_notify) already dropped the bell row when the
    // category was disabled, so reaching here means it's enabled — push.

    const locale = await resolveRecipientLocale(recipient);
    const { title, message } = renderPushContent(type, body, locale);
    const result = await sendPush(recipient, {
      title,
      body: message,
      data: { type, subjectRef: subjectRef ?? null },
    });
    return { pushed: (result?.sent ?? 0) > 0, ...result };
  } catch (e) {
    console.error("[pushForNotification] non-fatal:", e?.message);
    return { pushed: false, skipped: "error" };
  }
}

// Resolve the recipient's language for the push copy (0107 preferred_locale via the
// 0109 DEFINER reader). 'en' | 'es' | null; null → es-AR fallback (app-wide default).
async function resolveRecipientLocale(recipient) {
  try {
    const rows = await sql`SELECT app_recipient_locale(${recipient}) AS locale`;
    const loc = rows?.[0]?.locale;
    return loc === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

// ── Bilingual push copy (EN + ES) ────────────────────────────────────────────
// Push title/body are a server-rendered surface, so they honor the recipient's
// language. The in-app bell still renders its own richer localized string client-side
// from the JSON `body`; this is only the short phone-banner text. One template per
// pushable type; a generic fallback keeps an un-templated future type from crashing.
const PUSH_COPY = {
  walk_request_targeted: {
    en: { title: "New walk request", body: "A pet owner requested a walk." },
    es: { title: "Nueva solicitud de paseo", body: "Un dueño solicitó un paseo." },
  },
  walk_request_broadcast: {
    en: { title: "Walker needed nearby", body: "A pet owner is looking for a walker now." },
    es: { title: "Se busca paseador cerca", body: "Un dueño busca un paseador ahora." },
  },
};

const GENERIC_COPY = {
  en: { title: "PawPi", body: "You have a new notification." },
  es: { title: "PawPi", body: "Tenés una nueva notificación." },
};

/**
 * Render short bilingual push banner copy for a notification type. Pure — the
 * `body` JSON is available for future per-event detail; today the templates are
 * static so an absent/garbled body never breaks rendering.
 * @returns {{title:string, message:string}}
 */
export function renderPushContent(type, _body, locale = "es") {
  const lang = locale === "en" ? "en" : "es";
  const copy = (PUSH_COPY[type] ?? GENERIC_COPY)[lang] ?? GENERIC_COPY[lang];
  return { title: copy.title, message: copy.body };
}
