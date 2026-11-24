// A short, stable fingerprint of the ACTIVE grants a user holds (family-sharing PR 4/7).
//
// WHY. After an owner revokes (or a member leaves) the server denies the member's very next request, but the member's APP may still hold a
// cached shared-pet list for minutes. The sharing endpoints therefore return `access_version`: when it changes between two reads, the
// client knows its access changed and must drop its pet-scoped caches at once instead of waiting out a stale window. It covers exactly
// what the opt-in `GET /api/pets?include_shared=1` lists (active, unexpired grants), so both reads agree. Pure and deterministic.

import { createHash } from "node:crypto";

/** @param {Array<{ id: number, role: string, expires_at?: any }>} activeGrants */
export function accessVersion(activeGrants = []) {
  const parts = [...activeGrants]
    .map((g) => `${g.id}:${g.role}:${g.expires_at ? new Date(g.expires_at).toISOString() : ""}`)
    .sort();
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}
