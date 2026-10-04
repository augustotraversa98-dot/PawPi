// Client-telemetry REGISTRY: the single allowlist behind POST /api/telemetry/events
// (contract: docs/observability/night-run/01-TELEMETRY-CONTRACT.md).
//
// PLAIN DATA, NO IMPORTS, on purpose. The mobile app mirrors this file BYTE-FOR-BYTE as
// anything/apps/mobile/src/telemetry/registry.js (a web test fails if the two ever differ). To add a screen,
// tap target, feature, form or funnel step: edit THIS file, then copy it over the mobile one. Never edit only one.
//
// Unknown event / prop key / screen / target / feature / funnel / step => the server DROPS the event. Regexes are
// stored as source strings so the file stays trivially copyable; the validator (ingestSchema.js) compiles them.

export const REGISTRY_VERSION = 1;

// -- identity / envelope ---------------------------------------------------------------------------------
export const PLATFORMS = ['ios', 'android', 'web'];

// -- events (contract order) ---------------------------------------------------------------------------
export const EVENT_NAMES = [
  'session_start',
  'session_end',
  'screen_view',
  'tap',
  'form_step',
  'api_call',
  'error',
  'nav_unexpected_redirect',
  'perf_startup',
  'perf_screen_ready',
  'feature_used',
  'funnel_step',
  'opt_out',
];

// -- screens -------------------------------------------------------------------------------------------
// A screen is a ROUTE TEMPLATE, never a concrete URL. Conversion rule from a file under
// anything/apps/mobile/src/app:
//   1. drop the extension (.jsx/.tsx/.js/.ts);
//   2. drop group segments "(tabs)" (they are not part of the URL);
//   3. a trailing "index" collapses into its folder ("business/index" -> "/business", "index" -> "/");
//   4. every dynamic segment "[id]" / "[...rest]" becomes ":id" (there are none today);
//   5. prefix "/".
//   src/app/(tabs)/health.jsx -> /health     src/app/(tabs)/index.jsx -> /     src/app/index.jsx -> /
//   src/app/(tabs)/more/settings.jsx -> /more/settings     src/app/service/place.jsx -> /service/place
//   src/app/+not-found.tsx -> /+not-found
// Not screens (excluded): *.test.*, _layout.*, non-code files (AUTH_FLOW.md) and (tabs)/tabsConfig.js (a helper).
// "unknown" is the bounded bucket for a pathname the client cannot map; the client MUST NOT send a raw path.
export const SCREENS = [
  '/',
  '/+not-found',
  '/auth/expo-web-success',
  '/business',
  '/business-adoption',
  '/business/bookings',
  '/business/messages',
  '/business/profile',
  '/business/settings',
  '/chat',
  '/create-walk',
  '/emergency-card',
  '/event-create',
  '/events',
  '/follows',
  '/forum-compose',
  '/forum-thread',
  '/health',
  '/household',
  '/insurance-policy',
  '/lost-found',
  '/memories',
  '/messages',
  '/more',
  '/more/community',
  '/more/data-access',
  '/more/hub',
  '/more/profile',
  '/more/profile-edit',
  '/more/reminders',
  '/more/settings',
  '/nearby-walks',
  '/notifications',
  '/nutrition',
  '/onboarding',
  '/onboarding-photo',
  '/onboarding-photo-preview',
  '/pet-profile',
  '/pet-sharing',
  '/provider-chat',
  '/provider-messages',
  '/rx-fulfillment',
  '/search',
  '/service/activity',
  '/service/adoption',
  '/service/booking-summary',
  '/service/daycare',
  '/service/discover',
  '/service/following',
  '/service/grooming',
  '/service/insurance',
  '/service/my-claims',
  '/service/past-bookings',
  '/service/pet-friendly',
  '/service/place',
  '/service/places',
  '/service/provider',
  '/service/provider-post',
  '/service/shop',
  '/service/sitting',
  '/service/telehealth',
  '/service/telehealth-call',
  '/service/training',
  '/service/transport',
  '/service/vet',
  '/service/walking',
  '/services',
  '/sitter-visits',
  '/training',
  '/transport-track',
  '/vet-business-access',
  '/walk-live',
  '/walker-history',
  '/walker-walks',
  '/weekly-digest',
  '/welcome',
  '/welcome-back',
  '/wrapped',
  'unknown',
];

