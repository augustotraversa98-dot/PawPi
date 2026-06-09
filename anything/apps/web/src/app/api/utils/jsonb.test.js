import { describe, it, expect } from 'vitest';
import postgres from 'postgres';
import {
  jsonbWriteValue,
  jsonbRoundTrip,
  readMedicalCareItems,
} from './jsonb';

// First real regression test — the PR #19 class (jsonb double-encode).
//
// Write paths once did `${JSON.stringify(value)}` into a jsonb column, so the
// porsager driver encoded the value a SECOND time and stored a jsonb string
// scalar instead of the array/object. Reads then returned a string and the
// mobile reminder generators crashed ("x.forEach is not a function"). The fix
// was `sql.json(value)` — bind the raw value, encode once.
//
// These assertions pin that boundary as pure, DB-free functions. To prove the
// suite catches a re-regression: change `jsonbWriteValue` in ./jsonb to
// `JSON.stringify(value)` and the "encoded once" cases below go red.

const SCHEDULE = {
  medicalCareItems: [
    { id: 'a1', name: 'Insulin', times: ['08:00', '20:00'] },
    { id: 'a2', name: 'Eye drops', times: ['12:00'] },
  ],
};

describe('jsonb write boundary — encoded once, never double-encoded', () => {
  it('round-trips an object back to the SAME object (not a JSON string)', () => {
    const stored = jsonbRoundTrip(jsonbWriteValue(SCHEDULE));
    expect(stored).toEqual(SCHEDULE);
    expect(typeof stored).toBe('object');
  });

  it('round-trips an array back to an array (not a stringified scalar)', () => {
    const arr = ['08:00', '20:00'];
    const stored = jsonbRoundTrip(jsonbWriteValue(arr));
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toEqual(arr);
  });

  it('demonstrates the bug: pre-stringifying stores a string scalar (jsonb_typeof=string)', () => {
    // This is the OLD, broken write path, shown here so the contrast is explicit.
    const doubleEncoded = jsonbRoundTrip(JSON.stringify(SCHEDULE));
    expect(typeof doubleEncoded).toBe('string'); // ← the regression we guard against
    expect(doubleEncoded).not.toEqual(SCHEDULE);
  });

  it('passes null through untouched (the `value ? ... : null` guard at call sites)', () => {
    expect(jsonbWriteValue(null)).toBeNull();
    expect(jsonbWriteValue(undefined)).toBeNull();
    expect(jsonbRoundTrip(null)).toBeNull();
  });
});

describe('porsager sql.json binds the RAW value (this is what makes one-shot encoding work)', () => {
  // The app's `./sql` export is inert without DATABASE_URL, so build a throwaway
  // instance purely to exercise `sql.json` — no connection is opened.
  const sql = postgres({
    host: 'localhost',
    database: 'unused',
    username: 'unused',
    password: 'unused',
  });

  it('wraps the value un-stringified, so the driver encodes it exactly once', () => {
    const param = sql.json(SCHEDULE);
    expect(param.value).toBe(SCHEDULE); // raw object, NOT JSON.stringify(SCHEDULE)
    expect(typeof param.value).not.toBe('string');
  });
});

describe('read boundary — parsed objects, and the masked medicalCareItems case', () => {
  it('returns the parsed array from a correctly-stored object', () => {
    const stored = jsonbRoundTrip(jsonbWriteValue(SCHEDULE));
    expect(readMedicalCareItems(stored)).toEqual(SCHEDULE.medicalCareItems);
  });

  it('pins masked/null medical_care_details -> []', () => {
    expect(readMedicalCareItems(null)).toEqual([]);
    expect(readMedicalCareItems(undefined)).toEqual([]);
    expect(readMedicalCareItems({})).toEqual([]);
  });

  it('a double-encoded string scalar has no .medicalCareItems -> [] (data silently lost)', () => {
    const doubleEncoded = jsonbRoundTrip(JSON.stringify(SCHEDULE));
    expect(readMedicalCareItems(doubleEncoded)).toEqual([]);
  });
});
