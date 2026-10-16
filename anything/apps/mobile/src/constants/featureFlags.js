// Compile-time feature switches for things that are built but not ready to show.
// Flip a constant to true to bring the feature back — no other code needs to change.

// Walk-tracking card (Apple Health / Apple Watch "Coming soon" rows + Manual tracking) in
// Settings and the walk-log modal. Hidden until the integrations actually ship so users never
// see "coming soon" controls (QA 2026-10-16 bug 12).
export const WALK_TRACKING_INTEGRATIONS_ENABLED = false;
