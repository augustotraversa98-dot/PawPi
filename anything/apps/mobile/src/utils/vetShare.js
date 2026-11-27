// Pure rules behind sharing the vet record (components/Health/VetShare, Data Access, booking summary).

// A grant by section carries this one scope and nothing else.
export const RECORD_SECTIONS_SCOPE = "record_sections";
// The older, all-together read grant (sections = null).
export const RECORD_READ_SCOPE = "medical_read";

// The parts of the record an owner can choose, in the order they are shown. Keys are the server's.
export const SHARE_SECTIONS = [
  "profile",
  "emergency_contact",
  "insurance",
  "vet_notes",
  "vaccines",
  "files",
  "photos",
  "lab_results",
];

export const SHARE_EXPIRIES = ["7d", "30d", "1y", "until_revoked"];

// The parts a vet can also be allowed to add to (never to delete from): notes (adding, and editing the ones added
// through that same share), vaccines, documents and lab results. Viewing only unless the owner turns it on.
export const EDITABLE_SECTIONS = ["vet_notes", "vaccines", "files", "lab_results"];
// Changing an existing share: leave its end date as it is.
export const KEEP_EXPIRY = "keep";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_DAYS = { "7d": 7, "30d": 30, "1y": 365 };
// Room for a leap day and a clock change between the server's start and end dates.
const EXPIRY_TOLERANCE_MS = 1.5 * DAY_MS;

// When a choice would end if it started at `from`; null when it lasts until revoked. Preview only: the server sets it.
export function expiryDate(expiry, from = new Date()) {
  if (!EXPIRY_DAYS[expiry]) return null;
  const end = new Date(from);
  if (expiry === "1y") end.setFullYear(end.getFullYear() + 1);
  else end.setDate(end.getDate() + EXPIRY_DAYS[expiry]);
  return end;
}

const VET_CAPABILITIES = ["vet", "telehealth"];

// The providers with a vet booking for THIS pet.
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

// Every vet the picker lists for a dog, each once: those with access now, those asking for it, then those only booked.
// A vet with access is listed however it got it (a booking, a search, an invitation), booked or not.
// → { sharing, asking, booked }, each [{ providerId, name, grant? }].
export function vetsForPet(grants, bookings, petId) {
  const booked = bookedVetsForPet(bookings, petId);
  const listed = new Set();
  const group = (list) =>
    list.flatMap((grant) => {
      const id = String(grant.provider_id);
      if (listed.has(id)) return [];
      listed.add(id);
      const name = grant.provider_name || booked.find((v) => String(v.providerId) === id)?.name || null;
      return [{ providerId: grant.provider_id, name, grant }];
    });
  const sharing = group((grants ?? []).filter((g) => isGrantActive(g)));
  const asking = group((grants ?? []).filter((g) => g.status === "pending"));
  return { sharing, asking, booked: booked.filter((v) => !listed.has(String(v.providerId))) };
}

const CALLED_OFF = ["cancelled", "declined"];

// Whether the owner has a booking (not cancelled or declined) with this business for this dog. A pending request from a
// business without one can only be answered by choosing sections or denying it, so unknown bookings count as none.
export function hasBookingForPet(bookings, providerId, petId) {
  const all = [...(bookings?.upcoming ?? []), ...(bookings?.past ?? [])];
  return all.some(
    (b) =>
      b?.provider_id != null &&
      String(b.provider_id) === String(providerId) &&
      String(b.pet_id) === String(petId) &&
      !CALLED_OFF.includes(b.booking_status),
  );
}

const CLOSED_INVITES_SHOWN = 5;

// Every open invite (each can be withdrawn), then the most recent others. Keeps the server's order.
export function visibleInvites(invites) {
  const all = invites ?? [];
  return [
    ...all.filter((i) => i.status === "open"),
    ...all.filter((i) => i.status !== "open").slice(0, CLOSED_INVITES_SHOWN),
  ];
}

export function isGrantExpired(grant, now = Date.now()) {
  if (grant?.status === "expired") return true;
  if (!grant?.expires_at) return false;
  return new Date(grant.expires_at).getTime() <= now;
}

// Gives access right now.
export function isGrantActive(grant, now = Date.now()) {
  return grant?.status === "active" && !isGrantExpired(grant, now);
}

// Gave access and ran out. A server may report it as "expired", or leave "active" with a past date.
export function isGrantEnded(grant, now = Date.now()) {
  if (grant?.status === "expired") return true;
  return grant?.status === "active" && isGrantExpired(grant, now);
}

// False when the server's grants carry no `sections` field: it cannot share by section. An empty list says nothing,
// which is why every created grant is also checked (grantMatchesChoice).
export function sectionsSupported(grants) {
  return !(grants ?? []).some((g) => g.sections === undefined);
}

export function providerGrants(grants, providerId) {
  return (grants ?? []).filter((g) => String(g.provider_id) === String(providerId));
}

const sameSet = (a, b) =>
  Array.isArray(a) &&
  a.length === b.length &&
  new Set(a).size === a.length &&
  b.every((x) => a.includes(x));

// What the vet can add through a share, in the order shown. A record link from before edit permissions says it with
// `allow_notes` alone.
export function addableSections(share) {
  const listed = Array.isArray(share?.edit_sections) ? share.edit_sections : [];
  return EDITABLE_SECTIONS.filter(
    (k) => listed.includes(k) || (k === "vet_notes" && share?.allow_notes === true),
  );
}

// Whether the share the server answered with lets the vet add exactly what was chosen. Nothing to check when the
// choice was sent without it (a server that cannot store edit permission).
const sameAdds = (share, editSections) =>
  editSections === undefined || sameSet(share?.edit_sections ?? [], editSections);

