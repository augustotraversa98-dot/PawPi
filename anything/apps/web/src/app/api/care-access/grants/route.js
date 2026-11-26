import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import {
  VALID_CARE_SCOPES,
  RECORD_SECTIONS,
  RECORD_SECTIONS_SCOPE,
  SHARE_EXPIRY_INTERVALS,
} from "@/app/api/utils/careAccess";

// GET /api/care-access/grants — the OWNER's trust view: who has (or requested)
// access to which of my pets. Ticket 7 (docs/provider-design.md §2 + §4 item 7).
//
// This is an OWNER-context route, NOT a provider one: authorization is the
// caller's own identity (WHERE owner_user_id = me), exactly like every other
// owner-data route. It does NOT use requireProviderRole. Another owner's grants
// are invisible because they never match the WHERE clause.
//
// Returns the grant rows joined with the provider name + pet name so the trust UI
// can render "Dr. Smith — Rex" without extra lookups. Optional ?petId / ?status
// filters narrow the list. Newest first.
//
// `sections` is null for a grant by scope. `status` is the EFFECTIVE status: a
// pending or active row past its expires_at reads 'expired' (also for ?status).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`. The optional filters are
// expressed as tagged-template booleans (never sql(string, array)).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const status = searchParams.get("status");

    // Owner scope is the hard gate (WHERE owner_user_id = me). The optional
    // filters are folded in with `(${filter} IS NULL OR col = ${filter})` so a
    // single tagged template handles every combination without sql(string,array).
    const grants = await sql`
      SELECT
        g.id,
        g.pet_id,
        g.owner_user_id,
        g.provider_id,
        g.scopes,
        g.sections,
        eff.status,
        g.requested_by,
        g.booking_id,
        g.granted_at,
        g.expires_at,
        g.revoked_at,
        g.created_at,
        g.updated_at,
        pr.name AS provider_name,
        p.name AS pet_name
      FROM care_access_grants g
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN g.status IN ('pending', 'active') AND g.expires_at <= now() THEN 'expired'
          ELSE g.status
        END AS status
      ) eff
      LEFT JOIN providers pr ON pr.id = g.provider_id
      LEFT JOIN pets p ON p.id = g.pet_id
      WHERE g.owner_user_id = ${userId}
        AND (${petId}::int IS NULL OR g.pet_id = ${petId}::int)
        AND (${status}::text IS NULL OR eff.status = ${status}::text)
      ORDER BY g.created_at DESC
    `;

    return Response.json({ grants });
  } catch (error) {
    console.error("[GET /api/care-access/grants] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch grants" },
      { status: 500 },
    );
  }
}

// Default scope for owner-initiated "Share clinic history": READ access to the pet's clinic
// history (medical record + vaccine check). This is the exact scope assertCareAccess gates those
// endpoints on ('medical_read') — a coarse 'medical' would store fine but grant NOTHING. No
// _write scope is ever granted by this owner-facing share.
const DEFAULT_CLINIC_SCOPES = ["medical_read"];

// Why a by-section body is refused, or null when it is valid.
function invalidShareBySection(body, sections, expiry) {
  if (Object.hasOwn(body, "scopes")) {
    return "scopes cannot be combined with sections or expiry";
  }
  if (
    !Array.isArray(sections) ||
    sections.length === 0 ||
    !sections.every((s) => RECORD_SECTIONS.includes(s))
  ) {
    return "sections must be a non-empty array of valid section keys";
  }
  if (typeof expiry !== "string" || !Object.hasOwn(SHARE_EXPIRY_INTERVALS, expiry)) {
    return `expiry must be one of ${Object.keys(SHARE_EXPIRY_INTERVALS).join(", ")}`;
  }
  return null;
}

