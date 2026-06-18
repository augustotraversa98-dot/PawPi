import sql from "@/app/api/utils/sql";

// POST /api/recalls/ingest — machine-to-machine pet-food recall ingest (Wave 7 ticket 2.75).
//
// PawPi has no built-in scheduler (per 2.17): an EXTERNAL scheduler fetches the recall feed
// (FDA/AAFCO-style) and POSTs the normalized items here with the shared secret header. Each item is
// upserted idempotently into food_recalls (UNIQUE(source, external_ref)) via the SECURITY DEFINER
// ingest_food_recall, then match_food_recall links it to any matching nutrition plan and raises a
// best-effort 'food_recall' notification. With no CRON_SECRET set the endpoint is DISABLED (503) —
// the feature degrades cleanly (no recalls, no crash).
async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "recall feed not configured" }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) ?? {};
    const recalls = Array.isArray(body.recalls) ? body.recalls : [];
    let ingested = 0;
    let matched = 0;

    for (const r of recalls) {
      if (!r?.source || !r?.external_ref) continue;
      const idRows = await sql`
        SELECT ingest_food_recall(
          ${r.source}, ${r.external_ref}, ${r.brand ?? null}, ${r.product ?? null},
          ${r.reason ?? null}, ${r.recall_date ?? null}, ${r.url ?? null},
          ${r.raw ? JSON.stringify(r.raw) : "{}"}::jsonb
        ) AS id
      `;
      const recallId = idRows[0]?.id;
      if (recallId == null) continue;
      ingested += 1;
      const m = await sql`SELECT match_food_recall(${recallId}) AS n`;
      matched += Number(m[0]?.n ?? 0);
    }

    return Response.json({ ingested, matched });
  } catch (e) {
    console.error("[POST /api/recalls/ingest] Error:", e?.message);
    return Response.json({ error: "Failed to ingest recalls" }, { status: 500 });
  }
}

export { POST };
