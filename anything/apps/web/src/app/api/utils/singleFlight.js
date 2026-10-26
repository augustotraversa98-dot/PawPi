// REQUEST_SINGLE_FLIGHT feature flag (docs/perf-audit-2026-10-23.md section 6.1: the flight-cost model).
//
// OFF by default. When ON (REQUEST_SINGLE_FLIGHT=on|1|true|yes) two things change, both in the DB transport and
// neither in any route's SQL:
//   1. sql.js turns porsager's `prepare` ON, so a parameterised statement is one flight instead of two (with
//      prepare:false porsager asks Postgres for the parameter types first and waits for the answer).
//   2. withRequestContext runs the request on a reserved connection and writes BEGIN, the identity stamp, the
//      handler's statements and (on opted-in read-only routes) COMMIT without waiting between them
//      (utils/singleFlightTx.js).
//
// Kept in its own import-free module so sql.js and requestContext.js can both read it, and so the many unit
// tests that partially mock either of those two modules never see a missing export.

const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes']);

/** Read at call time, so tests can flip it per request. */
export function singleFlightEnabled(env = process.env) {
  return TRUE_VALUES.has(String(env.REQUEST_SINGLE_FLIGHT ?? '').trim().toLowerCase());
}

/**
 * Whether porsager may use NAMED prepared statements on this connection. Supavisor's transaction-mode port (6543)
 * rotates backends between transactions and answers a named statement it no longer knows with 26000
 * ("prepared statement does not exist") - measured with the 2026-10-26 spike (37 of 100 transactions failed).
 * The session-mode port (5432, what DATABASE_URL uses today) and a direct connection are fine (0 errors in 100).
 */
export function preparedStatementsAllowed(port) {
  return Number(port) !== 6543;
}