// Both locks are held until the request commits. The first allows one share at a time per pet and
// provider: a concurrent second one waits for it. The second holds the open grant, so a change to it
// made elsewhere (the owner approving or denying the request) lands fully before or after the share.
async function lockOpenGrant({ userId, petId, providerId }) {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`care_access_grant:${petId}:${providerId}`}))`;
  await sql`
    SELECT id FROM care_access_grants
    WHERE owner_user_id = ${userId}
      AND pet_id = ${petId}
      AND provider_id = ${providerId}
      AND status IN ('pending', 'active')
    FOR UPDATE
  `;
}

// The vet's pending request, if there is one, approved with exactly what the owner chose: scopes,
// sections and expiry are all overwritten, so nothing the request asked for stays unless the owner
// chose it too. `sections` and `interval` are null for a share by scope. Returns the 200 response,
// or null when nothing is pending.
async function approvePendingRequest({ userId, petId, providerId, scopes, sections, interval }) {
  const approved = await sql`
    UPDATE care_access_grants
    SET status = 'active',
        scopes = ${scopes},
        sections = ${sections},
        expires_at = NOW() + ${interval}::interval,
        granted_at = NOW(),
        updated_at = NOW()
    WHERE owner_user_id = ${userId}
      AND pet_id = ${petId}
      AND provider_id = ${providerId}
      AND status = 'pending'
    RETURNING *
  `;
  return approved.length > 0
    ? Response.json({ grant: approved[0], approvedRequest: true })
    : null;
}

// End the active grant for this pet and provider, if any, then approve the vet's pending request or
// create a new grant, with exactly the chosen sections and expiry. Everything runs on the request
// transaction: it all applies or none of it does.
async function shareBySection({ userId, petId, providerId, sections, interval }) {
  const chosen = RECORD_SECTIONS.filter((s) => sections.includes(s));
  const choice = {
    userId,
    petId,
    providerId,
    scopes: [RECORD_SECTIONS_SCOPE],
    sections: chosen,
    interval,
  };
  await sql`
    UPDATE care_access_grants
    SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
    WHERE owner_user_id = ${userId}
      AND pet_id = ${petId}
      AND provider_id = ${providerId}
      AND status = 'active'
  `;
  const approved = await approvePendingRequest(choice);
  if (approved) {
    return approved;
  }
  try {
    const created = await withSavepoint(async () => await sql`
      INSERT INTO care_access_grants (
        pet_id,
        owner_user_id,
        provider_id,
        scopes,
        sections,
        status,
        requested_by,
        granted_at,
        expires_at
      ) VALUES (
        ${petId},
        ${userId},
        ${providerId},
        ${[RECORD_SECTIONS_SCOPE]},
        ${chosen},
        ${"active"},
        ${"owner"},
        NOW(),
        NOW() + ${interval}::interval
      )
      RETURNING *
    `);
    return Response.json({ grant: created[0] }, { status: 201 });
  } catch (e) {
    // The one-open-grant index (0128) refused the row: the vet's request arrived after the check.
    const late = e?.code === "23505" ? await approvePendingRequest(choice) : null;
    if (late) {
      return late;
    }
    throw e;
  }
}

// POST /api/care-access/grants — OWNER-INITIATED sharing (booking detail → "Share clinic
// history"). The owner is the granting authority, so this creates an ACTIVE grant directly
// (requested_by='owner', status='active') — no provider request / owner approval round-trip.
// Mirrors the access-requests column shape (pet_id, owner_user_id, provider_id, scopes, status,
// requested_by). OWNER-context: the pet must belong to the caller (another owner's pet → 404).
//
// Two body shapes:
//   • { petId, providerId, scopes? } — a grant by scope, 'medical_read' by default, no expiry.
//     DEDUP: if an ACTIVE, non-expired grant to this provider already COVERS the requested
//     scopes (existing.scopes ⊇ requested), return it instead of inserting a duplicate.
//     While an active grant BY SECTION exists this answers 409 'sectioned_grant_exists': it is
//     never widened by this shape.
//   • { petId, providerId, sections, expiry } — a grant by section (docs/vet-sharing-design.md):
//     exactly what the owner chose, nothing by default. An active grant for the same pet and
//     provider ends and a new row replaces it (shareBySection).
// A grant or request past its date is closed first, so it never blocks a new one.
// While the vet's request for that pet is PENDING, either shape approves that row with exactly what
// the owner chose, never what the request asked for beyond that: 200 { grant, approvedRequest: true }.
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const { petId, providerId, scopes, sections, expiry } = body;

    if (!petId || !providerId) {
      return Response.json(
        { error: "petId and providerId are required" },
        { status: 400 },
      );
    }

    // Naming either field at all selects the by-section shape, which then requires both.
    const bySection =
      Object.hasOwn(body, "sections") || Object.hasOwn(body, "expiry");
    if (bySection) {
      const invalid = invalidShareBySection(body, sections, expiry);
      if (invalid) {
        return Response.json({ error: invalid }, { status: 400 });
      }
    }

    const scopeList =
      Array.isArray(scopes) && scopes.length > 0 ? scopes : DEFAULT_CLINIC_SCOPES;

    // Validate against the SHARED care-access vocabulary assertCareAccess honors. A scope outside
    // the set could never be matched by `requiredScope = ANY (scopes)`, so we reject it up front
    // (400) rather than silently storing a grant that grants nothing — the check that would have
    // caught the original 'medical'/'vaccinations' no-op.
    if (!scopeList.every((s) => VALID_CARE_SCOPES.includes(s))) {
      return Response.json(
        { error: "scopes must all be valid care-access scope values" },
        { status: 400 },
      );
    }

    // The pet must belong to the caller — another owner's pet matches no row → 404.
    const petRows = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // The provider must exist and be published.
    const providerRows = await sql`
      SELECT id FROM providers WHERE id = ${providerId} AND status = 'published'
    `;
    if (providerRows.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    await lockOpenGrant({ userId, petId, providerId });
    await sql`SELECT app_expire_care_grants(${petId}::int, ${providerId}::int)`;

    if (bySection) {
      return await shareBySection({
        userId,
        petId,
        providerId,
        sections,
        interval: SHARE_EXPIRY_INTERVALS[expiry],
      });
    }

    // An active, non-expired grant that answers this request without an insert: one by section
    // (→ 409, listed first), or one already covering these scopes (→ returned as it is).
    const findActive = () => sql`
      SELECT * FROM care_access_grants
      WHERE owner_user_id = ${userId}
        AND pet_id = ${petId}
        AND provider_id = ${providerId}
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
        AND (sections IS NOT NULL OR scopes @> ${scopeList}::text[])
      ORDER BY (sections IS NOT NULL) DESC, id DESC
      LIMIT 1
    `;
    const answerWith = (grant) =>
      grant.sections
        ? Response.json(
            {
              error: "This vet already has selected sections of the record shared",
              code: "sectioned_grant_exists",
            },
            { status: 409 },
          )
        : Response.json({ grant, deduped: true });

    const existing = await findActive();
    if (existing.length > 0) {
      return answerWith(existing[0]);
    }

    const choice = {
      userId,
      petId,
      providerId,
      scopes: scopeList,
      sections: null,
      interval: null,
    };
    const approved = await approvePendingRequest(choice);
    if (approved) {
      return approved;
    }

    // (AUDIT A-26) The lookup above is a select-then-insert race: two concurrent
    // requests can both find no existing grant and both insert. The partial
    // UNIQUE(provider_id, pet_id) WHERE status IN ('pending','active')
    // (migration 0128, hand-applied) makes the loser raise 23505. The insert runs
    // in a savepoint so the winner can still be read, or a request that arrived
    // meanwhile approved, afterwards.
    let created;
    try {
      created = await withSavepoint(async () => await sql`
        INSERT INTO care_access_grants (
          pet_id,
          owner_user_id,
          provider_id,
          scopes,
          status,
          requested_by,
          granted_at
        ) VALUES (
          ${petId},
          ${userId},
          ${providerId},
          ${scopeList},
          ${"active"},
          ${"owner"},
          NOW()
        )
        RETURNING *
      `);
    } catch (e) {
      if (e?.code === "23505") {
        const winner = await findActive();
        if (winner.length > 0) {
          return answerWith(winner[0]);
        }
        const late = await approvePendingRequest(choice);
        if (late) {
          return late;
        }
      }
      throw e;
    }

    return Response.json({ grant: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/care-access/grants] Error:", error.message);
    return Response.json(
      { error: "Failed to create grant" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
