// Words for the sharing UI. The server speaks English and machine words ("pending", "Former member"); a person never sees them raw.
// Pure: takes the i18n `t`.

const STATUS_KEYS = {
  pending: "sharedDog.statusPending",
  active: "sharedDog.statusActive",
  revoked: "sharedDog.statusRevoked",
  expired: "sharedDog.statusExpired",
  left: "sharedDog.statusLeft",
  declined: "sharedDog.statusDeclined",
};

/** A grant status ("pending", "active", "revoked", "expired", "left", "declined") in the person's language. Unknown → a neutral word, never the raw string. */
export function grantStatusLabel(t, status) {
  return t(STATUS_KEYS[status] ?? "sharedDog.statusUnknown");
}

const ROLE_KEYS = {
  owner: "sharedDog.roleOwner",
  family: "sharedDog.roleFamily",
  caregiver: "sharedDog.roleCaregiver",
};

export function roleLabel(t, role) {
  return t(ROLE_KEYS[role] ?? "sharedDog.roleCaregiver");
}

const BADGE_KEYS = {
  owner: "sharedDog.badgeOwner",
  family: "sharedDog.badgeFamily",
  caregiver: "sharedDog.badgeCaregiver",
};

export function roleBadgeLabel(t, role) {
  return t(BADGE_KEYS[role] ?? "sharedDog.badgeCaregiver");
}

// The server stamps this English name on content written by someone who has since deleted their account (migration 0142). Show it translated.
const FORMER_MEMBER_NAMES = new Set(["former member"]);

/** A member's display name; the server's English "Former member" becomes the localized one. Empty/absent → null (caller falls back). */
export function memberDisplayName(t, name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (FORMER_MEMBER_NAMES.has(trimmed.toLowerCase())) return t("sharedDog.formerMember");
  return trimmed;
}

/** "Shared by Sam" when the owner's public name is known, else "Shared with you". Never an e-mail or a raw handle-as-name. */
export function sharedByLabel(t, ownerName) {
  return ownerName ? t("sharedDog.sharedBy", { name: ownerName }) : t("sharedDog.sharedWithYou");
}

// A grantee whose account was deleted keeps their grant row, now pointing at an anonymous profile whose username starts with this
// prefix (migration 0142). It must read "Former member", never "@former_member_8f3a…".
const FORMER_USERNAME_PREFIX = "former_member_";

/** How a person on a grant list is shown: "@maria", or "Former member" for an anonymised ex-member. */
export function granteeLabel(t, username) {
  if (typeof username !== "string" || !username.trim()) return t("sharedDog.formerMember");
  if (username.toLowerCase().startsWith(FORMER_USERNAME_PREFIX)) return t("sharedDog.formerMember");
  return `@${username}`;
}
