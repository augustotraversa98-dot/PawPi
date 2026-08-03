import sql from "@/app/api/utils/sql";
import { decryptToken } from "@/app/api/utils/payments/tokenCrypto";

// ⛔ TEMPORARY OPS DIAGNOSTIC — MUST BE REMOVED AFTER USE. Not linked anywhere.
//
// Purpose (one-shot): fetch MercadoPago's VERBATIM status/status_detail for Vet Krauss's
// (provider 3) latest booking checkout, using the connected seller's token decrypted with the
// PRODUCTION PAYMENTS_TOKEN_KEY (which only exists on the server). Read-only: it NEVER charges,
// NEVER mutates an order/payment, and NEVER returns the token or any of our secrets.
//
// GATE: inert (404) unless DIAG_TOKEN is set on the server AND the caller sends a matching
// x-diag-token header. Both the route and the env var are removed immediately after the run.
async function GET(request) {
  const expected = process.env.DIAG_TOKEN;
  const provided = request.headers.get("x-diag-token");
  if (!expected || provided !== expected) {
    return new Response("Not found", { status: 404 });
  }

  const mpGet = async (url, token) => {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { http: r.status, body };
  };

  try {
    // 1. Latest booking order for provider 3. Its id IS the external_reference our code sends.
    const [prov] = await sql`SELECT owner_user_profile_id FROM providers WHERE id = 3`;
    const ownerId = prov?.owner_user_profile_id ?? null;
    const orders = await sql.begin(async (tx) => {
      if (ownerId != null) {
        await tx`select set_config('app.current_user_id', ${String(ownerId)}, true)`;
      }
      return tx`
        SELECT id, amount_cents, currency, status, created_at
        FROM orders WHERE provider_id = 3 AND kind = 'booking'
        ORDER BY id DESC LIMIT 1
      `;
    });
    const order = orders[0] ?? null;
    if (!order) return Response.json({ error: "no booking order for provider 3" });

    // The stored payment row carries the MP preference id (external_id). payments is
    // FORCE-RLS, so read it under the provider owner's identity too.
    const payRows = await sql.begin(async (tx) => {
      if (ownerId != null) {
        await tx`select set_config('app.current_user_id', ${String(ownerId)}, true)`;
      }
      return tx`SELECT external_id FROM payments WHERE order_id = ${order.id} ORDER BY id DESC LIMIT 1`;
    });
    const preferenceId = payRows[0]?.external_id ?? null;

    // 2. Connected account via the SECURITY DEFINER reader (bypasses RLS); decrypt in-process.
    const acctRows = await sql`SELECT * FROM app_get_provider_payment_account(3::int, 'mercadopago')`;
    const acct = acctRows[0] ?? null;
    if (!acct?.access_token) return Response.json({ error: "no connected account/token" });
    let token;
    try {
      token = decryptToken(acct.access_token);
    } catch (e) {
      return Response.json({ error: "token decrypt failed", detail: e?.message ?? null });
    }

    // 3a. Merchant orders by external_reference (= order id).
    const mo = await mpGet(
      `https://api.mercadopago.com/merchant_orders/search?external_reference=${order.id}`,
      token,
    );
    const elements = Array.isArray(mo.body?.elements) ? mo.body.elements : [];
    const moPaymentSummaries = elements.flatMap((el) =>
      (el.payments ?? []).map((p) => ({
        id: p.id,
        status: p.status,
        status_detail: p.status_detail,
        transaction_amount: p.transaction_amount,
      })),
    );

    // 3b. Each payment's verbatim status + status_detail + rejection cause.
    const payments = [];
    for (const el of elements) {
      for (const p of el.payments ?? []) {
        const pr = await mpGet(`https://api.mercadopago.com/v1/payments/${p.id}`, token);
        payments.push({
          id: p.id,
          http: pr.http,
          status: pr.body?.status ?? null,
          status_detail: pr.body?.status_detail ?? null,
          payment_type_id: pr.body?.payment_type_id ?? null,
          payment_method_id: pr.body?.payment_method_id ?? null,
          currency_id: pr.body?.currency_id ?? null,
          transaction_amount: pr.body?.transaction_amount ?? null,
          message: pr.body?.message ?? null,
          cause: pr.body?.cause ?? null,
        });
      }
    }

    // 3c. Re-fetch the preference: who is the collector, is it a valid marketplace pref,
    //     and does it carry a sandbox_init_point (test) vs only init_point (prod)?
    let preference = null;
    if (preferenceId) {
      const pf = await mpGet(
        `https://api.mercadopago.com/checkout/preferences/${preferenceId}`,
        token,
      );
      preference = {
        http: pf.http,
        id: pf.body?.id ?? null,
        collector_id: pf.body?.collector_id ?? null,
        client_id: pf.body?.client_id ?? null,
        marketplace: pf.body?.marketplace ?? null,
        marketplace_fee: pf.body?.marketplace_fee ?? null,
        operation_type: pf.body?.operation_type ?? null,
        external_reference: pf.body?.external_reference ?? null,
        has_init_point: pf.body?.init_point != null,
        has_sandbox_init_point: pf.body?.sandbox_init_point != null,
        site_id: pf.body?.site_id ?? null,
        error: pf.http >= 400 ? pf.body : undefined,
      };
    }

    // 3c-bis. Direct payments search — catches a REJECTED payment even when no merchant_order
    //         exists. By external_reference, and a recent-list fallback for any stray attempt.
    const paySearchRef = await mpGet(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${order.id}`,
      token,
    );
    const paySearchRecent = await mpGet(
      `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=5`,
      token,
    );
    const summarizePaySearch = (b) =>
      Array.isArray(b?.results)
        ? b.results.map((p) => ({
            id: p.id,
            status: p.status,
            status_detail: p.status_detail,
            external_reference: p.external_reference,
            payment_method_id: p.payment_method_id,
            date_created: p.date_created,
          }))
        : b;
    const payments_search = {
      by_external_reference: {
        http: paySearchRef.http,
        total: paySearchRef.body?.paging?.total ?? null,
        results: summarizePaySearch(paySearchRef.body),
      },
      recent_on_seller: {
        http: paySearchRecent.http,
        total: paySearchRecent.body?.paging?.total ?? null,
        results: summarizePaySearch(paySearchRecent.body),
      },
    };

    // 3d. Who is the connected seller, per MercadoPago? Confirms test-user status + site.
    const meRes = await mpGet("https://api.mercadopago.com/users/me", token);
    const seller = {
      http: meRes.http,
      id: meRes.body?.id ?? null,
      nickname: meRes.body?.nickname ?? null,
      site_id: meRes.body?.site_id ?? null,
      tags: meRes.body?.tags ?? null, // test users carry a "test_user" tag
      user_type: meRes.body?.user_type ?? null,
      error: meRes.http >= 400 ? meRes.body : undefined,
    };

    return Response.json({
      order: {
        id: order.id,
        external_reference: String(order.id),
        amount_cents: order.amount_cents,
        currency: order.currency,
        status: order.status,
        created_at: order.created_at,
      },
      account_ref: acct.account_ref,
      seller,
      preference,
      merchant_orders: {
        http: mo.http,
        count: elements.length,
        raw: mo.body,
        payment_summaries: moPaymentSummaries,
      },
      payments_search,
      payments,
    });
  } catch (e) {
    return Response.json({ error: "diag failed", detail: e?.message ?? String(e) });
  }
}

export { GET };
