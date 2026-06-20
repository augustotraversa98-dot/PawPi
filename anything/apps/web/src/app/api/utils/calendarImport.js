// calendarImport — pure iCal/ICS parsing for business calendar IMPORT (Phase 2 ticket 2.84).
//
// Parses a Google "secret address in iCal format" / Outlook published ICS / Apple shared ICS feed
// into PawPi "busy" windows: [{ starts_at, ends_at, source_uid }] as ISO timestamptz strings. No
// I/O, no deps — unit-testable in the fast vitest gate. The DB-write + scheduler live in the routes;
// this module only turns text into busy windows.
//
// Scope (v1): one busy block per VEVENT. RRULE recurrence is NOT expanded (documented limitation —
// recurring all-day "busy" rarely matters for slot blocking, and full RRULE expansion is a follow-up).
// Timezones: a trailing 'Z' is UTC; a TZID/floating value is treated as UTC (no tz database server
// side) — good enough for blocking, and the provider sees the synced result.

// RFC 5545 line unfolding: a CRLF followed by a space/tab continues the previous line.
function unfold(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

// Parse an ICS date/time value (the part AFTER the ':') + its property params into an ISO string.
// Handles: 20260620T130000Z (UTC), 20260620T130000 (floating→UTC), VALUE=DATE 20260620 (all-day).
function icsDateToIso(value, params = "") {
  const v = String(value || "").trim();
  const isDateOnly = /VALUE=DATE(?![-])/i.test(params) || /^\d{8}$/.test(v);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", ss = "00"] = m;
  if (isDateOnly) {
    return `${y}-${mo}-${d}T00:00:00.000Z`;
  }
  const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}.000Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Parse an ISO-8601 duration (e.g. PT1H30M, P1D) into milliseconds. Best-effort; 0 on no match.
function durationToMs(dur) {
  const m = String(dur || "")
    .trim()
    .match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, w, d, h, min, s] = m.map((x) => (x ? parseInt(x, 10) : 0));
  return (
    (w * 7 * 24 * 60 * 60 +
      d * 24 * 60 * 60 +
      h * 60 * 60 +
      min * 60 +
      s) *
    1000
  );
}

// Pull the first line for a property NAME (e.g. DTSTART) from an unfolded VEVENT block, returning
// { params, value } or null. Property lines look like `DTSTART;TZID=...:20260620T130000`.
function getProp(block, name) {
  const re = new RegExp(`^${name}([^:\\n]*):(.*)$`, "im");
  const m = block.match(re);
  if (!m) return null;
  return { params: m[1] || "", value: (m[2] || "").trim() };
}

/**
 * parseIcsBusy(icsText) → [{ starts_at, ends_at, source_uid }] (ISO strings).
 * Best-effort: a VEVENT missing a usable start/end is skipped; never throws. Returns [] for empty
 * or non-calendar input.
 */
export function parseIcsBusy(icsText) {
  const text = unfold(icsText);
  if (!/BEGIN:VCALENDAR/i.test(text) && !/BEGIN:VEVENT/i.test(text)) return [];

  const blocks = text.split(/BEGIN:VEVENT/i).slice(1);
  const out = [];
  for (const raw of blocks) {
    const block = raw.split(/END:VEVENT/i)[0];
    const dtStart = getProp(block, "DTSTART");
    if (!dtStart) continue;
    const start = icsDateToIso(dtStart.value, dtStart.params);
    if (!start) continue;

    let end = null;
    const dtEnd = getProp(block, "DTEND");
    if (dtEnd) {
      end = icsDateToIso(dtEnd.value, dtEnd.params);
    }
    if (!end) {
      const dur = getProp(block, "DURATION");
      if (dur) {
        const ms = durationToMs(dur.value);
        if (ms > 0) end = new Date(new Date(start).getTime() + ms).toISOString();
      }
    }
    if (!end) {
      // All-day / no end: block the whole start day (24h).
      end = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
    if (!(start < end)) continue; // skip zero/negative-length events

    const uid = getProp(block, "UID");
    out.push({
      starts_at: start,
      ends_at: end,
      source_uid: uid ? uid.value : null,
    });
  }
  return out;
}

/**
 * fetchIcsFeed(url, { fetchImpl, timeoutMs }) → ics text | null.
 * Best-effort network read with a timeout; returns null on any failure (an unreachable/invalid URL
 * fails soft so one bad feed never fails the sync run). Never throws.
 */
export async function fetchIcsFeed(url, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      signal: controller?.signal,
    });
    if (!res?.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
