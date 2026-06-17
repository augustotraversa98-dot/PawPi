import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  passwordStrength,
  PASSWORD_MIN_LENGTH,
} from './passwordStrength';

// Ticket 2.32 — the shared strength rule enforced server-side (sign-up) and
// mirrored client-side. Rule: >= 8 chars AND >= 3 of {lower,upper,digit,symbol}
// AND not in the common-password blocklist.

describe('validatePassword', () => {
  it('accepts a strong password (length + 3 classes)', () => {
    expect(validatePassword('Wagtail99').valid).toBe(true); // lower+upper+digit
    expect(validatePassword('Sn!ffSpot1').valid).toBe(true); // all four classes
  });

  it('rejects too-short passwords', () => {
    const r = validatePassword('Ab3$x'); // 5 chars, 4 classes
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(new RegExp(`${PASSWORD_MIN_LENGTH}`));
  });

  it('rejects low-variety passwords (fewer than 3 classes)', () => {
    expect(validatePassword('alllowercase').valid).toBe(false); // 1 class
    expect(validatePassword('lowercase123').valid).toBe(false); // 2 classes
  });

  it('rejects common passwords even if they would otherwise pass length', () => {
    expect(validatePassword('password').valid).toBe(false);
    expect(validatePassword('12345678').valid).toBe(false);
    expect(validatePassword('Password1').valid).toBe(false); // blocklisted variant
  });

  it('rejects empty / non-string', () => {
    expect(validatePassword('').valid).toBe(false);
    expect(validatePassword(undefined).valid).toBe(false);
    expect(validatePassword(null).valid).toBe(false);
  });
});

describe('passwordStrength (meter)', () => {
  it('scores empty as 0 / Very weak and invalid', () => {
    const s = passwordStrength('');
    expect(s.score).toBe(0);
    expect(s.valid).toBe(false);
  });

  it('caps a common password at a low score', () => {
    expect(passwordStrength('password').score).toBeLessThanOrEqual(1);
  });

  it('reports per-class booleans for the requirements checklist', () => {
    const s = passwordStrength('Wagtail99');
    expect(s.classes.lowercase).toBe(true);
    expect(s.classes.uppercase).toBe(true);
    expect(s.classes.digit).toBe(true);
    expect(s.classes.symbol).toBe(false);
    expect(s.classCount).toBe(3);
  });

  it('rates a long, varied password as Strong and valid', () => {
    const s = passwordStrength('Sn!ffSpot1Park');
    expect(s.score).toBe(4);
    expect(s.valid).toBe(true);
  });
});
