// Inviting a vet by link (migration 0148, docs/vet-sharing-design.md "Invite by link").
//
// The token is shown once, inside the link, to the owner who created it. Only its sha256 is stored. It sits after the
// '#' of the link, which a browser never sends to a server or in a Referer; the invite page posts it in a request body.
// Never log it.

import { createHash, randomBytes } from "node:crypto";
import sql from "@/app/api/utils/sql";
import { safeNotifyIsolated } from "@/app/api/utils/notify";
import { withSavepoint } from "@/app/api/utils/requestContext";

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

/** Tells the owner about the pending request (bell, and the owner push rules). Never fails the accept. */
export async function notifyOwnerOfAccessRequest({ ownerUserId, staffUserId, providerName, petName }) {
  let locale = null;
  try {
    await withSavepoint(async () => {
      const rows = await sql`SELECT app_recipient_locale(${ownerUserId}) AS locale`;
      locale = rows?.[0]?.locale ?? null;
    });
  } catch (error) {
    console.error("[vetInvite] locale lookup failed (non-fatal):", error?.message);
  }
  await safeNotifyIsolated({
    recipient: ownerUserId,
    actor: staffUserId,
    type: "care_access_requested",
    subjectRef: null,
    body: accessRequestBody(locale, providerName, petName),
  });
}
