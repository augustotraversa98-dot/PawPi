// A directory listing nobody has claimed (providers.claim_status, 0124) has no one on the other side: a booking,
// order, message or request sent to it reaches nobody. Every route where a customer sends something to a business
// refuses it with this answer. Installed app builds show `error` as it comes, so it is written in the caller's
// language (utils/rateLimit.js pickLocale); both are also included.

import sql from "./sql";
import { pickLocale } from "./rateLimit";

export const PROVIDER_UNCLAIMED_CODE = "provider_unclaimed";

// What the customer was sending. mobile/src/utils/appAlert.js matches the English "hasn't been claimed yet".
const MESSAGES = {
  booking: {
    en: "This business hasn't been claimed yet, so we can't send your booking.",
    es: "Este negocio todavía no fue reclamado, así que no podemos enviarle tu reserva.",
  },
  order: {
    en: "This business hasn't been claimed yet, so we can't send your order.",
    es: "Este negocio todavía no fue reclamado, así que no podemos enviarle tu pedido.",
  },
  message: {
    en: "This business hasn't been claimed yet, so we can't send your message.",
    es: "Este negocio todavía no fue reclamado, así que no podemos enviarle tu mensaje.",
  },
  request: {
    en: "This business hasn't been claimed yet, so we can't send your request.",
    es: "Este negocio todavía no fue reclamado, así que no podemos enviarle tu solicitud.",
  },
};

/** True for a providers row whose claim_status says nobody has claimed it. A row without the column is not judged. */
export function isUnclaimedProvider(row) {
  return row?.claim_status != null && row.claim_status !== "claimed";
}

export function unclaimedProviderResponse(request, kind) {
  const text = MESSAGES[kind];
  return Response.json(
    {
      error: text[pickLocale(request)],
      code: PROVIDER_UNCLAIMED_CODE,
      message_en: text.en,
      message_es: text.es,
    },
    { status: 409 },
  );
}

/** For a route that reads no providers row of its own. An id that matches nothing is left to the route to refuse. */
export async function providerIsUnclaimed(providerId) {
  if (!/^\d+$/.test(String(providerId))) return false;
  const rows = await sql`SELECT claim_status FROM providers WHERE id = ${providerId}`;
  return isUnclaimedProvider(rows?.[0]);
}
