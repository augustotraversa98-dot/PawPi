// Helpers for the OSDE-style slot picker (PR-2). PR-1's availability endpoint returns
// discrete slots as ABSOLUTE-UTC instants plus the provider's IANA time_zone; these
// helpers classify slot-based capabilities and format/derive local wall-clock values in
// that zone. Intl is available in the app (see canonicalDateTime.uses12HourClock).

// Capabilities booked on discrete, provider-defined slots (PR-1 seeds default windows for
// these). Everything else (daycare/sitter/walker) keeps the free-form date/time flow.
export const SLOT_CAPABILITIES = ["vet", "groomer", "trainer", "telehealth"];

// The presencial (in-person) slot capabilities — the ones that can pair with telehealth as
// a "Presencial / Videollamada" modality choice.
export const IN_PERSON_SLOT_CAPABILITIES = ["vet", "groomer", "trainer"];

export function isSlotCapability(capability) {
  return SLOT_CAPABILITIES.includes(capability);
}

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * An absolute-UTC ISO instant → the provider-local { date:'YYYY-MM-DD', time:'HH:MM' } in
 * `timeZone`. Inverse of PR-1's server-side slot composition (e.g. '…T12:00:00Z' in Buenos
 * Aires → { date, time:'09:00' }). Used to derive appointment_date/appointment_time for the
 * reminder engine and to label slot chips.
 */
export function slotZonedParts(iso, timeZone) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))) {
    parts[p.type] = p.value;
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** { from, to } canonical dates spanning the whole month (month is 0-based, JS Date style). */
export function monthRange(year, month) {
  const last = new Date(year, month + 1, 0).getDate();
  const mm = pad2(month + 1);
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${pad2(last)}` };
}

/**
 * A Monday-first calendar matrix for a month (month is 0-based): an array of weeks, each 7
 * cells that are either a canonical 'YYYY-MM-DD' string or null (leading/trailing padding).
 */
export function buildMonthMatrix(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon..6=Sun
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad2(month + 1)}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