// -- tap targets ---------------------------------------------------------------------------------------
// A target is a STABLE KEY (never visible text). Pattern for every key (the client lower-cases testID /
// accessibilityLabel keys and turns "-" into "_" before looking them up). A target NOT in TAP_TARGETS is dropped
// by the server; this is a documented SEED, grown by editing the registry (see the header).
export const TAP_TARGET_PATTERN = '^[a-z][a-z0-9_]{0,39}$';
export const TAP_TARGETS = [
  // navigation
  'tab_home',
  'tab_health',
  'tab_services',
  'tab_training',
  'tab_more',
  'back',
  'close',
  'search_open',
  'notifications_open',
  'settings_open',
  // welcome / auth / onboarding
  'welcome_signup',
  'welcome_signin',
  'welcome_continue',
  'auth_google',
  'auth_apple',
  'auth_submit',
  'onboarding_next',
  'onboarding_back',
  'onboarding_skip',
  'onboarding_done',
  'onboarding_photo_pick',
  // pets + health
  'add_dog',
  'edit_dog_save',
  'edit_profile_save',
  'health_add_log',
  'health_track_open',
  'health_log_save',
  'routine_add',
  'routine_save',
  // services / booking / shop
  'services_search',
  'services_category',
  'provider_open',
  'provider_book',
  'booking_confirm',
  'shop_add_to_cart',
  'shop_checkout',
  // social
  'post_create',
  'post_like',
  'post_comment',
  'follow_toggle',
  'share',
  // settings
  'language_toggle',
  'telemetry_toggle',
  'sign_out',
];

// -- features ------------------------------------------------------------------------------------------
export const FEATURES = [
  'add_dog',
  'edit_dog',
  'edit_profile',
  'health_log',
  'routine',
  'booking',
  'shop_checkout',
  'post',
  'comment',
  'follow',
  'search',
  'share_pet',
  'emergency_card',
  'lost_found',
  'telehealth',
  'adoption',
  'insurance',
  'walk_schedule',
  'walk_live',
  'nutrition',
  'wrapped',
  'weekly_digest',
  'household',
  'pet_sharing',
  'language_change',
  'push_opt_in',
  'qr_scan',
  'vet_record',
  'discover',
  'places',
];

// -- forms ---------------------------------------------------------------------------------------------
// form_step { form, step, action }: `form` is a registry key, `step` a short key matching FORM_STEP_PATTERN.
export const FORMS = [
  'onboarding',
  'add_dog',
  'edit_dog',
  'edit_profile',
  'routine',
  'booking',
  'sign_in',
  'sign_up',
  'health_log',
  'post_compose',
  'forum_compose',
  'event_create',
  'walk_create',
  'review',
  'lost_report',
  'claim',
  'other',
];
export const FORM_STEP_PATTERN = '^[a-z][a-z0-9_]{0,39}$';
export const FORM_ACTIONS = ['view', 'complete', 'abandon', 'error'];

// -- funnels (ORDERED steps; contract "Named funnels") -------------------------------------------------------
export const FUNNELS = {
  activation: [
    'welcome_view',
    'signup_or_oauth_start',
    'auth_done',
    'onboarding_photo',
    'onboarding_dog_details',
    'onboarding_done',
    'first_post',
    'first_health_log',
  ],
  services: ['services_tab', 'discover_view', 'provider_view', 'booking_start', 'booking_done'],
  health_logging: ['health_tab', 'track_open', 'log_saved'],
  routines: ['routines_open', 'routine_form_open', 'routine_saved'],
};

// -- areas (mirror of src/lib/telemetry/areas.js AREAS; a test keeps them equal) -----------------------------
export const AREAS = [
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
];

