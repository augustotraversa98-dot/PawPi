import sql from "@/app/api/utils/sql";
import { isNotifV2Enabled, softV2, dailyPushCap } from "@/app/api/utils/notifV2";
import { sendPush } from "@/app/api/utils/push";
import { ownerCategoryDefault } from "@/app/api/utils/ownerNotificationCategories";
import { isInQuietHours, normalizeQuietSettings } from "@/app/api/utils/quietHours";

// Notifications v2 — the PET-OWNER push pipeline (docs/notifications-v2-design.md).
//
// PR 3b: the weekly digest and the win-back become a real phone push, but ONLY for owners who explicitly opted in
// (App Store guideline 4.5.4: promotional pushes need opt-in). PR 3c adds the transactional events, quiet hours
// and the daily cap to this same pipeline.
//
// Contract: NEVER throws; does nothing (and issues no query) unless NOTIF_V2_ENABLED is on. The in-app bell row is
// written by the caller BEFORE this runs — a suppressed push never loses the in-app notification.

// notification type -> { category (notification_prefs key), promotional }
//   PROMOTIONAL (PR 3b): opt-in, default OFF.   TRANSACTIONAL (PR 3c): default ON, the owner can switch a category off.
export const OWNER_PUSH_TYPES = {
  weekly_digest: { category: "weekly_digest_push", promotional: true },
  winback: { category: "winback_push", promotional: true },
  booking_confirmed: { category: "owner_bookings", promotional: false },
  booking_declined: { category: "owner_bookings", promotional: false },
  booking_cancelled: { category: "owner_bookings", promotional: false },
  adoption_approved: { category: "owner_adoption", promotional: false },
  adoption_declined: { category: "owner_adoption", promotional: false },
  walk_request_accepted: { category: "owner_walk_requests", promotional: false },
  lost_alert: { category: "owner_lost_alerts", promotional: false },
};

export function ownerPushTypeInfo(type) {
  return Object.prototype.hasOwnProperty.call(OWNER_PUSH_TYPES, type) ? OWNER_PUSH_TYPES[type] : null;
}

/**
 * Pure decision: may this owner notification ring the phone, given the stored preference
 * (true / false / undefined-for-absent)? Promotional categories need an explicit true; transactional ones ring
 * unless explicitly off.
 */
export function decideOwnerPush({ promotional }, prefEnabled) {
  if (prefEnabled === true) return true;
  if (prefEnabled === false) return false;
  return promotional ? false : true; // absent: promotional OFF, transactional ON
}

// Positive, plain, no guilt and no health claims. es-AR voseo.
const COPY = {
  weekly_digest: {
    en: (n) => ({ title: `${n}'s week 🐾`, body: "Your weekly recap is ready whenever you are." }),
    es: (n) => ({ title: `La semana de ${n} 🐾`, body: "Tu resumen semanal está listo cuando quieras." }),
  },
  winback: {
    en: (n) => ({ title: `${n} says hi 🐾`, body: "Something nice is waiting for you in PawPi." }),
    es: (n) => ({ title: `${n} te manda un saludo 🐾`, body: "Hay algo lindo esperándote en PawPi." }),
  },
  booking_confirmed: {
    en: () => ({ title: "Booking confirmed ✅", body: "Your booking is confirmed. Tap to see the details." }),
    es: () => ({ title: "Reserva confirmada ✅", body: "Tu reserva está confirmada. Tocá para ver los detalles." }),
  },
  booking_declined: {
    en: () => ({ title: "An update on your booking", body: "This booking couldn't go ahead. You can pick another time or provider." }),
    es: () => ({ title: "Novedades de tu reserva", body: "Esta reserva no pudo concretarse. Podés elegir otro horario u otro proveedor." }),
  },
  booking_cancelled: {
    en: () => ({ title: "Booking cancelled", body: "A booking was cancelled. Tap to see what's next." }),
    es: () => ({ title: "Reserva cancelada", body: "Se canceló una reserva. Tocá para ver cómo seguir." }),
  },
  adoption_approved: {
    en: () => ({ title: "Good news about your application 🐾", body: "Your adoption application was approved. Tap to see the next steps." }),
    es: () => ({ title: "Buenas noticias sobre tu solicitud 🐾", body: "Tu solicitud de adopción fue aprobada. Tocá para ver los próximos pasos." }),
  },
  adoption_declined: {
    en: () => ({ title: "An update on your application", body: "Your adoption application wasn't selected this time. Tap to read the message." }),
    es: () => ({ title: "Novedades de tu solicitud", body: "Esta vez tu solicitud de adopción no fue seleccionada. Tocá para leer el mensaje." }),
  },
  walk_request_accepted: {
    en: () => ({ title: "A walker said yes 🐕", body: "A walker accepted your request. Tap to see the details." }),
    es: () => ({ title: "Un paseador dijo que sí 🐕", body: "Un paseador aceptó tu solicitud. Tocá para ver los detalles." }),
  },
  lost_alert: {
    en: () => ({ title: "Lost pet alert", body: "There's news about a lost pet. Tap to see the details." }),
    es: () => ({ title: "Alerta de mascota perdida", body: "Hay novedades sobre una mascota perdida. Tocá para ver los detalles." }),
  },
};

