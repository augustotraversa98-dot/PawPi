import sql from "@/app/api/utils/sql";
import { safeNotify } from "@/app/api/utils/notify";

// BN2 PR2 — the ONE recipient-resolver for provider-facing (business) notifications.
//
// "OWNER + relevant STAFF": the provider owner is enrolled as an ACTIVE provider_staff row
// at creation, so app_provider_active_staff_ids([providerId]) (0093, SECURITY DEFINER)
// returns owner + every active staff in a single call — exactly the business team. The
// emitting route runs in the ACTOR's identity, whose RLS cannot read another provider's
// provider_staff, so the DEFINER reader is required (mirrors walk-requests).
//
// Guarantees:
//   • Never throws (best-effort; a notify failure must not fail the action).
//   • Never double-notifies the actor (safeNotify skips recipient === actor).
//   • Never leaks across businesses (scoped to the single providerId).
//   • Degrades clean if the DEFINER reader is absent (unmigrated) → no recipients.
//
// `ownerOnly` targets just providers.owner_user_profile_id (used for `biz_follow`, which the
// catalog scopes to the owner). Otherwise the whole active team is notified.

async function resolveTeam(providerId, ownerOnly) {
  if (ownerOnly) {
    const rows = await sql`
      SELECT owner_user_profile_id AS id FROM providers WHERE id = ${providerId}
    `;
    return rows.map((r) => r.id).filter((id) => id != null);
  }
  const rows = await sql`
    SELECT app_provider_active_staff_ids(${[providerId]}::int[]) AS id
  `;
  return rows.map((r) => r.id).filter((id) => id != null);
}

/**
 * Notify a provider's team (owner + active staff, or owner-only) of a business event.
 * @param {{providerId:number|string, actor:number|null, type:string, subjectRef:string|number,
 *          body?:string, ownerOnly?:boolean}} args
 */
export async function notifyProviderTeam({
  providerId,
  actor,
  type,
  subjectRef,
  body,
  ownerOnly = false,
}) {
  try {
    const pid = Number(providerId);
    if (!Number.isInteger(pid)) return;
    let recipients;
    try {
      recipients = await resolveTeam(pid, ownerOnly);
    } catch (e) {
      // 42P01 undefined_table / 42883 undefined_function → unmigrated; no recipients.
      if (e?.code === "42P01" || e?.code === "42883") return;
      throw e;
    }
    for (const recipient of recipients) {
      await safeNotify({
        recipient,
        actor: actor ?? null,
        type,
        subjectRef: subjectRef == null ? null : String(subjectRef),
        body,
      });
    }
  } catch (e) {
    console.error("[notifyProviderTeam] non-fatal:", e?.message);
  }
}
