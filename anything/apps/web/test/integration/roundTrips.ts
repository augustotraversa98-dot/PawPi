// Counts the SEQUENTIAL round trips ("flights") a request makes on its transaction, so a regression that
// re-serialises independent statements fails CI (perf audit 2026-10-23, section 5.2).
//
// Production latency is `flights x ~170 ms` (Virginia <-> Sao Paulo). porsager pipelines statements that are
// queued before the first one is answered, so the cost of a request is not its statement count but the
// number of times it has to WAIT for the database. We measure exactly that from the JS side: a statement
// that starts while another is still in flight joins its flight; one that starts when nothing is in flight
// opens a new flight.
//
// WHAT THIS CANNOT SEE (why production was slower than this test said): it counts awaits in JavaScript, not packets.
// With porsager's `prepare:false` every statement that has a bound parameter makes porsager send a Describe, WAIT
// for Postgres to answer, and only then send the query: two network flights that look like one await here, and they
// never overlap. Against a Postgres on localhost that is invisible; at 133 ms per flight it was most of the latency
// (2026-10-26 re-measure: /api/pets = 8 flights = 1064 ms). The wire-level counter that does see it, and the flag
// that removes it, are test/integration/delayProxy.ts and single-flight.integration.test.ts. Keep using this file for
// what it is good at: proving independent statements are queued together instead of awaited in series.
//
// Scope: statements issued on the request transaction handle (`tx`). BEGIN and COMMIT happen inside porsager
// and are not counted here, so a route's real total is `flights + 2` (+ the token-revocation check, which
// runs before the transaction and is cached). Statements issued on a savepoint handle are not counted either;
// the routes asserted on do not use savepoints.

type Tx = any;

export interface FlightCounter {
  /** Number of sequential flights since the last reset(). */
  flights(): number;
  /** Total statements started since the last reset(). */
  statements(): number;
  reset(): void;
  /** Restore the original `pool.begin`. */
  uninstall(): void;
}

/** `pool` is the porsager client exported by '@/app/api/utils/sql' (imported by the test AFTER DATABASE_URL is set). */
export function installFlightCounter(pool: any): FlightCounter {
  const original = pool.begin;
  let inflight = 0;
  let flights = 0;
  let statements = 0;

  const wrapQuery = (query: any) => {
    if (!query || typeof query.handle !== 'function') return query;
    const handle = query.handle.bind(query);
    let started = false;
    query.handle = () => {
      if (!started) {
        started = true;
        statements += 1;
        if (inflight === 0) flights += 1;
        inflight += 1;
        // Observe settlement WITHOUT going through Query.then (which would call handle() again).
        const done = () => {
          inflight -= 1;
        };
        Promise.prototype.then.call(query, done, done);
      }
      return handle();
    };
    return query;
  };

  const wrapTx = (tx: Tx): Tx =>
    new Proxy(tx, {
      apply: (target, thisArg, args) => wrapQuery(Reflect.apply(target, thisArg, args)),
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  pool.begin = (...args: any[]) => {
    const fn = args[args.length - 1];
    if (typeof fn !== 'function') return original.apply(pool, args);
    return original.apply(pool, [...args.slice(0, -1), (tx: Tx) => fn(wrapTx(tx))]);
  };

  return {
    flights: () => flights,
    statements: () => statements,
    reset: () => {
      flights = 0;
      statements = 0;
      inflight = 0;
    },
    uninstall: () => {
      pool.begin = original;
    },
  };
}
