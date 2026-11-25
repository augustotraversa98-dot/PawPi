// Who logged a health entry (migration 0144). The database stamps `logged_by_user_id` / `logged_by_known`; a response
// carries only the person's PUBLIC display name (never an id, username or e-mail):
//   known + account exists with a name -> logged_by_name: "Sam"
//   known + account gone (or anonymised) -> logged_by_name: "Former member" (the app translates it)
//   not known (older entry, or before the migration), or a person with no public name -> nothing is added
// Never fails the read it decorates.

import sql from "./sql";
import { withSavepoint } from "./requestContext";
import { publicOwnerName } from "./ownerDisplay";

export const FORMER_MEMBER = "Former member";

export async function withLoggedByNames(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const ids = [...new Set(rows.map((r) => r.logged_by_user_id).filter((id) => id != null))];
  const names = new Map();
  let lookupFailed = false;
  if (ids.length > 0) {
    try {
      const people = await withSavepoint(
        () => sql`SELECT id, full_name FROM user_profiles WHERE id = ANY (${ids})`,
      );
      for (const person of people) names.set(person.id, publicOwnerName(person));
    } catch (error) {
      lookupFailed = true;
      console.error("[loggedBy] name lookup failed:", error?.message);
    }
  }
  return rows.map((row) => {
    if (row.logged_by_user_id === undefined && row.logged_by_known === undefined) return row;
    const { logged_by_user_id: id, logged_by_known: known, ...rest } = row;
    if (!known || (lookupFailed && id != null)) return rest;
    if (id == null) return { ...rest, logged_by_name: FORMER_MEMBER };
    const name = names.get(id);
    return name ? { ...rest, logged_by_name: name } : rest;
  });
}
