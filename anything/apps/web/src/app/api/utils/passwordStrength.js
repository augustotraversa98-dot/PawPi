/**
 * Shared password-strength rule (Ticket 2.32).
 *
 * One source of truth used BOTH server-side (the sign-up / credentials path in
 * `src/auth.js`) and client-side (the live meter on the sign-up form). Pure +
 * dependency-free so it runs in node and the browser and is trivially testable.
 *
 * The rule applies ONLY to NEW passwords (sign-up / password-change). It is
 * never enforced on login of an existing account — existing users keep whatever
 * they have.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_CLASSES = 3;

// Small blocklist of obviously guessable passwords. Compared case-insensitively.
// Not exhaustive — just the worst offenders so "password" / "123456" are refused
// even though they could otherwise satisfy a naive length/variety check.
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "passw0rd",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "00000000",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "1q2w3e4r",
  "zaq12wsx",
  "abc123",
  "letmein",
  "welcome",
  "welcome1",
  "admin",
  "iloveyou",
  "monkey",
  "dragon",
  "football",
  "sunshine",
  "princess",
]);

function characterClasses(password) {
  return {
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

function classCount(classes) {
  return Object.values(classes).filter(Boolean).length;
}

/**
 * Validate a candidate password against the strength rule.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    return { valid: false, errors: ["Password is required"] };
  }

  const errors = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (classCount(characterClasses(password)) < PASSWORD_MIN_CLASSES) {
    errors.push(
      "Mix at least 3 of: lowercase, uppercase, number, and symbol",
    );
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("This password is too common — pick something less guessable");
  }

  return { valid: errors.length === 0, errors };
}

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"];

/**
 * Score a password 0..4 for the live strength meter, plus the per-class booleans
 * the UI uses to tick off requirements.
 * @returns {{ score: number, label: string, classes: object, classCount: number, valid: boolean }}
 */
export function passwordStrength(password) {
  const classes = characterClasses(typeof password === "string" ? password : "");
  const count = classCount(classes);

  if (typeof password !== "string" || password.length === 0) {
    return { score: 0, label: STRENGTH_LABELS[0], classes, classCount: 0, valid: false };
  }

  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  score += Math.max(0, count - 1); // reward variety (up to +3)

  // A common password can never look better than "Weak".
  if (COMMON_PASSWORDS.has(password.toLowerCase())) score = Math.min(score, 1);

  score = Math.max(0, Math.min(score, 4));

  return {
    score,
    label: STRENGTH_LABELS[score],
    classes,
    classCount: count,
    valid: validatePassword(password).valid,
  };
}
