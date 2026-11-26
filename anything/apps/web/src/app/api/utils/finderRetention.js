import sql from "@/app/api/utils/sql";

// Finder details (name, phone, email, message left on the public tag page) are kept for 90 days
// (docs/emergency-finder.md). Two layers:
//   1. READ: GET /api/notifications never returns them once the notification is older than this.
//   2. DELETE: app_purge_finder_details() (0146) removes them from the database. It runs from the hourly
//      push-receipts cron job. The period inside the SQL function must stay the same as this constant.
export const FINDER_RETENTION_DAYS = 90;

/**
 * Delete finder details older than the retention period. Never throws.
 * @returns {Promise<number|null>} notifications cleared; null when it could not run (0146 not applied, or an error)
 */
export async function purgeFinderDetails() {
  try {
    const rows = await sql`SELECT app_purge_finder_details() AS n`;
    return Number(rows?.[0]?.n ?? 0);
  } catch (e) {
    if (e?.code !== "42883") console.error("[purgeFinderDetails] FAILED:", e?.message);
    return null;
  }
}
