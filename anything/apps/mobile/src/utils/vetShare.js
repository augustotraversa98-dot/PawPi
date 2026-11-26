// Pure rules behind the "Share with your vet" sheet (components/Health/VetShare/ShareWithVetSheet).

// The ONE scope the owner can give. The server enforces it as a single read bundle (RLS 0023 + assertCareAccess):
// there is no per-section permission, so the sheet must not pretend there is one. See docs/vet-sharing-design.md.
export const VET_SHARE_SCOPE = "medical_read";

const VET_CAPABILITIES = ["vet", "telehealth"];

// The vets the owner can pick: providers with a vet booking for THIS pet. The provider web panel lists a pet only
// through its bookings, so sharing with any other vet would give them access they have no screen to open.
export function bookedVetsForPet(bookings, petId) {
  const all = [...(bookings?.upcoming ?? []), ...(bookings?.past ?? [])];
  const vets = new Map();
  for (const b of all) {
    if (b?.provider_id == null || String(b.pet_id) !== String(petId)) continue;
    if (!VET_CAPABILITIES.includes(b.capability)) continue;
    const id = String(b.provider_id);
    if (!vets.has(id)) {
      vets.set(id, { providerId: b.provider_id, name: b.provider_name || null });
    }
  }
  return [...vets.values()];
}

export function isGrantExpired(grant, now = Date.now()) {
  if (!grant?.expires_at) return false;
  return new Date(grant.expires_at).getTime() <= now;
}

// Why a vet cannot be picked right now, or null when they can. The database allows only one pending-or-active grant
// per vet and pet (0128), so any such grant has to be answered or revoked before a new one can be created.
//   "pending" the vet asked for access and is waiting for an answer
//   "shared"  they can already read the record
//   "other"   an active grant that does not include reading the record (or one that ran out)
export function shareBlockReason(grants, providerId, now = Date.now()) {
  const mine = (grants ?? []).filter(
    (g) => String(g.provider_id) === String(providerId),
  );
  const canRead = mine.some(
    (g) =>
      g.status === "active" &&
      !isGrantExpired(g, now) &&
      (g.scopes ?? []).includes(VET_SHARE_SCOPE),
  );
  if (canRead) return "shared";
  if (mine.some((g) => g.status === "pending")) return "pending";
  if (mine.some((g) => g.status === "active")) return "other";
  return null;
}
