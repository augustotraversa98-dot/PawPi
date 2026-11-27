// Tells a provider's team that an owner gave or ended access to a dog's record (docs/vet-sharing-design.md).
//
// One bell row (+ the business push, see notificationCategories) per active staff member of the provider, never the
// person acting. `subject_ref` is the PET id. `body` is a plain sentence in the RECIPIENT's language (es-AR voseo / en)
// naming the owner (display name only), the dog and, for a grant, how long it lasts: never anything from the record,
// nor which parts of it were shared. App builds that do not know the type print `body` as the message.
//
// NEVER throws, and every statement runs in a savepoint, so it can never fail the share or the revoke it follows.
//
// Invitations to a vet on PawPi (0154): notifyShareOffered tells the invited team (`subject_ref` is the PROVIDER id),
// notifyShareAnswered tells the owner that a business accepted or declined. Same rules: a sentence in the recipient's
// language with names and, once accepted, how long access lasts.

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

const OFFER_COPY = {
  care_share_offered: {
    en: ({ who, pet }) =>
      `${who} wants to share ${pet}'s vet record with your team. Nothing is visible until you accept: answer under Clinical in the provider area.`,
    es: ({ who, pet }) =>
      `${who} quiere compartir la ficha veterinaria de ${pet} con tu equipo. No se ve nada hasta que aceptes: respondé en Historias clínicas, en el área de proveedores.`,
  },
  care_share_accepted: {
    en: ({ vet, pet, until }) =>
      until
        ? `${vet} accepted your invitation and can see the parts you chose of ${pet}'s record until ${until}.`
        : `${vet} accepted your invitation and can see the parts you chose of ${pet}'s record until you revoke it.`,
    es: ({ vet, pet, until }) =>
      until
        ? `${vet} aceptó tu invitación y ya puede ver las partes que elegiste de la ficha de ${pet} hasta el ${until}.`
        : `${vet} aceptó tu invitación y ya puede ver las partes que elegiste de la ficha de ${pet} hasta que lo revoques.`,
  },
  care_share_declined: {
    en: ({ vet, pet }) => `${vet} declined your invitation to see ${pet}'s record. Nothing was shared.`,
    es: ({ vet, pet }) => `${vet} rechazó tu invitación para ver la ficha de ${pet}. No se compartió nada.`,
  },
};

/** Pure: the sentence of an invitation notification in `locale` ('en' | anything else = es-AR). */
export function shareOfferBody(type, locale, { ownerName, vetName, petName, expiresAt = null, timezone = null } = {}) {
  const lang = locale === "en" ? "en" : "es";
  const who = (ownerName && String(ownerName).trim()) || (lang === "en" ? "A pet owner" : "Un dueño");
  const vet = (vetName && String(vetName).trim()) || (lang === "en" ? "The vet" : "La veterinaria");
  const pet = (petName && String(petName).trim()) || (lang === "en" ? "a dog" : "un perro");
  const until = expiresAt ? localDate(expiresAt, timezone) : null;
  return OFFER_COPY[type]?.[lang]({ who, vet, pet, until }) ?? null;
}

// An invitation has not been accepted yet: a display name holding an address is left out, as in the invitation list.
function invitedBy(row) {
  const name = publicOwnerName(row);
  return name?.includes("@") ? null : name;
}

/** Tells the invited business's team about a new invitation. Runs in the owner's request. Never throws. */
export async function notifyShareOffered({ providerId, petId, actor }) {
  try {
    let team = [];
    await withSavepoint(async () => {
      team = await sql`
        SELECT
          s.id AS recipient,
          app_recipient_locale(s.id) AS locale,
          (SELECT full_name FROM user_profiles WHERE id = ${actor}) AS full_name,
          (SELECT name FROM pets WHERE id = ${petId}) AS pet_name
        FROM app_provider_active_staff_ids(${[providerId]}::int[]) AS s(id)
        WHERE s.id <> ${actor}
        ORDER BY s.id
      `;
    });
    for (const member of team) {
      await safeNotifyIsolated({
        recipient: member.recipient,
        actor,
        type: "care_share_offered",
        subjectRef: String(providerId),
        body: shareOfferBody("care_share_offered", member.locale, {
          ownerName: invitedBy(member),
          petName: member.pet_name,
        }),
      });
    }
  } catch (e) {
    console.error("[notifyShareOffered] non-fatal:", e?.message);
  }
}

/** Tells the owner that a business accepted or declined their invitation. Runs in the staff member's request. */
export async function notifyShareAnswered({ accepted, ownerUserId, providerId, petName, expiresAt = null, actor }) {
  try {
    let row = {};
    await withSavepoint(async () => {
      const rows = await sql`
        SELECT
          app_recipient_locale(${ownerUserId}) AS locale,
          (SELECT timezone FROM user_profiles WHERE id = ${ownerUserId}) AS timezone,
          (SELECT name FROM providers WHERE id = ${providerId}) AS vet_name
      `;
      row = rows?.[0] ?? {};
    });
    const type = accepted ? "care_share_accepted" : "care_share_declined";
    await safeNotifyIsolated({
      recipient: ownerUserId,
      actor,
      type,
      subjectRef: String(providerId),
      body: shareOfferBody(type, row.locale, {
        vetName: row.vet_name,
        petName,
        expiresAt: accepted ? expiresAt : null,
        timezone: row.timezone,
      }),
    });
  } catch (e) {
    console.error("[notifyShareAnswered] non-fatal:", e?.message);
  }
}

