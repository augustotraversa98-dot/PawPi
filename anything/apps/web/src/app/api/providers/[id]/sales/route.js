import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/sales — the provider SALES / PAYOUTS / RECONCILIATION read (Wave 7
// ticket 2.69). One read powers the dashboard "Sales" section: a revenue series + totals, a
// transactions ledger (payments × orders), payout history with the pending balance, and an
// aggregate reconciliation that ties captured payments → orders → payouts.
//
// READ-ONLY. It MUTATES NO MONEY (no charge/refund/payout here — those live in the 2.3 layer).
// It only aggregates rows the caller's active-staff identity may already read under the 2.3 RLS:
//   - payments (status approved/refunded), joined to orders for provider scope + kind + counterpart
//   - payouts (settlements out to the provider)
// Every query is scoped to THIS provider (orders.provider_id / payouts.provider_id = ${providerId});
// there is no cross-provider or cross-owner aggregation, and no raw token/PII leaves the provider's
// own rows. Commission is the value 2.3 already captured on each payment (payments.commission_cents)
// — this route never re-derives a commission rule.
//
// AUTH: any ACTIVE staff member may VIEW (read-only overview, like the analytics/bookings inbox),
// so ALL_PROVIDER_ROLES. RLS (payments/orders/payouts policies) is the last line: a non-staff
// caller fails app_is_active_staff_of(provider_id) and every aggregate returns zero rows even if
// the membership gate were bypassed.
//
// RECONCILIATION CAVEAT (honest, no fake linkage): the 2.3 schema has NO per-payment→payout FK
// (payments carry no payout_id), so there is no truthful way to show "this payout covers exactly
// these payments." Reconciliation is therefore reported at the AGGREGATE level — net captured vs
// paid out vs pending — plus the full payout list, so a provider can confirm "earned vs paid"
// without the route inventing a line-item linkage that the data doesn't record.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a tagged
// template; params bind via `${}`. Never sql(string, array).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Active-staff gate. A removed/invited/non-member caller is denied here; even if it
    // weren't, the per-row RLS below would still return only this provider's rows.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    // ── REVENUE TOTALS (payments × orders) — approved = captured gross + commission; refunded =
    // money returned. Net = approved gross − approved commission − refunded gross (a refund returns
    // the captured amount; the 2.3 schema records no per-refund commission reversal, so net nets
    // out the refunded gross — documented, not invented).
    const totalsRows = await sql`
      SELECT
        COALESCE(SUM(p.amount_cents) FILTER (WHERE p.status = 'approved'), 0)::bigint AS gross_cents,
        COALESCE(SUM(p.commission_cents) FILTER (WHERE p.status = 'approved'), 0)::bigint AS commission_cents,
        COALESCE(SUM(p.amount_cents) FILTER (WHERE p.status = 'refunded'), 0)::bigint AS refunds_cents,
        COUNT(*) FILTER (WHERE p.status = 'approved')::int AS approved_count
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE o.provider_id = ${providerId}
    `;

    // ── REVENUE BY MONTH (approved payments, last 6 months, oldest→newest) for the chart.
    const byMonth = await sql`
      SELECT
        to_char(date_trunc('month', p.created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(p.amount_cents), 0)::bigint AS gross_cents,
        COALESCE(SUM(p.commission_cents), 0)::bigint AS commission_cents
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE o.provider_id = ${providerId}
        AND p.status = 'approved'
        AND p.created_at >= date_trunc('month', now()) - interval '5 months'
      GROUP BY date_trunc('month', p.created_at)
      ORDER BY date_trunc('month', p.created_at) ASC
    `;

    // ── CURRENCY (this provider's de-facto currency, from its orders; default ARS).
    const currencyRows = await sql`
      SELECT currency, COUNT(*)::int AS n
      FROM orders
      WHERE provider_id = ${providerId}
      GROUP BY currency
      ORDER BY n DESC
      LIMIT 1
    `;

    // ── LEDGER (payments × orders, most recent 100) — date, type (order kind), counterpart owner,
    // gross, commission, status. The UI computes net per row (approved: gross − commission; refunded
    // shows as a negative line).
    const ledger = await sql`
      SELECT
        p.id,
        p.created_at,
        o.kind AS type,
        o.id AS order_id,
        p.status,
        p.amount_cents AS gross_cents,
        p.commission_cents,
        p.rail,
        COALESCE(up.full_name, up.username) AS counterpart
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      LEFT JOIN user_profiles up ON up.id = o.owner_user_id
      WHERE o.provider_id = ${providerId}
      ORDER BY p.created_at DESC
      LIMIT 100
    `;

    // ── PAYOUTS (settlements out to this provider) + paid/pending totals.
    const payouts = await sql`
      SELECT id, created_at, amount_cents, status, rail, external_id
      FROM payouts
      WHERE provider_id = ${providerId}
      ORDER BY created_at DESC
    `;
    const payoutTotalsRows = await sql`
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::bigint AS paid_out_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_payout_cents
      FROM payouts
      WHERE provider_id = ${providerId}
    `;

    const totals = totalsRows[0] ?? {
      gross_cents: 0,
      commission_cents: 0,
      refunds_cents: 0,
      approved_count: 0,
    };
    const grossCents = Number(totals.gross_cents);
    const commissionCents = Number(totals.commission_cents);
    const refundsCents = Number(totals.refunds_cents);
    const netCents = grossCents - commissionCents - refundsCents;

    const payoutTotals = payoutTotalsRows[0] ?? {
      paid_out_cents: 0,
      pending_payout_cents: 0,
    };
    const paidOutCents = Number(payoutTotals.paid_out_cents);
    const pendingPayoutCents = Number(payoutTotals.pending_payout_cents);

    // Aggregate reconciliation: what's been earned (net captured) vs settled (paid out) vs scheduled
    // (pending). Unreconciled = captured-but-not-yet-paid-or-scheduled (never negative for display).
    const unreconciledCents = Math.max(
      netCents - paidOutCents - pendingPayoutCents,
      0,
    );

    return Response.json({
      provider_id: Number(providerId),
      currency: currencyRows[0]?.currency ?? "ARS",
      revenue: {
        gross_cents: grossCents,
        commission_cents: commissionCents,
        refunds_cents: refundsCents,
        net_cents: netCents,
        approved_count: Number(totals.approved_count),
        by_month: byMonth.map((r) => ({
          month: r.month,
          gross_cents: Number(r.gross_cents),
          commission_cents: Number(r.commission_cents),
          net_cents: Number(r.gross_cents) - Number(r.commission_cents),
        })),
      },
      ledger: ledger.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        type: r.type,
        order_id: r.order_id,
        status: r.status,
        gross_cents: Number(r.gross_cents),
        commission_cents: Number(r.commission_cents),
        net_cents:
          r.status === "refunded"
            ? -Number(r.gross_cents)
            : Number(r.gross_cents) - Number(r.commission_cents),
        rail: r.rail,
        counterpart: r.counterpart,
      })),
      payouts: {
        rows: payouts.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          amount_cents: Number(r.amount_cents),
          status: r.status,
          rail: r.rail,
          external_id: r.external_id,
        })),
        paid_out_cents: paidOutCents,
        pending_payout_cents: pendingPayoutCents,
      },
      reconciliation: {
        net_captured_cents: netCents,
        paid_out_cents: paidOutCents,
        pending_payout_cents: pendingPayoutCents,
        unreconciled_cents: unreconciledCents,
      },
    });
  } catch (error) {
    if (error instanceof ProviderAuthError || error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/sales] Error:", error?.message);
    return Response.json({ error: "Failed to load sales" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrapper — the aggregates run under the caller's RLS identity
// (no cross-provider read).
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
