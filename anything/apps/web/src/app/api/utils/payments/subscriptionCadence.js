// subscriptionCadence — the single source of truth for how a shop auto-reorder plan's
// cadence advances next_charge_at (Phase 2 ticket 2.17). Pure + unit-testable; reused by
// BOTH the subscribe route (sets the first charge date) and the auto-charge cron (advances
// it after a successful charge).
//
// Cadences (matching the ALLOWED_PLANS in shop/subscriptions): weekly +7d, biweekly +14d,
// monthly +1 month, quarterly +3 months. Day cadences add exact days (UTC) so DST never
// shifts the boundary; month cadences use UTC month arithmetic (JS rolls a month overflow
// forward — e.g. Jan 31 + 1mo → Mar 3 — which is acceptable and deterministic).

export const ALLOWED_PLANS = ["weekly", "biweekly", "monthly", "quarterly"];

const CADENCE_DAYS = { weekly: 7, biweekly: 14 };
const CADENCE_MONTHS = { monthly: 1, quarterly: 3 };

/**
 * nextChargeAt(from, plan) → Date — the next charge instant after `from` for `plan`.
 * @param {Date|string|number} from  the anchor instant (e.g. now, or the prior next_charge_at)
 * @param {string} plan              one of ALLOWED_PLANS
 * @throws {Error} on an invalid date or an unknown plan
 */
export function nextChargeAt(from, plan) {
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) {
    throw new Error("nextChargeAt: invalid `from` date");
  }
  if (Object.prototype.hasOwnProperty.call(CADENCE_DAYS, plan)) {
    d.setUTCDate(d.getUTCDate() + CADENCE_DAYS[plan]);
    return d;
  }
  if (Object.prototype.hasOwnProperty.call(CADENCE_MONTHS, plan)) {
    d.setUTCMonth(d.getUTCMonth() + CADENCE_MONTHS[plan]);
    return d;
  }
  throw new Error(`nextChargeAt: unknown plan '${plan}'`);
}
