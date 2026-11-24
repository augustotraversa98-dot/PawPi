// Family-sharing lifecycle notifications (PR 4/7). One bell row (+ the optional v2 push) per REAL state change, to exactly one recipient:
//
//   invite              owner  -> member    pet_share_invite
//   accepted / declined member -> owner     pet_share_accepted / pet_share_declined
//   revoked             owner  -> member    pet_share_revoked        (an ACTIVE grant only; cancelling a pending invite is silent)
//   left                member -> owner     pet_share_left
//   owner deleted       owner  -> members   pet_share_owner_deleted  (sent BEFORE the account and its pets are deleted)
//
// `subject_ref` carries the PET id (a plain number): builds 30-32 treat an unknown type as a generic bell row and ignore subject_ref for
// navigation (tap = back), so nothing changes for them, while a new client can deep-link / invalidate that pet's caches. `body` is a
// short plain sentence in the RECIPIENT's language (es-AR voseo / en) — old builds print `body` as the message — and never contains an
// e-mail address or a username (the actor is shown by display name only, else a neutral word).
//
// NEVER throws, never notifies a user about their own action, runs the insert in a savepoint (safeNotifyIsolated) so it can never fail the
// action that triggered it — including while migration 0142 (the widened type CHECK) is not applied yet.

import sql from "./sql";
import { withSavepoint } from "./requestContext";
import { safeNotifyIsolated } from "./notify";
import { publicOwnerName } from "./ownerDisplay";

export const PET_SHARE_TYPES = [
  "pet_share_invite",
  "pet_share_accepted",
  "pet_share_declined",
  "pet_share_revoked",
  "pet_share_left",
  "pet_share_owner_deleted",
];

const COPY = {
  pet_share_invite: {
    en: (who, pet) => `${who} invited you to help care for ${pet}.`,
    es: (who, pet) => `${who} te invitó a ayudar a cuidar a ${pet}.`,
  },
  pet_share_accepted: {
    en: (who, pet) => `${who} accepted your invitation to care for ${pet}.`,
    es: (who, pet) => `${who} aceptó tu invitación para cuidar a ${pet}.`,
  },
  pet_share_declined: {
    en: (who, pet) => `${who} declined your invitation to care for ${pet}.`,
    es: (who, pet) => `${who} rechazó tu invitación para cuidar a ${pet}.`,
  },
  pet_share_revoked: {
    en: (_who, pet) => `You no longer have access to ${pet}.`,
    es: (_who, pet) => `Ya no tenés acceso a ${pet}.`,
  },
  pet_share_left: {
    en: (who, pet) => `${who} stopped helping care for ${pet}.`,
    es: (who, pet) => `${who} dejó de ayudar a cuidar a ${pet}.`,
  },
  pet_share_owner_deleted: {
    en: (_who, pet) => `${pet} is no longer shared with you: the owner deleted their account.`,
    es: (_who, pet) => `${pet} ya no está compartido con vos: el dueño borró su cuenta.`,
  },
};

/** Pure: the plain-sentence body in `locale` ('en' | anything else = es-AR). A missing name falls back to a neutral word. */
export function petShareBody(type, locale, { actorName, petName } = {}) {
  const lang = locale === "en" ? "en" : "es";
  const entry = COPY[type];
  if (!entry) return null;
  const who = (actorName && String(actorName).trim()) || (lang === "en" ? "Someone" : "Alguien");
  const pet = (petName && String(petName).trim()) || (lang === "en" ? "a dog" : "un perro");
  return entry[lang](who, pet);
}

async function recipientLocale(recipient) {
  try {
    let locale = "es";
    await withSavepoint(async () => {
      const rows = await sql`SELECT app_recipient_locale(${recipient}) AS locale`;
      locale = rows?.[0]?.locale === "en" ? "en" : "es";
    });
    return locale;
  } catch {
    return "es"; // the 0109 reader is absent or trouble: the product default
  }
}

/** The actor's public display name (full_name only — never username/e-mail), or null. */
export async function actorDisplayName(actorId) {
  try {
    let name = null;
    await withSavepoint(async () => {
      const rows = await sql`SELECT full_name FROM user_profiles WHERE id = ${actorId} LIMIT 1`;
      name = publicOwnerName(rows?.[0]);
    });
    return name;
  } catch {
    return null;
  }
}

/**
 * Send one sharing notification. `recipient` and `actor` are user_profiles.id. Returns the bell row id or null.
 * @param {{ type: string, recipient: number, actor: number|null, petId: number, petName?: string|null, actorName?: string|null }} args
 */
export async function notifyPetShare({ type, recipient, actor, petId, petName = null, actorName = null }) {
  try {
    if (!PET_SHARE_TYPES.includes(type) || recipient == null || recipient === actor) return null;
    const locale = await recipientLocale(recipient);
    const body = petShareBody(type, locale, { actorName, petName });
    return await safeNotifyIsolated({ recipient, actor, type, subjectRef: petId != null ? String(petId) : null, body });
  } catch (e) {
    console.error("[notifyPetShare] non-fatal:", e?.message);
    return null;
  }
}
