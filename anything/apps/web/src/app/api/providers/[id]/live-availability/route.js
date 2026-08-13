import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  requireProviderRole,
  ALL_PROVIDER_ROLES,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Walker "Available now" live presence — Ticket B1 (docs/phase2-tickets/B1-walker-available-now.md).
//   GET — any authed user reads a provider's live status. AVAILABILITY IS EVALUATED AT READ TIME:
//         accepting is only true when the stored flag is true AND expires_at is still in the future
//         (no cron flips it). Degrades clean: if the provider_live_availability table is absent
//         (unmigrated prod) → { accepting:false }.
//   PUT — ACTIVE STAFF of a WALKER provider upserts { accepting, lat?, lng? }. On accepting:true we
//         stamp expires_at = now() + 8h (a forgotten toggle self-expires); on false we clear the
//         coords + expiry. Provider-level (one row, PK = provider_id), DECISION LOCK 2.
//
// A non-integer provider id can never reach a real provider — 404 BEFORE any SQL / capability read.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a tagged
// template; params bind via `${}`.

const isMissingTable = (e) =>
  e?.code === "42P01" || /relation .* does not exist/i.test(e?.message ?? "");

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    if (!/^\d+$/.test(String(providerId))) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Read-time expiry evaluation: only "available" while the flag is on AND not yet expired. The
    // RLS read policy (0088) already scopes visibility to published providers / own-staff, so a
    // caller who cannot see the row simply gets no row → { accepting:false }.
    let rows;
    try {
      rows = await sql`
        SELECT
          (accepting = true AND expires_at IS NOT NULL AND expires_at > now()) AS accepting,
          expires_at
        FROM provider_live_availability
        WHERE provider_id = ${providerId}
      `;
    } catch (e) {
      // Degrade clean: unmigrated prod (table absent) → not accepting, never a 500.
      if (isMissingTable(e)) {
        return Response.json({ accepting: false, expires_at: null });
      }
      throw e;
    }

    if (rows.length === 0) {
      return Response.json({ accepting: false, expires_at: null });
    }
    return Response.json({
      accepting: rows[0].accepting === true,
      expires_at: rows[0].accepting === true ? rows[0].expires_at : null,
    });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET /api/providers/[id]/live-availability] Error:", e?.message);
    return Response.json(
      { error: "Failed to fetch live availability" },
      { status: 500 },
    );
  }
}

async function PUT(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    if (!/^\d+$/.test(String(providerId))) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // MODULE gate — only a WALKER provider has live presence (403 if not). Then the ACTIVE-STAFF
    // gate: any active staff of the provider may flip presence (not admin-only). The RLS write
    // policy (0088) is the last line, but we gate in-app too for a clean 403.
    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json()) ?? {};
    const accepting = body.accepting === true;

    // Coordinates only ride along when turning ON, and only when they are finite numbers (location
    // may be denied — nullable). When turning OFF we clear coords + expiry.
    const lat =
      accepting && Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
    const lng =
      accepting && Number.isFinite(Number(body.lng)) ? Number(body.lng) : null;

    let rows;
    try {
      rows = await sql`
        INSERT INTO provider_live_availability
          (provider_id, accepting, lat, lng, expires_at, updated_at)
        VALUES (
          ${providerId},
          ${accepting},
          ${lat},
          ${lng},
          CASE WHEN ${accepting} THEN now() + interval '8 hours' ELSE NULL END,
          now()
        )
        ON CONFLICT (provider_id) DO UPDATE SET
          accepting  = EXCLUDED.accepting,
          lat        = EXCLUDED.lat,
          lng        = EXCLUDED.lng,
          expires_at = EXCLUDED.expires_at,
          updated_at = now()
        RETURNING
          (accepting = true AND expires_at IS NOT NULL AND expires_at > now()) AS accepting,
          expires_at
      `;
    } catch (e) {
      // Degrade clean: unmigrated prod (table absent) → report the requested-off state, no 500.
      if (isMissingTable(e)) {
        return Response.json({ accepting: false, expires_at: null });
      }
      throw e;
    }

    return Response.json({
      accepting: rows[0].accepting === true,
      expires_at: rows[0].accepting === true ? rows[0].expires_at : null,
    });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PUT /api/providers/[id]/live-availability] Error:", e?.message);
    return Response.json(
      { error: "Failed to update live availability" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are unchanged —
// only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPUT = withRequestContext(PUT);
export { wrappedGET as GET, wrappedPUT as PUT };