/** Short bilingual banner copy for an owner notification. Pure. Positive, no guilt, no health claims. */
export function renderOwnerPushContent(type, locale, { petName } = {}) {
  const lang = locale === "en" ? "en" : "es";
  const entry = COPY[type];
  if (!entry) {
    return lang === "en"
      ? { title: "PawPi", body: "You have a new notification." }
      : { title: "PawPi", body: "Tenés una nueva notificación." };
  }
  const name = (petName && String(petName).trim()) || (lang === "en" ? "Your pup" : "Tu compañero");
  return entry[lang](name);
}

async function readPref(recipient, category) {
  return softV2(async () => {
    const rows = await sql`SELECT app_notification_pref_enabled(${recipient}, ${category}) AS enabled`;
    const v = rows?.[0]?.enabled;
    return typeof v === "boolean" ? v : undefined;
  }, ownerCategoryDefault(category) ? true : undefined);
}

async function readLocale(recipient) {
  return softV2(async () => {
    const rows = await sql`SELECT app_recipient_locale(${recipient}) AS locale`;
    return rows?.[0]?.locale === "en" ? "en" : "es";
  }, "es");
}

// Recipient's quiet-hours settings + zone via the DEFINER reader (0132). Table missing / DB trouble → the defaults
// (22:00-08:00, enabled) with no stored zone (America/Buenos_Aires fallback), i.e. quiet hours still apply.
async function readQuietSettings(recipient) {
  return softV2(
    async () => {
      const rows = await sql`SELECT * FROM app_recipient_notification_settings(${recipient})`;
      const row = rows?.[0];
      return { settings: normalizeQuietSettings(row), timezone: row?.timezone ?? null };
    },
    { settings: normalizeQuietSettings(null), timezone: null },
  );
}

/**
 * Push one owner notification if (and only if) the flag is on and the owner's rules allow it:
 *   category preference (promotional = opt-in) → quiet hours (owner-local) → valid token → daily cap.
 * Quiet hours / cap / opt-out only stop the PHONE; the in-app bell row is always written by the caller first.
 * @returns {Promise<{pushed:boolean, skipped?:string, sent?:number}>}
 */
export async function pushForOwnerNotification({ recipient, type, subjectRef = null, petName = null, now = new Date() }) {
  try {
    if (!isNotifV2Enabled()) return { pushed: false, skipped: "disabled" };
    const info = ownerPushTypeInfo(type);
    if (!info || recipient == null) return { pushed: false, skipped: "not-an-owner-push-type" };

    const pref = await readPref(recipient, info.category);
    if (!decideOwnerPush(info, pref)) return { pushed: false, skipped: "pref" };

    const { settings, timezone } = await readQuietSettings(recipient);
    if (isInQuietHours(settings, timezone, now)) return { pushed: false, skipped: "quiet-hours" };

    const locale = await readLocale(recipient);
    const { title, body } = renderOwnerPushContent(type, locale, { petName });
    // The cap is enforced atomically inside sendPush, only AFTER a valid token exists (no slot is spent on a push
    // that cannot be delivered).
    const result = await sendPush(
      recipient,
      { title, body, data: { type, subjectRef } },
      { type, category: info.category, subjectRef, cap: dailyPushCap() },
    );
    return { pushed: (result?.sent ?? 0) > 0, ...result };
  } catch (e) {
    console.error("[pushForOwnerNotification] non-fatal:", e?.message);
    return { pushed: false, skipped: "error" };
  }
}
