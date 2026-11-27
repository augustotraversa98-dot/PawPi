// A request to create a record link may name itself with an Idempotency-Key header, so that sending it again cannot
// create a second link. The keys live in request_idempotency_keys (migration 0138); without that table the header is
// ignored. A link's address is only ever returned once, so a repeat is told which link exists, never its address.

import sql from "./sql";
import { withSavepoint } from "./requestContext";

const SCOPE = "record_link_create";
const UNDEFINED_TABLE = "42P01";

async function tolerant(run) {
  try {
    return await withSavepoint(run);
  } catch (error) {
    if (error?.code !== UNDEFINED_TABLE) throw error;
    return null;
  }
}

/** The id of the link an earlier request with this key created for this owner, or null. */
export async function findLinkByRequestKey(ownerUserId, key) {
  return await tolerant(async () => {
    const rows = await sql`
      SELECT resource_id FROM request_idempotency_keys
      WHERE owner_user_id = ${ownerUserId}
        AND scope = ${SCOPE}
        AND idem_key = ${key}
      LIMIT 1
    `;
    return rows[0]?.resource_id ?? null;
  });
}

export async function rememberLinkRequestKey(ownerUserId, key, linkId) {
  await tolerant(async () => {
    await sql`
      INSERT INTO request_idempotency_keys (owner_user_id, scope, idem_key, resource_id)
      VALUES (${ownerUserId}, ${SCOPE}, ${key}, ${linkId})
      ON CONFLICT (owner_user_id, scope, idem_key) DO UPDATE SET resource_id = EXCLUDED.resource_id
    `;
  });
}
