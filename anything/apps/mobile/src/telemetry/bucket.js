// Duration bucketing for client telemetry. PURE (no imports): trivially unit-testable.
//
// Labels come from the registry (MS_BUCKETS / DURATION_S_BUCKETS); edges per the contract:
//   ms:      <100, <300, <1000, <3000, <10000, >=10000
//   seconds: <10, <60, <300, <900, <3600, >=3600

/** Milliseconds -> `ms_bucket` label, or null when the value is not a usable number. */
export function msBucket(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  if (n < 100) return 'lt100';
  if (n < 300) return 'lt300';
  if (n < 1000) return 'lt1000';
  if (n < 3000) return 'lt3000';
  if (n < 10000) return 'lt10000';
  return 'gte10000';
}

/** Seconds -> `session_end.duration_s_bucket` label, or null when the value is not a usable number. */
export function durationSecondsBucket(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return null;
  if (n < 10) return 'lt10';
  if (n < 60) return 'lt60';
  if (n < 300) return 'lt300';
  if (n < 900) return 'lt900';
  if (n < 3600) return 'lt3600';
  return 'gte3600';
}
