// The screen template currently shown (set by the navigation observer; read when an error / tap is recorded).
// Memory only. PURE.

let current = 'unknown';

export function setCurrentScreen(screen) {
  if (typeof screen === 'string') current = screen;
}

export function getCurrentScreen() {
  return current;
}
