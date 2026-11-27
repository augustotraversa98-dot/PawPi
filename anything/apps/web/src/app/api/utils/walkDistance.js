// Walk distances are stored in kilometres.
//
// Builds up to 37 send "miles" with every hand-typed walk, but only their English form asked for miles: the Spanish one
// asked for kilometres. So "miles" is converted for an English speaker and read as the km that were typed otherwise.

import sql from "./sql";
import { pickLocale } from "./rateLimit";

export const KM_PER_MILE = 1.609344;

export async function distanceInKm(request, callerId, value, unit) {
  if (!value || !/^mi(les?)?$/i.test(String(unit ?? "").trim())) return value;
  const [profile] = await sql`SELECT preferred_locale FROM user_profiles WHERE id = ${callerId}`;
  if (pickLocale(request, profile?.preferred_locale) !== "en") return value;
  return Math.round(value * KM_PER_MILE * 100) / 100;
}
