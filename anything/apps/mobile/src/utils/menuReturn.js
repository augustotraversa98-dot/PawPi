// "Back" from a screen opened from the More menu (the Profile tab's ☰ sheet) lands on the More menu again.
//
// The menu is a sheet over the Profile tab root, so it has to close before the chosen screen opens. Without this,
// going back from "Mi centro" (or Settings, Reminders, …) dropped the owner on the dog's profile instead of the
// menu they came from.
//
// The menu reopens ONLY when the user comes straight back: choosing an item arms it, and switching to another
// tab (or tapping a tab) disarms it, so the sheet never pops up out of nowhere later.

// Long enough for the native "pop" transition to finish before a sheet is presented over the screen.
export const MENU_REOPEN_DELAY_MS = 350;

/**
 * @param {object | undefined} stackNavigation  navigation object of the screen that hosts the menu (the root of
 *   the Profile tab's Stack). Without one (a screen rendered outside any navigator) this does nothing.
 * @param {() => void} reopen  shows the menu
 * @returns {{ arm: () => void, dispose: () => void }}
 */
export function watchMenuReturn(stackNavigation, reopen, { delayMs = MENU_REOPEN_DELAY_MS } = {}) {
  const tabNavigation = stackNavigation?.getParent?.();
  const selectedTab = () => {
    const state = tabNavigation?.getState?.();
    return state?.routes?.[state.index]?.key ?? null;
  };

  let armed = false;
  let left = false; // the menu's screen really was left after arming
  let armedTab = null;
  let timer = null;

  const cancelTimer = () => {
    clearTimeout(timer);
    timer = null;
  };
  const disarm = () => {
    armed = false;
    left = false;
    cancelTimer();
  };

  const offs = [
    stackNavigation?.addListener?.("blur", () => {
      cancelTimer();
      if (armed) left = true;
    }),
    stackNavigation?.addListener?.("focus", () => {
      if (!armed || !left) return;
      const sameTab = selectedTab() === armedTab;
      disarm();
      if (sameTab) timer = setTimeout(reopen, delayMs);
    }),
    tabNavigation?.addListener?.("state", () => {
      if (armed && selectedTab() !== armedTab) disarm();
    }),
    tabNavigation?.addListener?.("tabPress", disarm),
  ];

  return {
    arm() {
      if (!stackNavigation?.addListener) return;
      disarm();
      armed = true;
      armedTab = selectedTab();
    },
    dispose() {
      disarm();
      offs.forEach((off) => off?.());
    },
  };
}
