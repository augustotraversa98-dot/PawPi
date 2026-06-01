/**
 * Shared date utilities for Social Pet app
 *
 * These functions ensure consistent date handling across the app,
 * especially for daily update logic.
 */

/**
 * Get the local date string in YYYY-MM-DD format
 * Uses local timezone, not UTC
 *
 * @param {Date} date - Optional date object (defaults to now)
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getLocalPostDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Normalize a post_date value from the database
 * Handles both YYYY-MM-DD strings and ISO timestamp strings
 *
 * @param {string|Date} value - Post date from database
 * @returns {string} Normalized date string in YYYY-MM-DD format
 */
export function normalizePostDate(value) {
  if (!value) return null;

  // If already in YYYY-MM-DD format (10 characters), return as-is
  if (typeof value === "string" && value.length === 10 && value.includes("-")) {
    return value;
  }

  // If it's an ISO timestamp or Date object, extract the date part
  try {
    const dateObj = typeof value === "string" ? new Date(value) : value;
    return getLocalPostDateString(dateObj);
  } catch (error) {
    console.error("[dateUtils] Error normalizing date:", error);
    return null;
  }
}
