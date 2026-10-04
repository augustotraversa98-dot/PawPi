// pawpi_db_* metrics for the shared `sql` helper (src/app/api/utils/sql.js).
//
// LABEL = operation type only (select/insert/update/delete/other), derived from the first keyword of the
// SQL text. The SQL text, parameters and table names are NEVER labels.
//
// How a query is observed without changing it: porsager's Query is a lazy thenable (a Promise subclass
// that executes on the first .then/.catch/.finally/await). We patch ONE own property -- `then` -- on the
// very Query object the caller receives, so `.values()`, `.execute()`, `.cancel()`, `.raw()`, cursor/forEach
// and error propagation all keep operating on the real, unchanged object. On the first `then` we attach a
// separate observer chain (its own rejection handler, so it can never create an unhandled rejection) and
// then delegate to the original `then` with the caller's exact arguments. Every metric action is in
// try/catch. Queries that are never awaited (fragments embedded in another template) are never executed
// and so are never recorded.

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('pawpi-server', '1.0.0');

const queryDuration = meter.createHistogram('pawpi_db_query_duration_seconds', {
  description: 'Database query duration by operation type',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  },
});

const queryErrors = meter.createCounter('pawpi_db_errors_total', {
  description: 'Failed database queries by operation type',
});

export const DB_OPS = Object.freeze(['select', 'insert', 'update', 'delete', 'other']);

// Strip leading whitespace, `-- line` and `/* block */` comments and opening parens.
const LEADING_NOISE_RE = /^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\()+/;

/**
 * Operation type for a SQL string: the first keyword (select/insert/update/delete); a leading `with`
 * (CTE) is resolved by whether the text contains a data-modifying statement; everything else
 * (set_config, begin, savepoint, create, call, ...) is 'other'. Never throws.
 */
export function classifySqlOp(text) {
  try {
    if (typeof text !== 'string') return 'other';
    const body = text.replace(LEADING_NOISE_RE, '');
    const first = /^[a-z]+/i.exec(body)?.[0].toLowerCase();
    if (first === 'select' || first === 'insert' || first === 'update' || first === 'delete') return first;
    if (first === 'with') {
      const mod = /\b(insert\s+into|update\s+[a-z_"]|delete\s+from)/i.exec(body)?.[1];
      if (!mod) return 'select';
      return mod.toLowerCase().startsWith('insert') ? 'insert' : mod.toLowerCase().startsWith('update') ? 'update' : 'delete';
    }
    return 'other';
  } catch {
    return 'other';
  }
}

/** SQL text of a tagged-template call's first argument (`strings`), or of `sql.unsafe(text)`. Else ''. */
export function sqlTextOf(first) {
  if (typeof first === 'string') return first;
  if (Array.isArray(first)) return first.join(' ');
  return '';
}

function record(op, startedAt, failed) {
  try {
    queryDuration.record((performance.now() - startedAt) / 1000, { op });
    if (failed) queryErrors.add(1, { op });
  } catch {
    // never affect a query
  }
}

/**
 * Attach duration/error recording to a porsager Query (returned as-is). Anything that is not a thenable
 * Query -- helper objects from sql(rows), sql(identifier), plain values -- is returned untouched.
 * @param {any} query  value returned by a porsager call
 * @param {any} text  the call's first argument (template strings array or SQL string); only its first keyword is used
 */
export function observeQuery(query, text) {
  try {
    if (!query || typeof query.then !== 'function' || typeof query.handle !== 'function') return query;
    const originalThen = query.then;
    let observed = false;
    query.then = function observedThen(...args) {
      if (!observed) {
        observed = true;
        try {
          const op = classifySqlOp(sqlTextOf(text)); // lazily: fragments that never run cost nothing
          const startedAt = performance.now();
          originalThen.call(
            this,
            () => record(op, startedAt, false),
            () => record(op, startedAt, true)
          );
        } catch {
          // fall through to the unobserved original behaviour
        }
      }
      return originalThen.apply(this, args);
    };
  } catch {
    // leave the query exactly as porsager built it
  }
  return query;
}
