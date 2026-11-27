import { granteeLabel } from "@/utils/sharingLabels";

// Pure rules for "Who has access" (hooks/useWhoHasAccess, components/Health/VetShare/AccessList, My Hub).
// An entry is one thing that can open one dog's data right now: `kind` is "vet", "record_link", "emergency_link" or
// "family", as the server lists them (GET /api/care-access/who-has-access).

export const accessEntryKey = (entry) => `${entry.kind}:${entry.id}`;

// False once the end date has passed, for a list read a while ago.
export const isEntryLive = (entry, now = Date.now()) =>
  !entry.expires_at || new Date(entry.expires_at).getTime() > now;

// The dog on screen first, then the others dog by dog; each dog keeps the server's order.
export function orderForDog(entries, petId) {
  const rank = (e) => (String(e.pet_id) === String(petId) ? 0 : 1);
  return [...(entries ?? [])].sort(
    (a, b) => rank(a) - rank(b) || Number(a.pet_id) - Number(b.pet_id),
  );
}

/** Who (or what) holds the access. */
export function accessEntryTitle(entry, t) {
  if (entry.kind === "record_link") return t("whoHasAccess.recordLink");
  if (entry.kind === "emergency_link") return t("whoHasAccess.emergencyLink");
  if (entry.kind === "family") return granteeLabel(t, entry.grantee_username);
  return entry.provider_name || t("dataAccess.provider");
}