// True only when the grant the server answered with is exactly what the owner chose: active, the section scope alone,
// the same sections, the same things to add and the chosen length. Anything else must never be presented as shared.
export function grantMatchesChoice(grant, { sections, expiry, editSections }, now = Date.now()) {
  if (grant?.status !== "active") return false;
  if (!sameSet(grant.scopes, [RECORD_SECTIONS_SCOPE])) return false;
  if (!sameSet(grant.sections, sections) || !sameAdds(grant, editSections)) return false;
  if (expiry === "until_revoked") return grant.expires_at === null;
  const days = EXPIRY_DAYS[expiry];
  if (!days || !grant.expires_at) return false;
  const start = grant.granted_at ? new Date(grant.granted_at).getTime() : now;
  const length = new Date(grant.expires_at).getTime() - start;
  return Math.abs(length - days * DAY_MS) <= EXPIRY_TOLERANCE_MS;
}

// A record link (no account needed) always ends: there is no "until I revoke it".
export const LINK_EXPIRIES = ["7d", "30d", "1y"];

// True only when the link the server answered with is exactly what the owner chose: the same sections, the same
// permission to add and the chosen length. A link that is anything else is never sent.
export function recordLinkMatchesChoice(link, { sections, expiry, allowNotes, editSections }) {
  if (link?.id == null || !sameSet(link.sections, sections)) return false;
  if (link.allow_notes !== allowNotes || !sameAdds(link, editSections)) return false;
  const days = EXPIRY_DAYS[expiry];
  if (!days || !link.expires_at || !link.created_at) return false;
  const length = new Date(link.expires_at).getTime() - new Date(link.created_at).getTime();
  return Math.abs(length - days * DAY_MS) <= EXPIRY_TOLERANCE_MS;
}

// A grant that can be changed in place: access by section that is on now. An older grant (sections = null) keeps its
// own actions.
export function isGrantEditable(grant, now = Date.now()) {
  return isGrantActive(grant, now) && Array.isArray(grant.sections) && grant.sections.length > 0;
}

// What the choices start as when an existing share is changed: exactly what it is now, keeping its end date.
export function choiceOfShare(share) {
  return {
    sections: SHARE_SECTIONS.filter((k) => share.sections?.includes(k)),
    editSections: addableSections(share),
    expiry: KEEP_EXPIRY,
  };
}

export function isSameChoice(share, { sections, editSections, expiry }) {
  return (
    expiry === KEEP_EXPIRY &&
    sameSet(sections, share.sections ?? []) &&
    sameSet(editSections, addableSections(share))
  );
}

const sameMoment = (a, b) =>
  a == null || b == null ? a == null && b == null : new Date(a).getTime() === new Date(b).getTime();

// True only when the share the server answered a change with is the same one, still on, and exactly as chosen. A new
// length starts now.
export function updateMatchesChoice(before, after, { sections, editSections, expiry }, now = Date.now()) {
  if (after?.id !== before.id || after.status !== "active") return false;
  if (after.scopes && !sameSet(after.scopes, [RECORD_SECTIONS_SCOPE])) return false;
  if (!sameSet(after.sections, sections) || !sameSet(after.edit_sections ?? [], editSections)) return false;
  if (after.allow_notes !== undefined && after.allow_notes !== editSections.includes("vet_notes")) return false;
  if (expiry === KEEP_EXPIRY) return sameMoment(after.expires_at, before.expires_at);
  if (expiry === "until_revoked") return after.expires_at === null;
  const days = EXPIRY_DAYS[expiry];
  if (!days || !after.expires_at) return false;
  return Math.abs(new Date(after.expires_at).getTime() - now - days * DAY_MS) <= EXPIRY_TOLERANCE_MS;
}

// Links that open the record right now.
export function activeRecordLinks(links, now = Date.now()) {
  return (links ?? []).filter(
    (l) => l?.status === "active" && new Date(l.expires_at).getTime() > now,
  );
}

// Invitations still waiting for the business's answer.
export function waitingOffers(offers, now = Date.now()) {
  return (offers ?? []).filter(
    (o) => o?.status === "open" && new Date(o.lapses_at).getTime() > now,
  );
}

// What the older read grant opens (supabase/migrations/0023, the record and media routes). Keep true to the server.
const OLDER_READ_LINES = ["medical", "notes", "vaccines", "files"];

const SCOPE_LINE_KEYS = {
  medical_write: "vetShare.can.medicalWrite",
  vaccinations_write: "vetShare.can.vaccinationsWrite",
  health_logs_write: "vetShare.can.healthLogsWrite",
  health_logs_read: "dataAccess.scope.healthLogsRead",
  appointments: "dataAccess.scope.appointments",
  messaging: "dataAccess.scope.messaging",
};

// Everything a grant (or a pending request) opens, as translated lines. A scope this build does not know is shown as is
// rather than hidden.
export function grantAccessLines(grant, t, petName) {
  if (Array.isArray(grant?.sections) && grant.sections.length > 0) {
    return grant.sections.map((key) =>
      SHARE_SECTIONS.includes(key) ? t(`vetShare.section.${key}.title`) : key,
    );
  }
  const lines = [];
  for (const scope of grant?.scopes ?? []) {
    if (scope === RECORD_READ_SCOPE) {
      lines.push(...OLDER_READ_LINES.map((k) => t(`vetShare.older.${k}`, { pet: petName })));
    } else {
      lines.push(SCOPE_LINE_KEYS[scope] ? t(SCOPE_LINE_KEYS[scope]) : scope);
    }
  }
  return lines;
}

// A pending request that asks to read the record: the owner can answer it by choosing sections instead.
export function asksForRecord(grant) {
  return (grant?.scopes ?? []).includes(RECORD_READ_SCOPE);
}
