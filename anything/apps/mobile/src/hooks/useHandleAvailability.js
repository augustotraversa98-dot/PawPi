import { useEffect, useMemo, useState, useCallback } from "react";
import { useDebouncedValue } from "@/hooks/useSearch";
import { handleFormatCode, normalizeHandle } from "@/utils/validateHandle";

// Live pet-handle availability for onboarding and profile edit (night run #2, PR B).
//
// status:
//   "idle"        nothing typed yet
//   "invalid"     format/reserved problem — `reason` is the code, decided locally, no network
//   "checking"    debouncing or waiting on GET /api/pets/handle-availability
//   "available"   the server says it is free (or it is the pet's own current handle)
//   "taken"       the server says it is taken — `alternatives` are free suggestions
//   "unverified"  the check could not complete (offline/timeout). Saving is still allowed: the
//                 server re-checks on save and answers a friendly 409 if it lost a race.
//
// A result only counts for the exact handle it was fetched for, so a stale "available" can never
// unlock Save for a different string (and Save re-locks the instant the text changes).

const CHECK_DEBOUNCE_MS = 400;
const CHECK_TIMEOUT_MS = 8000;

export function canSaveHandle(status) {
  return status === "available" || status === "unverified";
}

export default function useHandleAvailability(
  handle,
  { petId = null, currentHandle = "", enabled = true } = {},
) {
  const normalized = normalizeHandle(handle);
  const own = normalizeHandle(currentHandle);
  const reason = normalized ? handleFormatCode(normalized) : "";
  const isOwn = !!normalized && normalized === own && !reason;
  const debounced = useDebouncedValue(normalized, CHECK_DEBOUNCE_MS);
  // The last server verdict, tagged with the handle it answers for.
  const [result, setResult] = useState(null);

  const shouldFetch = enabled && !!debounced && !handleFormatCode(debounced) && debounced !== own;

  useEffect(() => {
    if (!shouldFetch) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    // Bound the wait so a dropped connection can't wedge the gate in "checking" forever.
    const timeoutId = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const qs =
      `handle=${encodeURIComponent(debounced)}` +
      (petId != null ? `&pet_id=${encodeURIComponent(petId)}` : "");
    fetch(`/api/pets/handle-availability?${qs}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("check failed"))))
      .then((body) => {
        if (cancelled) return;
        if (body?.valid === false) {
          setResult({ handle: debounced, status: "invalid", reason: body.reason });
        } else if (body?.available) {
          setResult({ handle: debounced, status: "available" });
        } else {
          setResult({
            handle: debounced,
            status: "taken",
            alternatives: Array.isArray(body?.alternatives) ? body.alternatives : [],
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ handle: debounced, status: "unverified" });
      })
      .finally(() => clearTimeout(timeoutId));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [debounced, petId, shouldFetch]);

  // A save-time 409 tells us the handle is taken right now, with fresh alternatives.
  const markTaken = useCallback((takenHandle, alternatives = []) => {
    setResult({
      handle: normalizeHandle(takenHandle),
      status: "taken",
      alternatives: Array.isArray(alternatives) ? alternatives : [],
    });
  }, []);

  return useMemo(() => {
    if (!enabled || !normalized) return { status: "idle", normalized, alternatives: [], markTaken };
    if (reason) return { status: "invalid", reason, normalized, alternatives: [], markTaken };
    if (isOwn) return { status: "available", own: true, normalized, alternatives: [], markTaken };
    if (result && result.handle === normalized) {
      return {
        status: result.status,
        reason: result.reason,
        alternatives: result.alternatives || [],
        normalized,
        markTaken,
      };
    }
    return { status: "checking", normalized, alternatives: [], markTaken };
  }, [enabled, normalized, reason, isOwn, result, markTaken]);
}
