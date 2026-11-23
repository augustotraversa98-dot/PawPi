// popStackOnTabLeave — reset a tab's nested Stack to its root when the user switches to ANOTHER tab.
//
// Used by the Profile ("more") tab (app/(tabs)/more/index.jsx). The iOS Liquid Glass native tab bar only
// pops a tab's stack on a REPEAT tap of the active tab, so without this a user who leaves Profile for
// Reminders/Settings, switches tab and comes back lands on the stale nested screen (QA 2026-09, #571).
//
// Why this is NOT a plain `navigation.popToTop()` on the tab's blur event (the bug it replaces):
//   • The tab's "blur" also fires when a screen is pushed on the ROOT stack OVER the tabs — which is
//     exactly what the OwnerMenu does for Family & caregivers (/pet-sharing), Lost & found, Memories …
//   • By then the More stack is already at its root, so it cannot handle POP_TO_TOP. React Navigation
//     then BUBBLES the action to the parent navigators, and the root stack pops itself to ITS first
//     route. For an account that has just signed up that first route is the onboarding wizard
//     ("/onboarding-photo"), so the owner was thrown back into onboarding (and, filling it in again,
//     risked a duplicate dog — see utils/onboardingGuard.js). For everyone else the pushed screen simply
//     vanished and the menu seemed to do nothing.
//
// The rules below keep the reset but make it impossible to touch any navigator but the tab's own stack:
//   1. nothing to pop (stack already at its root) → do nothing, never dispatch;
//   2. the selected tab is the SAME one that was selected when this tab last gained focus (the blur came
//      from a screen pushed over the tabs, not from a tab switch) → do nothing, the user comes back to
//      exactly where they were;
//   3. otherwise pop, with the action TARGETED at this stack's state key so it can never bubble.

import { StackActions } from "@react-navigation/native";

/**
 * Whether the tab's `blur` should pop its stack, and if so which stack key to target.
 * Pure (no React, no navigation objects) so it is unit-testable.
 *
 * @param {{ key?: string, index?: number } | undefined} stackState  the tab's nested Stack state
 * @param {string | null} selectedTabKeyNow  key of the tab selected right now
 * @param {string | null} selectedTabKeyWhenFocused  key of the tab selected when this tab last gained focus
 *   (null when unknown)
 * @returns {string | null} the stack key to pop, or null to leave navigation alone
 */
export function stackKeyToPopOnTabBlur(stackState, selectedTabKeyNow, selectedTabKeyWhenFocused) {
  if (!stackState?.key || !(stackState.index > 0)) return null; // 1. already at root
  if (selectedTabKeyWhenFocused != null && selectedTabKeyNow === selectedTabKeyWhenFocused) return null; // 2.
  return stackState.key; // 3.
}

/**
 * Subscribe to the tab's focus/blur and reset its stack per the rules above.
 *
 * @param {object} stackNavigation  `useNavigation()` of the screen at the root of the tab's Stack
 * @returns {(() => void) | undefined} unsubscribe, for use as a useEffect cleanup
 */
export function popStackToRootOnTabLeave(stackNavigation) {
  const tabNavigation = stackNavigation?.getParent?.();
  if (!tabNavigation) return undefined;

  const selectedTabKey = () => {
    const tabs = tabNavigation.getState?.();
    return tabs?.routes?.[tabs.index]?.key ?? null;
  };
  // This tab may already be the selected one when we subscribe; otherwise the first "focus" tells us.
  let selectedWhenFocused = tabNavigation.isFocused?.() ? selectedTabKey() : null;

  const offFocus = tabNavigation.addListener("focus", () => {
    selectedWhenFocused = selectedTabKey();
  });
  const offBlur = tabNavigation.addListener("blur", () => {
    const key = stackKeyToPopOnTabBlur(stackNavigation.getState?.(), selectedTabKey(), selectedWhenFocused);
    if (key) stackNavigation.dispatch({ ...StackActions.popToTop(), target: key });
  });
  return () => {
    offFocus?.();
    offBlur?.();
  };
}
