// Shared ?limit / ?offset parsing for list endpoints (AUDIT_2026-09 A-14).
// Defaults are deliberately generous so existing callers that never paged keep seeing a
// full first screen; the cap stops a single call from shipping the whole directory.
export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 500;

export function parsePaging(searchParams, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const rawOffset = Number.parseInt(searchParams.get("offset") ?? "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  return { limit, offset };
}
