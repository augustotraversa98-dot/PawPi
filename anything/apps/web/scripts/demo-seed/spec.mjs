// Demo-seed SPEC — the pure, side-effect-free data + distribution logic.
//
// This module holds ONLY data and pure functions (no DB, no fs, no network, no
// argon2, no Date.now in the exported shapes). That keeps it unit-testable under
// the normal Vitest runner (see spec.test.js) and importable from the runner
// (index.mjs) without dragging in node-only deps.
//
// Everything here describes the ONE sanctioned demo account (docs/demo-seed-plan.md).
// All values mirror that plan. Stable keys (emails, usernames, slug, asset keys,
// item ids) are what make the seed idempotent — the runner upserts parents on
// these keys and regenerates children deterministically.

// ─────────────────────────────────────────────────────────────────────────────
// Stable identifiers. Re-running the seed keys off these, and the reset path
// deletes EXACTLY these (the 4 accounts + the filler pool by username prefix).
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_PREFIX = "uploads/demo-seed"; // deterministic → stable URLs, no orphan bloat
export const FILLER_USERNAME_PREFIX = "pawpi_seed_fan_";

// Login + App-Review demo account, plus the friend + clinic-owner accounts.
// The password is the SAME for every demo account (printed by the runner). It is
// only used to log in — credential sign-IN never re-checks password strength.
//
// Addresses are PLUS-ADDRESSED on pawpi.info (augusto+<key>@pawpi.info). Two reasons:
//   1. They must be on a domain we own. These were on pawpi.app, which is NOT ours — so mail to
//      them could never be delivered OR bounced. That became a real problem once the app grew a
//      password-reset flow: an App Reviewer testing "Forgot password?" on the demo login would
//      wait forever for a link that physically cannot arrive, with nothing on screen looking wrong.
//   2. PawPi has exactly ONE mailbox (augusto@pawpi.info) and no budget for more. Everything after
//      the `+` still lands in it, so all four accounts are reachable for free — no extra seat, no
//      alias, no DNS.
// These strings are the seed's IDENTITY KEYS: the runner upserts on them and the reset path deletes
// on them. Changing one here does NOT rename an already-seeded account — it orphans the old row and
// creates a new one. Migrate live rows with an explicit UPDATE first (that is how the pawpi.app →
// pawpi.info move was done), then change these to match.
export const DEMO_PASSWORD = "PawpiDemo2026!";

export const ACCOUNTS = {
  demo: {
    key: "demo",
    email: "augusto+demo@pawpi.info",
    name: "Alex Rivera",
    username: "demo",
    role: "pet_owner",
  },
  luna: {
    key: "luna",
    email: "augusto+luna@pawpi.info",
    name: "Sophie Bennett",
    username: "sophiebennett",
    role: "pet_owner",
  },
  cooper: {
    key: "cooper",
    email: "augusto+cooper@pawpi.info",
    name: "Marcus Lee",
    username: "marcuslee",
    role: "pet_owner",
  },
  clinic: {
    key: "clinic",
    email: "augusto+clinic@pawpi.info",
    name: "Northside Veterinary Clinic",
    username: "northsidevet",
    role: "business",
  },
};

export const ALL_ACCOUNT_EMAILS = Object.values(ACCOUNTS).map((a) => a.email);

// ─────────────────────────────────────────────────────────────────────────────
// The pets. avatarAsset → resolved to an uploaded URL by the runner.
// ─────────────────────────────────────────────────────────────────────────────

