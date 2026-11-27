// Inviting a vet that is on PawPi (migration 0154, docs/vet-sharing-design.md "Invitations to a vet on PawPi"). The
// owner offers parts of the record to one business; nothing is visible until active staff of that business accept.

import sql from "./sql";
import { withSavepoint } from "./requestContext";

export const SHARE_OFFER_OPEN_LIMIT = 20;

export const OFFERS_UNAVAILABLE = "share_offers_unavailable";

// The table, a column or a function of 0154 is not there yet.
const MISSING_SCHEMA = new Set(["42P01", "42703", "42883"]);
export const isMissingSchema = (error) => MISSING_SCHEMA.has(error?.code);

export const offersUnavailable = () =>
  Response.json(
    { error: "Inviting a vet is not available yet", code: OFFERS_UNAVAILABLE },
    { status: 409 },
  );

/** An owner's offer row as the API shows it (`duration` is the app's `expiry` key). */
export function presentOffer({ duration, ...offer }) {
  return { ...offer, expiry: duration };
}

/** A database id from a path or a body, or null. */
export function toId(value) {
  if (!/^[1-9]\d{0,8}$/.test(String(value ?? ""))) return null;
  return Number(value);
}

/**
 * Withdraws an unanswered invitation to this provider for this pet, for an owner's change that touches no row the
 * database's own rule watches (a repeated share, an edit of the access). Does nothing on a database without invitations.
 */
export async function withdrawOpenOffer({ userId, petId, providerId }) {
  try {
    await withSavepoint(async () => {
      await sql`
        UPDATE care_share_offers
        SET status = 'withdrawn', responded_at = NOW()
        WHERE owner_user_id = ${userId}
          AND pet_id = ${petId}
          AND provider_id = ${providerId}
          AND status = 'open'
      `;
    });
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
  }
}
