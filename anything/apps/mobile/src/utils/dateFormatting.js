/**
 * Date Formatting Utilities
 *
 * Auto-format date inputs as the user types
 * Convert between display format (MM/DD/YYYY) and database format (YYYY-MM-DD)
 */

/**
 * Format input as MM/DD/YYYY while user types
 * @param {string} input - Raw user input
 * @returns {string} Formatted date string
 *
 * Examples:
 * "05" → "05/"
 * "0508" → "05/08/"
 * "05082026" → "05/08/2026"
 */
export function formatDateInput(input) {
  // Remove all non-digits
  const digits = input.replace(/\D/g, "");

  // Apply formatting
  if (digits.length <= 2) {
    return digits;
  } else if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  } else {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }
}

/**
 * Convert MM/DD/YYYY to YYYY-MM-DD for database storage
 * @param {string} displayDate - Date in MM/DD/YYYY format
 * @returns {string} Date in YYYY-MM-DD format
 *
 * Example:
 * "05/08/2026" → "2026-05-08"
 */
export function displayToDbDate(displayDate) {
  if (!displayDate) return "";

  const parts = displayDate.split("/");
  if (parts.length !== 3) return displayDate;

  const [month, day, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Convert YYYY-MM-DD to MM/DD/YYYY for display
 * @param {string} dbDate - Date in YYYY-MM-DD format
 * @returns {string} Date in MM/DD/YYYY format
 *
 * Example:
 * "2026-05-08" → "05/08/2026"
 */
export function dbToDisplayDate(dbDate) {
  if (!dbDate) return "";

  const parts = dbDate.split("-");
  if (parts.length !== 3) return dbDate;

  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

/**
 * Validate if a date string is a complete valid date
 * @param {string} dateStr - Date string in MM/DD/YYYY format
 * @returns {boolean} True if valid date
 */
export function isValidDate(dateStr) {
  if (!dateStr) return false;

  const parts = dateStr.split("/");
  if (parts.length !== 3) return false;

  const [month, day, year] = parts.map(Number);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;

  // Check if the date is valid
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Get today's date in MM/DD/YYYY format
 * @returns {string} Today's date
 */
export function getTodayDisplayDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const year = today.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string} Today's date in database format
 */
export function getTodayDbDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const year = today.getFullYear();
  return `${year}-${month}-${day}`;
}
