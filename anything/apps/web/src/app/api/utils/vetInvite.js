// Inviting a vet by link (migration 0148, docs/vet-sharing-design.md "Invite by link").
//
// The token is shown once, inside the link, to the owner who created it. Only its sha256 is stored. It sits after the
// '#' of the link, which a browser never sends to a server or in a Referer; the invite page posts it in a request body.
// Never log it.

import { createHash, randomBytes } from "node:crypto";
import sql from "@/app/api/utils/sql";
import { safeNotifyIsolated } from "@/app/api/utils/notify";
import { withSavepoint } from "@/app/api/utils/requestContext";
import { pickLocale } from "@/app/api/utils/rateLimit";

export const VET_INVITE_TTL_DAYS = 7;
export const VET_INVITE_OPEN_LIMIT = 5;
// What accepting an invite asks for. The owner chooses what is actually shared when approving.
export const VET_INVITE_REQUEST_SCOPES = ["medical_read"];

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const newInviteToken = () => randomBytes(32).toString("base64url");
export const isInviteToken = (value) => typeof value === "string" && TOKEN_RE.test(value);
export const hashInviteToken = (token) => createHash("sha256").update(token).digest("hex");
export const inviteLink = (origin, token) => `${origin}/vet-invite#${token}`;

/** One answer for every unusable link: unknown, malformed, expired, used or revoked. */
export const inviteNotValid = () =>
  Response.json(
    { error: "This invite link is not valid", code: "invite_not_valid" },
    { status: 404 },
  );

export const noVetBusiness = () =>
  Response.json(
    { error: "This invite is for a vet business account", code: "no_business" },
    { status: 403 },
  );

/** The caller's businesses that may accept a vet invite: [{ id, name }]. */
export async function inviteBusinesses(userId) {
  return await sql`
    SELECT pr.id, pr.name
    FROM provider_staff ps
    JOIN providers pr ON pr.id = ps.provider_id
    WHERE ps.user_profile_id = ${userId}
      AND ps.status = 'active'
      AND app_can_accept_vet_invite(pr.id)
    ORDER BY pr.name, pr.id
  `;
}

const REQUEST_COPY = {
  en: (vet, pet) =>
    `${vet} asks to see ${pet}'s vet record. Nothing is shared unless you approve it in Data access.`,
  es: (vet, pet) =>
    `${vet} pide ver la ficha veterinaria de ${pet}. No se comparte nada si no lo aprobás en Acceso a datos.`,
};

export function accessRequestBody(locale, providerName, petName) {
  return REQUEST_COPY[locale === "en" ? "en" : "es"](providerName, petName);
}

/** The stored language of this person, or null. Never throws. */
async function storedLocale(userId) {
  try {
    return await withSavepoint(async () => {
      const rows = await sql`SELECT app_recipient_locale(${userId}) AS locale`;
      return rows?.[0]?.locale ?? null;
    });
  } catch (error) {
    console.error("[vetInvite] locale lookup failed (non-fatal):", error?.message);
    return null;
  }
}

/**
 * True when this request of the owner's was filed by accepting an invite link and the business has no booking for the
 * dog that counts: any not cancelled or declined (no booking status counts), as in the app (mobile/src/utils/
 * vetShare.js, hasBookingForPet, over GET /api/me/bookings: the owner's own, not deleted).
 * "Filed by accepting an invite": the accept writes the invite's used_at and the request's created_at in one
 * transaction, both now(), so they are equal. A request filed any other way, even by the same business for the same
 * dog, does not match. Compared in the database, which keeps the microseconds.
 */
export async function inviteRequestNeedsSections({ grantId, ownerUserId }) {
  const rows = await sql`
    SELECT 1
    FROM care_access_grants g
    JOIN care_access_invites i
      ON i.owner_user_id = g.owner_user_id
     AND i.pet_id = g.pet_id
     AND i.used_by_provider_id = g.provider_id
     AND i.used_at = g.created_at
    WHERE g.id = ${grantId}
      AND g.owner_user_id = ${ownerUserId}
      AND NOT EXISTS (
        SELECT 1 FROM vet_appointments va
        WHERE va.owner_user_id = g.owner_user_id
          AND va.pet_id = g.pet_id
          AND va.provider_id = g.provider_id
          AND va.deleted_at IS NULL
          AND COALESCE(va.booking_status, '') NOT IN ('cancelled', 'declined')
      )
    LIMIT 1
  `;
  return rows.length > 0;
}

// An app version without "Choose what to share" shows this sentence as it is, hence the way out it names. Keep each
// under 200 characters, and an accented letter in the Spanish one: older versions show it only then.
const CHOOSE_SECTIONS_COPY = {
  en: "First choose what this business can see. If you don't have “Choose what to share”, update PawPi. You can also deny the request.",
  es: "Primero elegí qué puede ver este negocio. Si no te aparece “Elegir qué compartir”, actualizá PawPi. También podés rechazar el pedido.",
};

/** 409 for approving such a request as asked, in the owner's language. */
export async function chooseSectionsFirst(request, ownerUserId) {
  const locale = pickLocale(request, await storedLocale(ownerUserId));
  return Response.json(
    { error: CHOOSE_SECTIONS_COPY[locale], code: "choose_sections" },
    { status: 409 },
  );
}

/** Tells the owner about the pending request (bell, and the owner push rules). Never fails the accept. */
export async function notifyOwnerOfAccessRequest({ ownerUserId, staffUserId, providerName, petName }) {
  const locale = await storedLocale(ownerUserId);
  await safeNotifyIsolated({
    recipient: ownerUserId,
    actor: staffUserId,
    type: "care_access_requested",
    subjectRef: null,
    body: accessRequestBody(locale, providerName, petName),
  });
}
