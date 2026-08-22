#!/usr/bin/env node
// PawPi demo-account seeder — orchestrator.
//
// Fills the existing demo account so every App Store reviewer screen shows real
// content. ADD-ONLY: it checks what already exists and only tops up empty
// sections; it never deletes or edits existing demo data and never touches a
// real user.
//
// It talks to the real backend over the same auth + API flow the mobile app
// uses (Auth.js credentials sign-in → JWT → Bearer requests). Point it at
// production and run it from a machine that can reach the backend.
//
//   export PAWPI_DEMO_EMAIL='augusto+demo@pawpi.info'
//   export PAWPI_DEMO_PASSWORD='********'
//   # optional — a support account used for DMs / friendships / a demo provider:
//   export PAWPI_DEMO2_EMAIL='augusto+demo2@pawpi.info'
//   export PAWPI_DEMO2_PASSWORD='********'
//   # optional — defaults to production:
//   export PAWPI_BASE_URL='https://pawpi-production.up.railway.app'
//
//   node scripts/demo-seed/seed.mjs
//
// No secrets are stored in this file; everything sensitive comes from env.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, Session, Report } from "./lib.mjs";

import seedFeed from "./sections/feed.mjs";
import seedHealth from "./sections/health.mjs";
import seedVet from "./sections/vet.mjs";
import seedReminders from "./sections/reminders.mjs";
import seedTraining from "./sections/training.mjs";
import seedCommunity from "./sections/community.mjs";
import seedProfile from "./sections/profile.mjs";
import seedSocial from "./sections/social.mjs";
import seedProviderWorld from "./sections/providerWorld.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ASSETS = path.resolve(__dirname, "../../demo-assets");

// A per-session image uploader that uploads each local asset at most once and
// caches the returned public URL (keeps us well under the upload rate limit).
function makeImageCache(session) {
  const cache = new Map();
  return async function img(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const abs = path.join(DEMO_ASSETS, filename);
    const url = await session.uploadImage(abs, { field: "file", urlKey: "url" });
    cache.set(filename, url);
    return url;
  };
}

async function findPets(session) {
  const res = await session.get("/api/pets");
  const pets = (res.data && res.data.pets) || [];
  // Feature Mango; fall back to the first pet if the names differ.
  const byName = (n) =>
    pets.find((p) => (p.name || "").toLowerCase() === n.toLowerCase());
  const mango = byName("Mango") || pets[0] || null;
  const others = pets.filter((p) => mango && p.id !== mango.id);
  return { pets, mango, others };
}

