// jsonb write/read boundary — the single rule that PR #19 codified.
//
// Our DB client (`./sql`) is porsager's `postgres`. Binding a value to a jsonb
// column parameter, the driver serializes it to JSON **exactly once** on write
// and returns the **parsed** JSON on read. Two consequences:
//
//   - WRITE the RAW value. porsager's `sql.json(value)` binds `value` untouched
//     (its Parameter holds `.value === value`); the driver encodes it once and
//     the column stores the real array/object.
//   - DO NOT pre-stringify. Binding `JSON.stringify(value)` hands the driver a
//     *string*, which it then encodes a *second* time — the column stores a
//     jsonb string scalar (`jsonb_typeof = 'string'`) whose text is itself JSON.
//     Reads then return that string instead of the array/object, and consumers
//     crash with "x.forEach is not a function". That was the PR #19 bug.
//
// Governs every `sql.json(...)` call site for a jsonb column:
//   - routines/route.js  (POST + PUT): feeding_schedule, walk_schedule,
//     medication_details, photo_check_details, medical_care_details,
//     wellness_check_schedule, vet_appointment_schedule
//   - health/{walk,wellness,medical-care}-logs/route.js
//
// These helpers model that contract as pure functions so it can be regression
// tested without a live database. See jsonb.test.js.

/**
 * Prepare a JS value for binding to a jsonb column parameter.
 * Returns the RAW value (or null) — never a pre-stringified string. This mirrors
 * what `sql.json(value)` ultimately binds. The historical bug was returning
 * `JSON.stringify(value)` here, which double-encodes.
 */
export function jsonbWriteValue(value) {
  return value == null ? null : value;
}

/**
 * Model the driver's write→store→read round-trip for a jsonb column: serialize
 * the bound value to JSON once, store, and return the parsed result.
 */
export function jsonbRoundTrip(boundValue) {
  if (boundValue == null) return null;
  return JSON.parse(JSON.stringify(boundValue));
}

/**
 * Read `medical_care_details.medicalCareItems` defensively, mirroring the mobile
 * store mapping (`routinesStore.js`): a correctly-stored object yields its array;
 * a null/masked column — or a double-encoded string scalar, which has no
 * `.medicalCareItems` — yields `[]`.
 */
export function readMedicalCareItems(medicalCareDetails) {
  return medicalCareDetails?.medicalCareItems ?? [];
}
