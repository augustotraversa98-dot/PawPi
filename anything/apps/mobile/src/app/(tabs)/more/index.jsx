import React, { useEffect } from "react";
import { useNavigation } from "expo-router";
import PetProfileScreen from "@/app/pet-profile";

// The bottom-right "Profile" tab (ticket 2.60) IS the active pet's social
// profile. We reuse the pet-profile screen in `embedded` mode: it falls back to
// the current pet (no route param) and swaps the back button for the ☰ burger
// (OwnerMenu), which still exposes every former More destination + the My Dogs
// switcher. Keeping this a stable tab-root component preserves the 2.19 nav fix
// + popToTopOnBlur.
export default function ProfileTab() {
  // `navigation` here is the More STACK's own nav object (this screen IS the
  // stack's `index`/base route, kept permanently mounted by the `unstable_settings`
  // anchor in more/_layout.jsx). `.getParent()` is the Tab navigator's nav object
  // for the "more" route one level up.
  //
  // The 2.19 `popToTopOnBlur` prop only exists on the Android JS <Tabs> bar
  // (_layout.jsx). iOS's Liquid Glass tab bar (expo-router NativeTabs) has no such
  // prop — it only resets a tab's stack on a REPEAT tap of an already-active tab
  // (Apple's native `specialEffects.repeatedTabSelection`), not on switching TO the
  // tab from elsewhere. That gap is the nav-stack-corruption bug: leave Profile
  // for Reminders/Settings, switch to another tab, tap back to Profile — you land
  // on the stale nested screen instead of the root, and it takes a second tap to
  // self-correct via the repeat-tap behavior.
  //
  // Fix cross-platform at the navigation-state level instead of the tab-bar level:
  // whenever the "more" tab itself loses focus (switching away, on ANY platform),
  // pop its Stack back to this root. That also unmounts any pushed screen (e.g.
  // reminders.jsx), so in-component state living there — like RoutinesTab's
  // routine-creation modal — resets instead of lingering. This doesn't touch
  // in-tab back navigation (Health → reminders origin), which never blurs "more".
  const navigation = useNavigation();
  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    return parent.addListener("blur", () => {
      navigation.popToTop();
    });
  }, [navigation]);

  return <PetProfileScreen embedded />;
}