async function main() {
  const { BASE_URL, EMAIL, PASSWORD } = config();
  console.log(`PawPi demo seeder → ${BASE_URL}`);

  // ---- Authenticate the demo (reviewer) account -------------------------
  const A = new Session({ baseURL: BASE_URL });
  const user = await A.login({ email: EMAIL, password: PASSWORD });
  console.log(`Signed in as ${user?.email || user?.name || "demo user"}`);

  // Confirm we can see the demo pets (sanity check from the task brief).
  let { pets, mango, others } = await findPets(A);
  if (!mango) {
    // The task says the demo pets already exist; if somehow not, make Mango so
    // the rest of the run has something to attach to (add-only, harmless).
    const heroUrl = await A.uploadImage(path.join(DEMO_ASSETS, "dog-hero.jpg"), {
      field: "file",
      urlKey: "url",
    });
    const created = await A.post("/api/pets", {
      name: "Mango",
      species: "dog",
      breed: "Golden Retriever",
      gender: "male",
      birthday: "2021-08-22",
      weight: 31.5,
      weight_unit: "lbs",
      avatar_url: heroUrl,
      notes: "Sunny, food-motivated, loves the beach.",
    });
    mango = created.data?.pet || null;
    ({ pets, others } = await findPets(A));
  }
  if (!mango) {
    console.error("Could not find or create a pet for the demo account. Aborting.");
    process.exit(1);
  }
  console.log(
    `Feature pet: ${mango.name} (id ${mango.id}); ${pets.length} pet(s) total.`,
  );

  const report = new Report();
  const imgA = makeImageCache(A);

  const ctx = {
    A,
    baseURL: BASE_URL,
    report,
    img: imgA,
    demoDir: DEMO_ASSETS,
    pets,
    mango,
    others,
    profileId: mango.owner_user_id, // user_profiles.id (used for DM counterparty)
  };

  // ---- Single-account sections (the demo owner only) --------------------
  const soloSections = [
    ["Profile & Emergency Card", seedProfile],
    ["Feed / daily moments", seedFeed],
    ["Health", seedHealth],
    ["Vet Record", seedVet],
    ["Reminders / Routines", seedReminders],
    ["Training", seedTraining],
    ["Community", seedCommunity],
  ];
  for (const [name, fn] of soloSections) {
    try {
      await fn(ctx);
    } catch (e) {
      report.section(name).error(`section crashed: ${e.message}`);
    }
  }

  // ---- Supporting demo account (B): DMs, friendships, a demo provider ----
  const DEMO2_EMAIL = process.env.PAWPI_DEMO2_EMAIL || "augusto+demo2@pawpi.info";
  let B = null;
  let bInfo = null;
  try {
    B = new Session({ baseURL: BASE_URL });
    bInfo = await ensureSupportAccount(B, DEMO2_EMAIL, report, imgA, ctx);
  } catch (e) {
    report
      .section("Supporting demo account")
      .error(`could not set up support account: ${e.message}`);
    B = null;
  }

  if (B && bInfo) {
    const ctx2 = { ...ctx, B, bInfo, imgB: makeImageCache(B) };
    for (const [name, fn] of [
      ["Social (DMs, friendships, notifications)", seedSocial],
      ["Services / Adopt / Shop (demo provider)", seedProviderWorld],
    ]) {
      try {
        await fn(ctx2);
      } catch (e) {
        report.section(name).error(`section crashed: ${e.message}`);
      }
    }
  } else {
    report
      .section("Social / Services / Adopt / Shop")
      .note(
        "Skipped — needs a supporting demo account. Set PAWPI_DEMO2_EMAIL / PAWPI_DEMO2_PASSWORD and re-run.",
      );
  }

  // ---- Final verification pass -----------------------------------------
  await verify(ctx, report);

  report.print();
}

// Sign in the support account, or create it if it doesn't exist yet. Ensures it
// has a profile and one pet (so it can DM / follow / own a provider).
async function ensureSupportAccount(B, email, report, _imgA, ctx) {
  const r = report.section("Supporting demo account");
  const password =
    process.env.PAWPI_DEMO2_PASSWORD || genPassword();
  const generated = !process.env.PAWPI_DEMO2_PASSWORD;

  // Try sign-in first (account may already exist).
  let loggedIn = false;
  try {
    await B.login({ email, password });
    loggedIn = true;
    r.skipped(`signed in existing support account ${email}`);
  } catch {
    // Fall through to sign-up.
  }

  if (!loggedIn) {
    // Sign up via the credentials-signup provider, then sign in.
    const signup = await B.signup({
      email,
      password,
      name: "Sol Fernández",
    });
    if (!signup.ok && signup.status !== 200) {
      throw new Error(
        `support signup failed (${signup.status}). ` +
          (generated
            ? "Set PAWPI_DEMO2_PASSWORD to a known value and re-run."
            : ""),
      );
    }
    await B.login({ email, password });
    r.created(`support account ${email}`);
    if (generated) {
      r.note(
        `Generated support password (save it to re-run): ${password}`,
      );
    }
  }

  // Ensure profile + a pet for B.
  await B.get("/api/user-profile");
  let petsRes = await B.get("/api/pets");
  let bPets = petsRes.data?.pets || [];
  if (bPets.length === 0) {
    let avatar = null;
    try {
      avatar = await ctx.img("friend-1.jpg");
    } catch {
      /* avatar optional */
    }
    const made = await B.post("/api/pets", {
      name: "Luna",
      species: "dog",
      breed: "Border Collie",
      gender: "female",
      birthday: "2022-04-10",
      weight: 18,
      weight_unit: "kg",
      avatar_url: avatar,
      notes: "Vecina de Mango en Palermo.",
    });
    if (made.data?.pet) bPets = [made.data.pet];
    r.created(`support pet Luna (id ${made.data?.pet?.id})`);
  } else {
    r.skipped(`support pet ${bPets[0].name}`);
  }
  const bPet = bPets[0];
  return {
    email,
    pet: bPet,
    petId: bPet?.id,
    profileId: bPet?.owner_user_id, // user_profiles.id of support account
  };
}

