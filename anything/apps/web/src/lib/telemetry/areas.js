// Feature-area map for server metrics (docs/observability/night-run/01-TELEMETRY-CONTRACT.md).
//
// `area` is a LOW-CARDINALITY label: every API path maps to exactly one of AREAS, so the label can never
// grow with traffic. ONE place owns the prefix map; the test in areas.test.js walks src/app/api and fails
// if a new top-level route directory is added without being mapped here.

export const AREAS = Object.freeze([
  'auth',
  'pets',
  'feed',
  'health',
  'services',
  'providers',
  'booking',
  'payments',
  'shop',
  'forum',
  'walks',
  'messages',
  'training',
  'adoption',
  'insurance',
  'telehealth',
  'notifications',
  'admin',
  'telemetry',
  'other',
]);

// First path segment after /api  ->  area.
const TOP_LEVEL_AREA = Object.freeze({
  // auth / account lifecycle
  auth: 'auth',
  account: 'auth',
  session: 'auth',
  'user-profile': 'auth',
  onboarding: 'auth',
  legal: 'auth',
  // pets + the people around them
  pets: 'pets',
  household: 'pets',
  'pet-caregivers': 'pets',
  'care-access': 'pets',
  'lost-reports': 'pets',
  // social feed
  posts: 'feed',
  feed: 'feed',
  events: 'feed',
  media: 'feed',
  search: 'feed',
  blocks: 'feed',
  reports: 'feed',
  // health records
  health: 'health',
  routines: 'health',
  'vet-record': 'health',
  'pet-medical-profiles': 'health',
  'pet-vaccinations': 'health',
  'emergency-card': 'health',
  public: 'health', // public/emergency/* = the printed emergency tag/card
  'nutrition-plans': 'health',
  prescriptions: 'health',
  'rx-fulfillment-orders': 'health',
  'rx-refill-requests': 'health',
  recalls: 'health',
  'recall-matches': 'health',
  // services marketplace
  services: 'services',
  discover: 'services',
  places: 'services',
  'saved-places': 'services',
  'transport-trips': 'services',
  // providers (business side)
  providers: 'providers',
  'provider-invites': 'providers',
  // bookings
  'vet-appointments': 'booking',
  me: 'booking', // me/bookings
  calendar: 'booking', // calendar/event + calendar/booking
  // money
  payments: 'payments',
  shop: 'shop',
  // community
  forum: 'forum',
  'social-walks': 'walks',
  'walk-requests': 'walks',
  'dm-threads': 'messages',
  threads: 'messages',
  training: 'training',
  adoption: 'adoption',
  'insurance-leads': 'insurance',
  'insurance-policies': 'insurance',
  notifications: 'notifications',
  'notification-prefs': 'notifications',
  'push-tokens': 'notifications',
  engagement: 'notifications', // reengagement / weekly digest
  admin: 'admin',
  internal: 'admin', // internal/grafana-alert relay
  'client-diagnostics': 'telemetry',
  telemetry: 'telemetry',
  // generic plumbing with no feature of its own
  upload: 'other',
  __create: 'other',
});

// Nested overrides: a sub-resource that belongs to a different feature than its parent directory.
// Matched against the path AFTER `/api/<top>/`; first match wins.
const NESTED_RULES = Object.freeze({
  pets: [
    [/^[^/]+\/(follows?|pack-streaks)(\/|$)/, 'feed'],
    [/^[^/]+\/telehealth/, 'telehealth'],
    [/^[^/]+\/training/, 'training'],
    [/^[^/]+\/walk/, 'walks'],
    [/^[^/]+\/(shop-checkout)/, 'shop'],
    [/^[^/]+\/(sitting-visits|daycare-stays|groom-sessions)/, 'services'],
  ],
  providers: [
    [/^[^/]+\/(book|bookings|availability|live-availability|calendar-feeds)(\/|$)/, 'booking'],
    [/^[^/]+\/(payment-accounts|payouts)(\/|$)/, 'payments'],
    [/^[^/]+\/(shop-products|shop-orders|sales)(\/|$)/, 'shop'],
    [/^[^/]+\/(adoptable-listings|adoption-applications)(\/|$)/, 'adoption'],
    [/^[^/]+\/insurance/, 'insurance'],
    [/^[^/]+\/telehealth/, 'telehealth'],
    [/^[^/]+\/(training-progress|training-sessions)(\/|$)/, 'training'],
    [/^[^/]+\/(walk-|transport-trips)/, 'walks'],
    [/^[^/]+\/(prescriptions|rx-)/, 'health'],
  ],
  health: [[/^deep(\/|$)/, 'telemetry']], // GET /api/health/deep
});

/**
 * Feature area for a request path. Accepts a raw path (query string / hash tolerated) or a route template.
 * Anything outside `/api/` -- SPA pages, assets, unknown prefixes -- is 'other'. Always returns a member
 * of AREAS.
 */
export function areaForPath(path) {
  try {
    if (typeof path !== 'string') return 'other';
    const clean = path.split(/[?#]/)[0];
    const segs = clean.split('/').filter(Boolean);
    if (segs[0] !== 'api' || !segs[1]) return 'other';
    const top = segs[1];
    const rest = segs.slice(2).join('/');
    for (const [re, area] of NESTED_RULES[top] ?? []) {
      if (re.test(rest)) return area;
    }
    return Object.prototype.hasOwnProperty.call(TOP_LEVEL_AREA, top) ? TOP_LEVEL_AREA[top] : 'other';
  } catch {
    return 'other';
  }
}

/** Top-level `/api/<dir>` names that have an explicit area (used by the route-label fallback + tests). */
export const KNOWN_API_PREFIXES = Object.freeze(Object.keys(TOP_LEVEL_AREA));
