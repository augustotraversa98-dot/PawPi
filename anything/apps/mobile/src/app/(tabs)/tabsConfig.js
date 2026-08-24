// Single source of truth for the five primary bottom tabs (Liquid Glass redesign).
// BOTH the iOS native tab bar (expo-router/unstable-native-tabs) and the Android
// JS <Tabs> render from this array, so the route names, order, labels and icons
// stay in lockstep across platforms and are asserted once in _layout.test.jsx.
//
// Route `name` values are load-bearing: deep links and tests depend on them —
// never rename them here (index / health / training / services / more).
//
//   titleKey  — i18n key for the tab label (t(titleKey))
//   sf        — SF Symbol (iOS native tabs), unselected state
//   sfActive  — SF Symbol shown when the tab is selected (iOS 26 scroll-edge tint
//               applies to it); falls back to `sf` when there's no filled variant
//   lucide    — the lucide-react-native glyph used by the Android JS bar

import { Home, HeartPulse, PawPrint, Stethoscope, User } from "lucide-react-native";

export const TABS = [
  {
    name: "index",
    titleKey: "tabs.feed",
    sf: "house",
    sfActive: "house.fill",
    lucide: Home,
  },
  {
    name: "health",
    titleKey: "tabs.health",
    sf: "heart.text.square",
    sfActive: "heart.text.square.fill",
    lucide: HeartPulse,
  },
  {
    name: "training",
    titleKey: "tabs.care",
    sf: "pawprint",
    sfActive: "pawprint.fill",
    lucide: PawPrint,
  },
  {
    name: "services",
    titleKey: "tabs.storesVets",
    sf: "stethoscope",
    sfActive: "stethoscope", // no distinct filled variant in SF Symbols
    lucide: Stethoscope,
  },
  {
    name: "more",
    titleKey: "tabs.profile",
    // Profile: native tabs can't host the <PetAvatar> component, so we use a paw
    // SF Symbol on iOS (reliable tinting + scroll-edge). The Android JS bar keeps
    // the pet-photo avatar via ProfileTabIcon (see _layout.jsx).
    sf: "pawprint.circle",
    sfActive: "pawprint.circle.fill",
    lucide: User,
  },
];

export default TABS;
