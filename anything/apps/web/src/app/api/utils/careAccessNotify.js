// Tells a provider's team that an owner gave or ended access to a dog's record (docs/vet-sharing-design.md).
//
// One bell row (+ the business push, see notificationCategories) per active staff member of the provider, never the
// person acting. `subject_ref` is the PET id. `body` is a plain sentence in the RECIPIENT's language (es-AR voseo / en)
// naming the owner (display name only), the dog and, for a grant, how long it lasts: never anything from the record,
// nor which parts of it were shared. App builds that do not know the type print `body` as the message.
//
// NEVER throws, and every statement runs in a savepoint, so it can never fail the share or the revoke it follows.

import sql from "./sql";
import { withSavepoint } from "./requestContext";
import { safeNotifyIsolated } from "./notify";
import { publicOwnerName } from "./ownerDisplay";
import { resolveTimezone } from "./timezone";

const COPY = {
  care_access_granted: {
    en: ({ who, pet, until }) =>
      until
        ? `${who} gave your team access to ${pet}'s records until ${until}.`
        : `${who} gave your team access to ${pet}'s records until revoked.`,
    es: ({ who, pet, until }) =>
      until
        ? `${who} le dio a tu equipo acceso a la ficha de ${pet} hasta el ${until}.`
        : `${who} le dio a tu equipo acceso a la ficha de ${pet} hasta que lo revoque.`,
  },
  care_access_revoked: {
    en: ({ who, pet }) => `${who} ended your team's access to ${pet}'s records.`,
    es: ({ who, pet }) => `${who} revocó el acceso de tu equipo a la ficha de ${pet}.`,
  },
};

// dd/MM/yyyy (both languages, as in the app) on the recipient's local day.
function localDate(value, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: resolveTimezone(timezone),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

/** Pure: the sentence in `locale` ('en' | anything else = es-AR). A missing name falls back to a neutral word. */
export function careAccessBody(type, locale, { ownerName, petName, expiresAt = null, timezone = null } = {}) {
  const lang = locale === "en" ? "en" : "es";
  const who = (ownerName && String(ownerName).trim()) || (lang === "en" ? "A pet owner" : "Un dueño");
  const pet = (petName && String(petName).trim()) || (lang === "en" ? "a dog" : "un perro");
  const until = expiresAt ? localDate(expiresAt, timezone) : null;
  return COPY[type]?.[lang]({ who, pet, until }) ?? null;
}

/**
 * Notify the team of the grant's provider. Runs in the owner's request, after the grant row was written.
 * @param {{ type: "care_access_granted"|"care_access_revoked",
 *           grant: { pet_id: number, provider_id: number, expires_at?: Date|string|null }, actor: number }} args
 */
export async function notifyCareAccess({ type, grant, actor }) {
  try {
    let team = [];
    await withSavepoint(async () => {
      team = await sql`
        SELECT
          s.id AS recipient,
          app_recipient_locale(s.id) AS locale,
          r.timezone,
          (SELECT full_name FROM user_profiles WHERE id = ${actor}) AS full_name,
          (SELECT name FROM pets WHERE id = ${grant.pet_id}) AS pet_name
        FROM app_provider_active_staff_ids(${[grant.provider_id]}::int[]) AS s(id)
        LEFT JOIN user_profiles r ON r.id = s.id
        WHERE s.id <> ${actor}
        ORDER BY s.id
      `;
    });
    for (const member of team) {
      await safeNotifyIsolated({
        recipient: member.recipient,
        actor,
        type,
        subjectRef: String(grant.pet_id),
        body: careAccessBody(type, member.locale, {
          ownerName: publicOwnerName(member),
          petName: member.pet_name,
          expiresAt: grant.expires_at,
          timezone: member.timezone,
        }),
      });
    }
  } catch (e) {
    console.error("[notifyCareAccess] non-fatal:", e?.message);
  }
}