export const PETS = {
  mango: {
    ownerKey: "demo",
    name: "Mango",
    handle: "mango",
    species: "dog",
    breed: "Golden Retriever",
    gender: "female",
    weight: 28.1,
    weight_unit: "kg",
    birthdayYearsAgo: 3, // resolved to a concrete date by the runner
    notes: "Golden girl. Lake swimmer, garden inspector, professional napper.",
    avatarAsset: "dog-hero.jpg",
  },
  luna: {
    ownerKey: "luna",
    name: "Luna",
    handle: "luna",
    species: "dog",
    breed: "Border Collie",
    gender: "female",
    weight: 19.5,
    weight_unit: "kg",
    birthdayYearsAgo: 2,
    notes: "Frisbee fanatic. Will herd anything that moves.",
    avatarAsset: "friend-1.jpg",
  },
  cooper: {
    ownerKey: "cooper",
    name: "Cooper",
    handle: "cooper",
    species: "dog",
    breed: "Labrador Retriever",
    gender: "male",
    weight: 31.2,
    weight_unit: "kg",
    birthdayYearsAgo: 4,
    notes: "Good boy. Tennis balls are life.",
    avatarAsset: "friend-2.jpg",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Mango's 6 daily-moment posts. dayOffset 0 = today, 1 = yesterday, … so the
// six land on six CONSECUTIVE days ending today → the 🔥 streak badge shows
// (feedDelight.computePostingStreak counts consecutive days ending today).
// ─────────────────────────────────────────────────────────────────────────────

export const POSTS = [
  { asset: "dog-moment-6.jpg", caption: "Sun's out, tongue's out.",               paws: 52, barks: 7, dayOffset: 0 },
  { asset: "dog-moment-2.jpg", caption: "Found my happy place by the lake.",      paws: 41, barks: 6, dayOffset: 1 },
  { asset: "dog-moment-4.jpg", caption: "Morning walk = best part of the day.",   paws: 33, barks: 4, dayOffset: 2 },
  { asset: "dog-moment-5.jpg", caption: "Lakeside daydreaming.",                  paws: 27, barks: 1, dayOffset: 3 },
  { asset: "dog-moment-1.jpg", caption: "Garden patrol complete.",                paws: 24, barks: 3, dayOffset: 4 },
  { asset: "dog-moment-3.jpg", caption: "Zoomies, fully committed.",              paws: 18, barks: 2, dayOffset: 5 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Engagement actor pool. Index 0 = Luna's owner, 1 = Cooper's owner, then the
// filler supporters. The pool must be at least as large as the biggest paw count
// so a single post's paw-ers are all distinct (post_paws is UNIQUE(post_id,user_id)).
// ─────────────────────────────────────────────────────────────────────────────

export const NAMED_ACTOR_KEYS = ["luna", "cooper"]; // pool indices 0,1
export const ENGAGEMENT_POOL_SIZE = 56; // 2 named + 54 fillers; ≥ max paws (52)
export const FILLER_COUNT = ENGAGEMENT_POOL_SIZE - NAMED_ACTOR_KEYS.length;

// Friendly filler display names (cycled). Usernames are prefix + zero-padded index.
export const FILLER_NAMES = [
  "Bella & Max", "Charlie's Human", "Daisy Walks", "Rocky Road", "Lola Bean",
  "Buddy's Pack", "Milo Mornings", "Ruby Tuesday", "Zoe & Co", "Oscar Paws",
  "Penny Lane", "Toby Treats", "Sadie Says", "Bear Hugs", "Coco Loco",
  "Gus the Pug", "Nala Naps", "Finn & Fetch", "Maple Trails", "Ollie Adventures",
  "Hazel Eyes", "Duke of Bark", "Willow Wanders", "Leo Lounges", "Stella Stars",
  "Cooper Crew", "Rosie Runs", "Jack Sprat", "Lily Pads", "Murphy's Law",
  "Bailey Bay", "Ziggy Zooms", "Pepper Pots", "Shadow Chaser", "Mochi Moments",
  "Cleo Cuddles", "Tucker Time", "Honey Hops", "Scout Sniffs", "Biscuit Bits",
  "Ivy League", "Riley Rides", "Olive Branch", "Frankie Goes", "Gracie Grins",
  "Archie's Mum", "Pippa Pup", "Remy Roams", "Sunny Side", "Teddy Bear Co",
  "Winnie Wags", "Benny Boops", "Goldie Gleams", "Marley & Me",
];

// Named comments (Luna/Cooper). The runner uses these as the visible top barks.
export const NAMED_BARKS = {
  luna: [
    "Lake buddies forever! 🐾",
    "Mango you photogenic queen 😍",
    "This is the content I'm here for.",
  ],
  cooper: [
    "Zoomies champion right here 🏆",
    "Save some sunshine for me!",
    "Best girl on the timeline.",
  ],
};

// Short filler comments to pad bark counts realistically.
export const FILLER_BARKS = [
  "So cute! 🐾", "Good girl!", "Love this 💛", "Gorgeous golden!",
  "Made my day.", "What a smile 😄", "Adorable!", "Living the dream.",
  "Pure joy.", "Tail wags incoming.", "Stunning shot.", "Goals 🐕",
];

// ─────────────────────────────────────────────────────────────────────────────
// Health section. Offsets are in DAYS from "now"; the runner resolves to dates.
// ─────────────────────────────────────────────────────────────────────────────

// Gently-stable weight trend over ~4 months → a nice chart.
export const WEIGHT_LOGS = [
  { daysAgo: 120, weight: 28.4 },
  { daysAgo: 80, weight: 28.0 },
  { daysAgo: 40, weight: 28.3 },
  { daysAgo: 5, weight: 28.1 },
];

export const WELLNESS_CHECKS = [
  {
    check_type: "mood_energy",
    daysAgo: 6,
    values_json: { mood: "good", energy: "good" },
    notes: "Bright and playful all week.",
  },
  {
    check_type: "appetite_hydration",
    daysAgo: 3,
    values_json: { appetite: "normal", hydration: "normal" },
    notes: "Eating and drinking normally.",
  },
];

// administeredByClinic → runner stamps administered_by_provider_id = clinic id.
export const VACCINATIONS = [
  { name: "Rabies", givenDaysAgo: 150, expiresInDays: 3 * 365 - 150, lot: "RB-2291", administeredByClinic: true },
  { name: "DHPP", givenDaysAgo: 150, expiresInDays: 3 * 365 - 150, lot: "DH-7741", administeredByClinic: true },
  { name: "Bordetella", givenDaysAgo: 95, expiresInDays: 365 - 95, lot: "BD-0148", administeredByClinic: true },
];

// Current medications modeled as a medical_care routine (the grouped modern type).
// type 'preventive' items are date-based: they surface in the meds section and, with
// nextDue inside the 14-day horizon, also as upcoming reminders.
export const MEDICAL_CARE_ITEMS = [
  {
    id: "flea-tick",
    type: "preventive",
    name: "Flea & Tick Prevention",
    frequency: "monthly",
    nextDueInDays: 5,
    reminderEnabled: true,
    timeSensitive: true,
    notes: "Monthly chew with breakfast.",
  },
  {
    id: "heartworm",
    type: "preventive",
    name: "Heartworm Prevention",
    frequency: "monthly",
    nextDueInDays: 9,
    reminderEnabled: true,
    timeSensitive: true,
    notes: "Monthly tablet.",
  },
];

export const ALLERGY = {
  allergen: "Chicken",
  severity: "mild",
  reaction: "Mild itching",
  notes: "Switched to a salmon-based diet; no flare-ups since.",
};

export const MEDICAL_PROFILE = {
  microchip_id: "985141000123456",
  spayed_neutered_status: "spayed",
  spayedNeuteredDaysAgo: 700,
  primary_vet_name: "Dr. Priya Patel",
  primary_clinic_name: "Northside Veterinary Clinic",
  vet_phone: "+1 (503) 555-0142",
  vet_email: "care@northsidevet.example",
  emergency_contact_name: "Alex Rivera",
  emergency_contact_phone: "+1 (503) 555-0188",
  insurance_provider: "Healthy Paws",
  insurance_policy_number: "HP-4471902",
  medical_notes: "Generally healthy, active adult. Mild chicken sensitivity (see allergies).",
};

// Routines that populate Health → Today. Times are local "HH:MM".
export const FEEDING_MEALS = [
  { id: "breakfast", name: "Breakfast", time: "08:00", frequency: "daily", reminderEnabled: true, timeSensitive: true, notes: "" },
  { id: "dinner", name: "Dinner", time: "18:00", frequency: "daily", reminderEnabled: true, timeSensitive: true, notes: "" },
];

export const WALK_SCHEDULE = [
  { id: "morning-walk", name: "Morning walk", time: "07:30", frequency: "daily", reminderEnabled: true, timeSensitive: true, notes: "" },
];

export const PHOTO_CHECK_SCHEDULE = [
  { bodyArea: "Paws", frequency: "daily", preferredTime: "10:00", preferredDay: null, reminderEnabled: true, timeSensitive: true, notes: "Quick paw check after the morning walk." },
];

export const VET_APPOINTMENT = {
  title: "Annual Wellness Exam",
  inDays: 4,
  time: "10:00",
  clinic: "Northside Veterinary Clinic",
  veterinarian: "Dr. Priya Patel",
  reason_for_visit: "Annual checkup & booster review",
  notes: "Bring vaccination record.",
};

// ─────────────────────────────────────────────────────────────────────────────
// The vet clinic provider.
// ─────────────────────────────────────────────────────────────────────────────

export const PROVIDER = {
  ownerKey: "clinic",
  provider_type: "vet",
  name: "Northside Veterinary Clinic",
  slug: "northside-veterinary-clinic",
  bio: "Full-service small-animal clinic. Wellness, dentistry, vaccinations, and telehealth consults.",
  coverAsset: "vet-cover.jpg",
  logoAsset: "vet-2.jpg",
  website_url: "https://northsidevet.example",
  // 'telehealth' widened into the capability CHECK by 0040_telehealth.sql — the
  // clinic must HOLD it (not just offer the service) to pass the capability gate
  // in providers/[id]/book/route.js and show up under Services → Telehealth.
  capabilities: ["vet", "telehealth"],
  services: [
    { name: "Wellness exam", description: "Comprehensive nose-to-tail health check.", duration_min: 30, price_cents: 5500 },
    { name: "Vaccination (per shot)", description: "Core and lifestyle vaccines.", duration_min: 15, price_cents: 3000 },
    { name: "Dental cleaning", description: "Full dental scale, polish, and oral exam under anesthesia.", duration_min: 90, price_cents: 18000 },
    { name: "Telehealth consult", description: "Video consult with a licensed vet.", duration_min: 20, price_cents: 4000 },
  ],
  location: {
    name: "Northside Veterinary Clinic",
    address: "1842 Maple Avenue, Portland, OR 97214",
    lat: 45.5152,
    lng: -122.6784,
    phone: "+1 (503) 555-0142",
    hours_json: {
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: { open: "09:00", close: "18:00" },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: { open: "09:00", close: "13:00" },
    },
  },
  reviews: [
    { reviewerKey: "demo", petKey: "mango", rating: 5, body: "Dr. Patel is wonderful with Mango. Clean, calm, and never rushed." },
    { reviewerKey: "luna", petKey: "luna", rating: 4, body: "Great wellness care and easy booking. Telehealth saved us a trip." },
  ],
};

// Every image asset the seed uploads, mapped to its deterministic storage name.
export const ASSETS = [
  "dog-hero.jpg",
  "dog-moment-1.jpg", "dog-moment-2.jpg", "dog-moment-3.jpg",
  "dog-moment-4.jpg", "dog-moment-5.jpg", "dog-moment-6.jpg",
  "friend-1.jpg", "friend-2.jpg",
  "vet-cover.jpg", "vet-2.jpg",
];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers.
// ─────────────────────────────────────────────────────────────────────────────

/** YYYY-MM-DD in LOCAL time (matches how the app derives "today"). */
export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A new Date `n` days after `base` (n may be negative). Does not mutate `base`. */
export function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Deterministically assign paws + barks to actor-pool INDICES, per post.
 *
 * Returns { paws, barks } where:
 *   paws[i]  = number[]                  pool indices that pawed post i (length = post.paws), all distinct
 *   barks[i] = { actor:number, text:string }[]  barkers on post i (length = post.barks)
 *
 * Distinctness per post is guaranteed because each post draws a contiguous,
 * de-duplicated window of length ≤ poolSize. Named actors (0,1) lead the bark
 * list so their comments read as the top of the thread.
 */
export function planEngagement(posts, poolSize, opts = {}) {
  const namedBarkPools = opts.namedBarkPools || [NAMED_BARKS.luna, NAMED_BARKS.cooper];
  const fillerBarks = opts.fillerBarks || FILLER_BARKS;
  const namedCount = namedBarkPools.length;

  const distinctWindow = (start, count) => {
    const out = [];
    const seen = new Set();
    let i = 0;
    while (out.length < count && i < poolSize) {
      const idx = (start + i) % poolSize;
      if (!seen.has(idx)) {
        seen.add(idx);
        out.push(idx);
      }
      i++;
    }
    return out;
  };

  const paws = [];
  const barks = [];

  posts.forEach((post, p) => {
    if (post.paws > poolSize) {
      throw new Error(
        `post ${p} needs ${post.paws} paws but pool is only ${poolSize}`,
      );
    }

    // Paws: a per-post rotated window so different posts get overlapping-but-
    // varied supporter sets (looks organic, stays deterministic).
    paws.push(distinctWindow((p * 7) % poolSize, post.paws));

    // Barks: named actors first (with their named comments), then fillers.
    const postBarks = [];
    for (let b = 0; b < post.barks; b++) {
      if (b < namedCount) {
        const pool = namedBarkPools[b];
        postBarks.push({ actor: b, text: pool[p % pool.length] });
      } else {
        const fillerIdx = namedCount + ((p * 5 + b) % (poolSize - namedCount));
        const text = fillerBarks[(p * 3 + b) % fillerBarks.length];
        postBarks.push({ actor: fillerIdx, text });
      }
    }
    barks.push(postBarks);
  });

  return { paws, barks };
}

/** Username for filler pool index `f` (0-based): pawpi_seed_fan_001, … */
export function fillerUsername(f) {
  return `${FILLER_USERNAME_PREFIX}${String(f + 1).padStart(3, "0")}`;
}
