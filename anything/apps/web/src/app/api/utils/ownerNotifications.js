import sql from "@/app/api/utils/sql";
import { isNotifV2Enabled, softV2 } from "@/app/api/utils/notifV2";
import { sendPush } from "@/app/api/utils/push";
import { ownerCategoryDefault } from "@/app/api/utils/ownerNotificationCategories";

// Notifications v2 — the PET-OWNER push pipeline (docs/notifications-v2-design.md).
//
// PR 3b: the weekly digest and the win-back become a real phone push, but ONLY for owners who explicitly opted in
// (App Store guideline 4.5.4: promotional pushes need opt-in). PR 3c adds the transactional events, quiet hours
// and the daily cap to this same pipeline.
//
// Contract: NEVER throws; does nothing (and issues no query) unless NOTIF_V2_ENABLED is on. The in-app bell row is
// written by the caller BEFORE this runs — a suppressed push never loses the in-app notification.

// notification type -> { category (notification_prefs key), promotional }
export const OWNER_PUSH_TYPES = {
  weekly_digest: { category: "weekly_digest_push", promotional: true },
  winback: { category: "winback_push", promotional: true },
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

const COPY = {
  weekly_digest: {
    en: (n) => ({ title: `${n}'s week 🐾`, body: "Your weekly recap is ready whenever you are." }),
    es: (n) => ({ title: `La semana de ${n} 🐾`, body: "Tu resumen semanal está listo cuando quieras." }),
  },
  winback: {
    en: (n) => ({ title: `${n} says hi 🐾`, body: "Something nice is waiting for you in PawPi." }),
    es: (n) => ({ title: `${n} te manda un saludo 🐾`, body: "Hay algo lindo esperándote en PawPi." }),
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

/**
 * Push one owner notification if (and only if) the flag is on and the owner's preference allows it.
 * @returns {Promise<{pushed:boolean, skipped?:string, sent?:number}>}
 */
export async function pushForOwnerNotification({ recipient, type, subjectRef = null, petName = null }) {
  try {
    if (!isNotifV2Enabled()) return { pushed: false, skipped: "disabled" };
    const info = ownerPushTypeInfo(type);
    if (!info || recipient == null) return { pushed: false, skipped: "not-an-owner-push-type" };

    const pref = await readPref(recipient, info.category);
    if (!decideOwnerPush(info, pref)) return { pushed: false, skipped: "pref" };

    const locale = await readLocale(recipient);
    const { title, body } = renderOwnerPushContent(type, locale, { petName });
    const result = await sendPush(
      recipient,
      { title, body, data: { type, subjectRef } },
      { type, category: info.category, subjectRef, cap: null },
    );
    return { pushed: (result?.sent ?? 0) > 0, ...result };
  } catch (e) {
    console.error("[pushForOwnerNotification] non-fatal:", e?.message);
    return { pushed: false, skipped: "error" };
  }
}