function genPassword() {
  // Strong, satisfies validatePassword (≥3 classes, not common).
  const n = Math.floor(1000 + (Date.now() % 9000));
  return `PawPiFriend#${n}Ar`;
}

// Read-back verification — proves each tab returns data.
async function verify(ctx, report) {
  const { A, mango } = ctx;
  const r = report.section("Verification (authenticated GETs)");
  const checks = [
    ["Feed", `/api/posts?limit=5`, (d) => (d.posts || []).length],
    ["Streak", `/api/posts/streak?petId=${mango.id}`, (d) => (d.dailyPostDates || []).length],
    ["Health: weight", `/api/health/weight-logs?petId=${mango.id}`, (d) => (d.logs || []).length],
    ["Health: food", `/api/health/food-logs?petId=${mango.id}`, (d) => (d.logs || []).length],
    ["Health: walks", `/api/health/walk-logs?petId=${mango.id}`, (d) => (d.logs || []).length],
    ["Health: wellness", `/api/health/wellness-logs?petId=${mango.id}`, (d) => (d.logs || []).length],
    ["Health: photo-checks", `/api/health/photo-checks?petId=${mango.id}`, (d) => (d.photoChecks || d.logs || []).length],
    ["Health: medications", `/api/health/medications?petId=${mango.id}`, (d) => (d.medications || []).length],
    ["Health: preventive", `/api/health/preventive-treatments?petId=${mango.id}`, (d) => (d.treatments || []).length],
    ["Vet: allergies", `/api/vet-record/allergies?petId=${mango.id}`, (d) => (d.allergies || []).length],
    ["Vet: conditions", `/api/vet-record/conditions?petId=${mango.id}`, (d) => (d.conditions || []).length],
    ["Vet: lab-results", `/api/vet-record/lab-results?petId=${mango.id}`, (d) => (d.labResults || []).length],
    ["Vet: surgeries", `/api/vet-record/surgeries?petId=${mango.id}`, (d) => (d.surgeries || []).length],
    ["Vet: notes", `/api/vet-record/notes?petId=${mango.id}`, (d) => (d.notes || []).length],
    ["Vet: documents", `/api/vet-record/documents?petId=${mango.id}`, (d) => (d.documents || []).length],
    ["Vet: vaccinations", `/api/pet-vaccinations?petId=${mango.id}`, (d) => (d.vaccinations || []).length],
    ["Vet: prescriptions", `/api/prescriptions?petId=${mango.id}`, (d) => (d.prescriptions || []).length],
    ["Vet: appointments", `/api/vet-appointments?petId=${mango.id}`, (d) => (d.appointments || []).length],
    ["Routines", `/api/routines?petId=${mango.id}`, (d) => (d.routines || []).length],
    ["Training", `/api/training/self-progress?petId=${mango.id}`, (d) => (d.completed || []).length],
    ["Community: forum", `/api/forum/threads?sort=new`, (d) => (d.threads || []).length],
    ["Community: events", `/api/events`, (d) => (d.events || []).length],
    ["Community: social-walks", `/api/social-walks?myWalks=true`, (d) => (d.walks || []).length],
    ["Community: lost-reports", `/api/lost-reports?mine=true`, (d) => (d.reports || []).length],
    ["Social: DMs", `/api/dm-threads`, (d) => (d.threads || []).length],
    ["Social: notifications", `/api/notifications`, (d) => (d.notifications || []).length],
    ["Bookings", `/api/me/bookings`, (d) => ((d.upcoming || []).length + (d.past || []).length)],
    ["Adopt", `/api/adoption/listings`, (d) => (d.listings || []).length],
    ["Emergency card", `/api/emergency-card?petId=${mango.id}`, (d) => (d.card ? 1 : 0)],
  ];
  for (const [label, url, count] of checks) {
    try {
      const res = await A.get(url);
      const n = res.ok ? count(res.data || {}) : -1;
      if (n > 0) r.note(`${label}: ${n} ✓`);
      else if (n === 0) r.error(`${label}: EMPTY`);
      else r.error(`${label}: GET ${res.status}`);
    } catch (e) {
      r.error(`${label}: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error("\nFatal:", e);
  process.exit(1);
});
