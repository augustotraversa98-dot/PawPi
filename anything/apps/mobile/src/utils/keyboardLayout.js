// Pure layout math for keyboard-safe sheets / full-screen forms (see KeyboardSafeSheet and
// docs/keyboard-convention.md). Everything here is plain numbers so it can be unit-tested
// without a device: the keyboard bugs only reproduce on a real phone, so the *rules* are pinned
// here instead.
//
// All Y values are in WINDOW coordinates (the same space the iOS keyboard frame is reported in),
// which is correct inside a transparent / full-screen <Modal> (it covers the whole window).

// Sheet height as a share of the window when no keyboard is up.
export const SHEET_DEFAULT_RATIO = 0.9;
// Never let a sheet shrink below this, however tall the keyboard is (tiny phones, split view).
export const SHEET_MIN_HEIGHT = 240;
// Bottom padding under a pinned footer while the keyboard is up. The keyboard already covers the
// home-indicator area, so adding the safe-area inset there only wastes space above the keyboard.
export const FOOTER_PADDING_KEYBOARD = 12;
// Resting padding under a pinned footer (on top of the safe-area bottom inset).
export const FOOTER_PADDING_RESTING = 20;

const finite = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * How many points of the window the keyboard covers. `keyboardScreenY` is
 * `event.endCoordinates.screenY` (the keyboard's top edge); a hidden keyboard reports
 * `screenY === windowHeight` -> 0. Never NaN, never negative, never more than the window.
 */
export function computeKeyboardOverlap(windowHeight, keyboardScreenY) {
  if (!finite(windowHeight) || !finite(keyboardScreenY)) return 0;
  return Math.max(0, Math.min(windowHeight, Math.round(windowHeight - keyboardScreenY)));
}

/**
 * Height of a bottom sheet.
 *
 * - No keyboard: `ratio` of the window (but never taller than the space under the status bar).
 * - Keyboard up: ALL the space between the status bar and the keyboard. The old rule was
 *   "90% of whatever is left above the keyboard", which threw ~10% away on top of the chrome;
 *   with the keyboard up every point matters. The caller lays the content out inside it.
 *
 * `keyboardOverlap` is what computeKeyboardOverlap returned (0 on Android, where the window
 * itself resizes under adjustResize).
 */
export function computeSheetHeight({
  windowHeight,
  keyboardOverlap = 0,
  insetTop = 0,
  ratio = SHEET_DEFAULT_RATIO,
}) {
  if (!finite(windowHeight) || windowHeight <= 0) return SHEET_MIN_HEIGHT;
  const top = finite(insetTop) ? Math.max(0, insetTop) : 0;
  const underStatusBar = windowHeight - top;
  if (!(finite(keyboardOverlap) && keyboardOverlap > 0)) {
    return Math.round(Math.min(windowHeight * ratio, underStatusBar));
  }
  const available = windowHeight - keyboardOverlap - top;
  return Math.round(Math.max(Math.min(available, underStatusBar), SHEET_MIN_HEIGHT));
}

/**
 * Padding under a pinned footer. With the keyboard up it is small and constant; at rest it is the
 * home-indicator inset plus the normal breathing room.
 */
export function computeFooterBottomPadding({ keyboardVisible, insetBottom = 0 }) {
  if (keyboardVisible) return FOOTER_PADDING_KEYBOARD;
  const inset = finite(insetBottom) ? Math.max(0, insetBottom) : 0;
  return inset + FOOTER_PADDING_RESTING;
}

/**
 * The lowest Y of the scroll area that the user can actually SEE and tap: the smaller of the
 * scroll view's own bottom edge and the keyboard's top edge. Scrolling a focused input "above the
 * keyboard" is not enough when a pinned footer sits between the scroll view and the keyboard:
 * an input whose bottom is above the keyboard but below the scroll view's bottom is hidden under
 * the footer (this was the Quick Check "notes field is hidden" bug).
 */
export function computeVisibleBottom(scrollViewBottomY, keyboardTopY) {
  if (!finite(scrollViewBottomY) || !finite(keyboardTopY)) return NaN;
  return Math.min(scrollViewBottomY, keyboardTopY);
}