// -- buckets / enums -----------------------------------------------------------------------------------
// Durations in ms: <100, <300, <1000, <3000, <10000, >=10000.
export const MS_BUCKETS = ['lt100', 'lt300', 'lt1000', 'lt3000', 'lt10000', 'gte10000'];
// session_end duration in seconds: <10, <60, <300, <900, <3600, >=3600.
export const DURATION_S_BUCKETS = ['lt10', 'lt60', 'lt300', 'lt900', 'lt3600', 'gte3600'];
export const STATUS_CLASSES = ['1xx', '2xx', '3xx', '4xx', '5xx', 'unknown'];
export const ERROR_KINDS = ['js', 'promise', 'render', 'network', 'api'];
// Why the app landed on onboarding/welcome unexpectedly (nav_unexpected_redirect.reason).
export const NAV_REDIRECT_REASONS = ['onboarding_guard', 'welcome_guard', 'session_expired', 'deeplink', 'other'];

// error.code: a short machine code (HTTP status, error class name, ...), never a message.
export const ERROR_CODE_PATTERN = '^[A-Za-z0-9_.-]{1,32}$';
// api_call.route: a ROUTE TEMPLATE ("/api/pets/:id/profile", params spelled :id) or a bounded fallback token.
export const ROUTE_PATTERN = '^(?:(?:/[a-z0-9_:*.-]{1,40}){1,8}|unknown|unmatched|overflow)$';

// -- per-event prop schema ---------------------------------------------------------------------------
// type: 'bool' | 'enum' (value must be in `values`) | 'pattern' (short safe string matching `pattern`).
// Every listed prop is REQUIRED unless `optional: true`. Any prop not listed => the event is dropped.
// Prop KEYS must also stay clear of the server's PII-looking key rule (email|name|pet|handle|user|address|phone|
// text|password|token|lat|lng|location|ip, case-insensitive); a test enforces it on this table.
export const PROP_SCHEMA = {
  session_start: { cold: { type: 'bool' } },
  session_end: { duration_s_bucket: { type: 'enum', values: DURATION_S_BUCKETS } },
  screen_view: { screen: { type: 'enum', values: SCREENS } },
  tap: { target: { type: 'enum', values: TAP_TARGETS }, screen: { type: 'enum', values: SCREENS } },
  form_step: {
    form: { type: 'enum', values: FORMS },
    step: { type: 'pattern', pattern: FORM_STEP_PATTERN },
    action: { type: 'enum', values: FORM_ACTIONS },
  },
  api_call: {
    area: { type: 'enum', values: AREAS },
    route: { type: 'pattern', pattern: ROUTE_PATTERN },
    status_class: { type: 'enum', values: STATUS_CLASSES },
    ms_bucket: { type: 'enum', values: MS_BUCKETS },
  },
  error: {
    kind: { type: 'enum', values: ERROR_KINDS },
    screen: { type: 'enum', values: SCREENS },
    code: { type: 'pattern', pattern: ERROR_CODE_PATTERN, optional: true },
  },
  nav_unexpected_redirect: {
    from: { type: 'enum', values: SCREENS },
    to: { type: 'enum', values: SCREENS },
    reason: { type: 'enum', values: NAV_REDIRECT_REASONS },
  },
  perf_startup: { ms_bucket: { type: 'enum', values: MS_BUCKETS } },
  perf_screen_ready: {
    screen: { type: 'enum', values: SCREENS },
    ms_bucket: { type: 'enum', values: MS_BUCKETS },
  },
  feature_used: { feature: { type: 'enum', values: FEATURES } },
  // funnel/step pair is cross-checked against FUNNELS by the validator.
  funnel_step: {
    funnel: { type: 'enum', values: Object.keys(FUNNELS) },
    step: { type: 'pattern', pattern: '^[a-z][a-z0-9_]{0,39}$' },
  },
  opt_out: {},
};

// -- envelope patterns -------------------------------------------------------------------------------
export const ENVELOPE_PATTERNS = {
  install_id: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', // uuid v4
  session_id: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', // any uuid
  app_version: '^[0-9]{1,3}(?:\\.[0-9]{1,4}){1,3}(?:-[A-Za-z0-9.]{1,12})?$', // 1.2 / 1.2.3 / 1.2.3-beta.1
  build: '^[A-Za-z0-9._-]{1,16}$',
  os_major: '^[0-9]{1,3}$',
  locale: '^[a-z]{2}(?:-[A-Z]{2})?$',
};

// -- limits ------------------------------------------------------------------------------------------
export const LIMITS = {
  maxBodyBytes: 32 * 1024,
  maxEvents: 50,
  maxEventT: 2147483647, // ms since session start; anything bigger is nonsense
};
