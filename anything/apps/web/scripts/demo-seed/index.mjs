#!/usr/bin/env node
// PawPi demo-seed runner — populates ONE demo account with attractive, realistic
// data for App Store screenshots + the App Review demo login (docs/demo-seed-plan.md).
//
// • Gated: refuses to run unless SEED_DEMO=1 (seed) or SEED_DEMO_RESET=1 (reset).
// • Idempotent: parents are upserted on stable keys; child content is regenerated;
//   re-running produces NO duplicates.
// • RLS-faithful: every owner/author/provider write runs inside a transaction
//   stamped with that user's identity (set_config('app.current_user_id', …)),
//   exactly like withRequestContext — so the data is reachable as a REAL user.
//   The ONLY non-RLS path is account/identity setup on the RLS-disabled auth_*/
//   user_profiles tables (and FK-cascade teardown), which mirrors how the app
//   itself creates these rows.
//
// Run from anything/apps/web:
//   SEED_DEMO=1        node scripts/demo-seed/index.mjs
//   SEED_DEMO_RESET=1  node scripts/demo-seed/index.mjs
//
// DB target: DEMO_DATABASE_URL if set, else DATABASE_URL (from web/.env). Point
// DEMO_DATABASE_URL at a dev/staging project to keep production untouched.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import argon2 from "argon2";

import {
  loadEnv,
  createSql,
  asIdentity,
  uploadImage,
  deleteStorageObject,
} from "./lib.mjs";
import * as S from "./spec.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, "..", "..");
const REPO_ROOT = join(WEB_DIR, "..", "..", "..");
const DEMO_ASSETS_DIR = join(REPO_ROOT, "demo-assets");

const now = new Date();
const objectPathFor = (asset) => `${S.STORAGE_PREFIX}/${asset}`;

// ── small DB helpers ──────────────────────────────────────────────────────────

async function getOrCreateAccount(sql, acct, passwordHash) {
  // auth_users (RLS disabled)
  let [u] = await sql`SELECT id FROM auth_users WHERE email = ${acct.email} LIMIT 1`;
  if (!u) {
    [u] = await sql`
      INSERT INTO auth_users (name, email, "emailVerified", image)
      VALUES (${acct.name}, ${acct.email}, null, null)
      RETURNING id`;
  }
  const authUserId = u.id;

  // auth_accounts (credentials) — so the account can log in via the normal flow
  const [acc] = await sql`
    SELECT id FROM auth_accounts
    WHERE "userId" = ${authUserId} AND provider = 'credentials' LIMIT 1`;
  if (!acc) {
    await sql`
      INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
      VALUES (${authUserId}, 'credentials', 'credentials', ${String(authUserId)}, ${passwordHash})`;
  }

  // user_profiles (RLS disabled)
  let [p] = await sql`SELECT id FROM user_profiles WHERE auth_user_id = ${authUserId} LIMIT 1`;
  if (!p) {
    // is_demo = true (0111): flags every seeded account so its content is excluded from the
    // GLOBAL surfaces (Discover / Search / feed Suggested / provider+adoption discovery) and
    // can never leak into real users' feeds. Owner/following-scoped views are unaffected, so
    // the App-Review demo login still sees a fully-populated app.
    [p] = await sql`
      INSERT INTO user_profiles (auth_user_id, full_name, username, role, is_demo)
      VALUES (${authUserId}, ${acct.name}, ${acct.username}, ${acct.role}, true)
      RETURNING id`;
  } else {
    await sql`
      UPDATE user_profiles SET full_name = ${acct.name}, role = ${acct.role}, is_demo = true, updated_at = now()
      WHERE id = ${p.id}`;
  }
  return { authUserId, profileId: p.id };
}

async function getOrCreateFiller(sql, f) {
  const username = S.fillerUsername(f);
  const fullName = S.FILLER_NAMES[f % S.FILLER_NAMES.length];
  let [p] = await sql`SELECT id FROM user_profiles WHERE username = ${username} LIMIT 1`;
  if (p) return p.id;
  const [u] = await sql`
    INSERT INTO auth_users (name, email, "emailVerified", image)
    VALUES (${fullName}, null, null, null) RETURNING id`;
  [p] = await sql`
    INSERT INTO user_profiles (auth_user_id, full_name, username, role, is_demo)
    VALUES (${u.id}, ${fullName}, ${username}, 'pet_owner', true) RETURNING id`;
  return p.id;
}

async function getOrCreatePet(sql, ownerProfileId, petSpec, avatarUrl) {
  const birthday = S.ymd(S.addDays(now, -petSpec.birthdayYearsAgo * 365));
  return asIdentity(sql, ownerProfileId, async (tx) => {
    let [pet] = await tx`
      SELECT id FROM pets WHERE owner_user_id = ${ownerProfileId} AND name = ${petSpec.name} LIMIT 1`;
    if (pet) {
      await tx`
        UPDATE pets SET handle = ${petSpec.handle}, avatar_url = ${avatarUrl},
          species = ${petSpec.species}, breed = ${petSpec.breed}, gender = ${petSpec.gender},
          weight = ${petSpec.weight}, weight_unit = ${petSpec.weight_unit},
          birthday = ${birthday}, notes = ${petSpec.notes}, updated_at = now()
        WHERE id = ${pet.id}`;
      return pet.id;
    }
    [pet] = await tx`
      INSERT INTO pets (owner_user_id, name, handle, avatar_url, species, breed, gender, weight, weight_unit, birthday, notes)
      VALUES (${ownerProfileId}, ${petSpec.name}, ${petSpec.handle}, ${avatarUrl}, ${petSpec.species},
        ${petSpec.breed}, ${petSpec.gender}, ${petSpec.weight}, ${petSpec.weight_unit}, ${birthday}, ${petSpec.notes})
      RETURNING id`;
    return pet.id;
  });
}

// ── seed ──────────────────────────────────────────────────────────────────────

async function seed(sql, env) {
  console.log("\n📤 Uploading + compressing images to Supabase Storage…");
  const urls = {};
  for (const asset of S.ASSETS) {
    urls[asset] = await uploadImage(env, join(DEMO_ASSETS_DIR, asset), objectPathFor(asset));
    console.log(`   ✓ ${asset}`);
  }

  console.log("\n👤 Creating accounts (logged-in-able)…");
  const passwordHash = await argon2.hash(S.DEMO_PASSWORD);
  const profile = {}; // accountKey -> profileId
  for (const acct of Object.values(S.ACCOUNTS)) {
    const { profileId } = await getOrCreateAccount(sql, acct, passwordHash);
    profile[acct.key] = profileId;
    console.log(`   ✓ ${acct.email} (user_profiles.id=${profileId})`);
  }

  console.log("\n🐾 Creating pets…");
  const pet = {}; // petKey -> petId
  for (const [key, spec] of Object.entries(S.PETS)) {
    pet[key] = await getOrCreatePet(sql, profile[spec.ownerKey], spec, urls[spec.avatarAsset]);
    console.log(`   ✓ ${spec.name} (pets.id=${pet[key]})`);
  }

  console.log("\n🏥 Creating the vet clinic provider…");
  const providerId = await seedProvider(sql, profile, pet, urls);
  console.log(`   ✓ ${S.PROVIDER.name} (providers.id=${providerId})`);

  console.log("\n🖼️  Creating Mango's feed posts…");
  const postIds = await seedPosts(sql, profile.demo, pet.mango, urls);
  console.log(`   ✓ ${postIds.length} posts`);

  console.log("\n👥 Creating supporters + paws/barks…");
  await seedEngagement(sql, profile, postIds);
  console.log("   ✓ engagement seeded");

  console.log("\n🔗 Creating friends + follows…");
  await seedSocialGraph(sql, profile, pet);
  console.log("   ✓ friends + follows");

  console.log("\n❤️  Creating the Health / Vet-Record section…");
  await seedHealth(sql, profile.demo, pet.mango, providerId);
  console.log("   ✓ health, vaccinations, meds, profile, routines, appointment");

  console.log("\n⭐ Creating clinic reviews…");
  await seedReviews(sql, profile, pet, providerId);
  console.log("   ✓ reviews");

  printSeedSummary(profile);
}

async function seedProvider(sql, profile, pet, urls) {
  const me = profile[S.PROVIDER.ownerKey];
  const P = S.PROVIDER;

  // 1. provider + owner staff (bootstrap) — staff INSERT after providers exists.
  const providerId = await asIdentity(sql, me, async (tx) => {
    let [prov] = await tx`SELECT id FROM providers WHERE slug = ${P.slug} LIMIT 1`;
    if (prov) {
      await tx`
        UPDATE providers SET name = ${P.name}, bio = ${P.bio}, provider_type = ${P.provider_type},
          logo_url = ${urls[P.logoAsset]}, cover_image_url = ${urls[P.coverAsset]},
          website_url = ${P.website_url}, status = 'published', is_demo = true, updated_at = now()
        WHERE id = ${prov.id}`;
    } else {
      // is_demo = true (0111): a demo provider (mirrors the owner profile) so the seed clinic
      // is excluded from provider + adoption discovery for real users.
      [prov] = await tx`
        INSERT INTO providers (owner_user_profile_id, provider_type, name, slug, bio, logo_url, cover_image_url, website_url, status, is_demo)
        VALUES (${me}, ${P.provider_type}, ${P.name}, ${P.slug}, ${P.bio}, ${urls[P.logoAsset]},
          ${urls[P.coverAsset]}, ${P.website_url}, 'published', true)
        RETURNING id`;
    }
    // Ensure the owner staff row exists (bootstrap = membership-absence; safe to re-check).
    const [staff] = await tx`
      SELECT id FROM provider_staff WHERE provider_id = ${prov.id} AND user_profile_id = ${me} LIMIT 1`;
    if (!staff) {
      await tx`
        INSERT INTO provider_staff (provider_id, user_profile_id, role, status)
        VALUES (${prov.id}, ${me}, 'owner', 'active')`;
    }
    return prov.id;
  });

  // 2. capabilities / services / locations — regenerated (staff row now committed,
  //    so app_is_provider_admin passes for the admin-gated writes).
  await asIdentity(sql, me, async (tx) => {
    await tx`DELETE FROM provider_capabilities WHERE provider_id = ${providerId}`;
    await tx`
      INSERT INTO provider_capabilities ${tx(
        P.capabilities.map((capability) => ({ provider_id: providerId, capability })),
        "provider_id", "capability",
      )}`;

    await tx`DELETE FROM provider_services WHERE provider_id = ${providerId}`;
    await tx`
      INSERT INTO provider_services ${tx(
        P.services.map((s) => ({
          provider_id: providerId, name: s.name, description: s.description,
          duration_min: s.duration_min, price_cents: s.price_cents, active: true,
        })),
        "provider_id", "name", "description", "duration_min", "price_cents", "active",
      )}`;

    await tx`DELETE FROM provider_locations WHERE provider_id = ${providerId}`;
    const L = P.location;
    await tx`
      INSERT INTO provider_locations (provider_id, name, address, lat, lng, hours_json, phone)
      VALUES (${providerId}, ${L.name}, ${L.address}, ${L.lat}, ${L.lng}, ${tx.json(L.hours_json)}, ${L.phone})`;
  });

  return providerId;
}

async function seedPosts(sql, demoProfileId, mangoPetId, urls) {
  return asIdentity(sql, demoProfileId, async (tx) => {
    // Regenerate: deleting the posts cascades their paws/barks (clean re-run).
    await tx`DELETE FROM posts WHERE pet_id = ${mangoPetId} AND user_id = ${demoProfileId}`;
    const ids = [];
    for (const post of S.POSTS) {
      const day = S.addDays(now, -post.dayOffset);
      // A varied but deterministic time-of-day so timestamps look organic.
      const createdAt = new Date(day);
      createdAt.setHours(9 + (post.dayOffset % 8), (post.dayOffset * 11) % 60, 0, 0);
      const [row] = await tx`
        INSERT INTO posts (user_id, pet_id, image_url, caption, is_daily_update, post_date, created_at, updated_at)
        VALUES (${demoProfileId}, ${mangoPetId}, ${urls[post.asset]}, ${post.caption}, true,
          ${S.ymd(day)}, ${createdAt}, ${createdAt})
        RETURNING id`;
      ids.push(row.id);
    }
    return ids;
  });
}

async function seedEngagement(sql, profile, postIds) {
  const { paws, barks } = S.planEngagement(S.POSTS, S.ENGAGEMENT_POOL_SIZE);

  // pool index -> profileId. 0=luna, 1=cooper, then fillers (created lazily).
  const actorProfileId = [];
  actorProfileId[0] = profile.luna;
  actorProfileId[1] = profile.cooper;
  for (let f = 0; f < S.FILLER_COUNT; f++) {
    actorProfileId[S.NAMED_ACTOR_KEYS.length + f] = await getOrCreateFiller(
      sql,
      f,
    );
  }

  // Reorganize per-post plan into per-actor work so each actor writes in ONE tx
  // (post_paws/post_barks are author-only under RLS: user_id = me).
  const perActor = new Map(); // actorIdx -> { paws:[{postId,at}], barks:[{postId,text,at}] }
  const ensure = (idx) => {
    if (!perActor.has(idx)) perActor.set(idx, { paws: [], barks: [] });
    return perActor.get(idx);
  };
  postIds.forEach((postId, p) => {
    const baseDay = S.addDays(now, -S.POSTS[p].dayOffset);
    paws[p].forEach((idx, k) => {
      const at = new Date(baseDay);
      at.setHours(12, (k * 7) % 60, (k * 13) % 60, 0);
      ensure(idx).paws.push({ postId, at });
    });
    barks[p].forEach((bk, k) => {
      const at = new Date(baseDay);
      at.setHours(13, (k * 9) % 60, (k * 17) % 60, 0);
      ensure(bk.actor).barks.push({ postId, text: bk.text, at });
    });
  });

  for (const [idx, work] of perActor) {
    const meId = actorProfileId[idx];
    await asIdentity(sql, meId, async (tx) => {
      if (work.paws.length) {
        await tx`
          INSERT INTO post_paws ${tx(
            work.paws.map((w) => ({ post_id: w.postId, user_id: meId, created_at: w.at })),
            "post_id", "user_id", "created_at",
          )}
          ON CONFLICT (post_id, user_id) DO NOTHING`;
      }
      if (work.barks.length) {
        await tx`
          INSERT INTO post_barks ${tx(
            work.barks.map((w) => ({
              post_id: w.postId, user_id: meId, text: w.text, created_at: w.at, updated_at: w.at,
            })),
            "post_id", "user_id", "text", "created_at", "updated_at",
          )}`;
      }
    });
  }
}

async function seedSocialGraph(sql, profile, pet) {
  // Friendships (participant-scoped): demo is the requester on both → write allowed.
  await asIdentity(sql, profile.demo, async (tx) => {
    await tx`DELETE FROM pet_friendships
      WHERE requester_user_id = ${profile.demo} OR receiver_user_id = ${profile.demo}`;
    const rows = [
      { receiverUser: profile.luna, receiverPet: pet.luna },
      { receiverUser: profile.cooper, receiverPet: pet.cooper },
    ].map((r) => ({
      requester_user_id: profile.demo, receiver_user_id: r.receiverUser,
      requester_pet_id: pet.mango, receiver_pet_id: r.receiverPet, status: "accepted",
    }));
    await tx`
      INSERT INTO pet_friendships ${tx(
        rows,
        "requester_user_id", "receiver_user_id", "requester_pet_id", "receiver_pet_id", "status",
      )}`;
  });

  // Follows BOTH ways. pet_follows write requires owning the FOLLOWER pet, so each
  // direction is written in the follower-owner's identity. UNIQUE → ON CONFLICT.
  const follow = async (ownerProfileId, followerPetId, followedPetId) =>
    asIdentity(sql, ownerProfileId, (tx) => tx`
      INSERT INTO pet_follows (follower_pet_id, followed_pet_id)
      VALUES (${followerPetId}, ${followedPetId})
      ON CONFLICT (follower_pet_id, followed_pet_id) DO NOTHING`);

  await follow(profile.demo, pet.mango, pet.luna);
  await follow(profile.demo, pet.mango, pet.cooper);
  await follow(profile.luna, pet.luna, pet.mango);
  await follow(profile.cooper, pet.cooper, pet.mango);
}

async function seedHealth(sql, demoProfileId, mangoPetId, providerId) {
  await asIdentity(sql, demoProfileId, async (tx) => {
    const own = { pet_id: mangoPetId, owner_user_id: demoProfileId };

    // Weight logs
    await tx`DELETE FROM health_weight_logs WHERE pet_id = ${mangoPetId} AND owner_user_id = ${demoProfileId}`;
    await tx`
      INSERT INTO health_weight_logs ${tx(
        S.WEIGHT_LOGS.map((w) => ({
          ...own, weight: w.weight, weight_unit: "kg", logged_at: S.addDays(now, -w.daysAgo),
        })),
        "pet_id", "owner_user_id", "weight", "weight_unit", "logged_at",
      )}`;

    // Wellness checks
    await tx`DELETE FROM health_wellness_logs WHERE pet_id = ${mangoPetId} AND owner_user_id = ${demoProfileId}`;
    for (const w of S.WELLNESS_CHECKS) {
      await tx`
        INSERT INTO health_wellness_logs (pet_id, owner_user_id, check_type, logged_at, values_json, notes)
        VALUES (${mangoPetId}, ${demoProfileId}, ${w.check_type}, ${S.addDays(now, -w.daysAgo)}, ${tx.json(w.values_json)}, ${w.notes})`;
    }

    // Vaccinations
    await tx`DELETE FROM pet_vaccinations WHERE pet_id = ${mangoPetId} AND owner_user_id = ${demoProfileId}`;
    await tx`
      INSERT INTO pet_vaccinations ${tx(
        S.VACCINATIONS.map((v) => ({
          ...own, name: v.name, date_given: S.ymd(S.addDays(now, -v.givenDaysAgo)),
          expires_on: S.ymd(S.addDays(now, v.expiresInDays)), lot: v.lot,
          administered_by_provider_id: v.administeredByClinic ? providerId : null,
        })),
        "pet_id", "owner_user_id", "name", "date_given", "expires_on", "lot", "administered_by_provider_id",
      )}`;

    // Allergy
    await tx`DELETE FROM pet_allergies WHERE pet_id = ${mangoPetId} AND owner_user_id = ${demoProfileId}`;
    await tx`
      INSERT INTO pet_allergies (pet_id, owner_user_id, allergen, severity, reaction, notes)
      VALUES (${mangoPetId}, ${demoProfileId}, ${S.ALLERGY.allergen}, ${S.ALLERGY.severity}, ${S.ALLERGY.reaction}, ${S.ALLERGY.notes})`;

    // Medical profile (UNIQUE(pet_id) → delete+insert)
    const mp = S.MEDICAL_PROFILE;
    await tx`DELETE FROM pet_medical_profiles WHERE pet_id = ${mangoPetId} AND owner_user_id = ${demoProfileId}`;
    await tx`
      INSERT INTO pet_medical_profiles (pet_id, owner_user_id, microchip_id, spayed_neutered_status, spayed_neutered_date,
        primary_vet_name, primary_clinic_name, vet_phone, vet_email, emergency_contact_name, emergency_contact_phone,
        insurance_provider, insurance_policy_number, medical_notes)
      VALUES (${mangoPetId}, ${demoProfileId}, ${mp.microchip_id}, ${mp.spayed_neutered_status},
        ${S.ymd(S.addDays(now, -mp.spayedNeuteredDaysAgo))}, ${mp.primary_vet_name}, ${mp.primary_clinic_name},
        ${mp.vet_phone}, ${mp.vet_email}, ${mp.emergency_contact_name}, ${mp.emergency_contact_phone},
        ${mp.insurance_provider}, ${mp.insurance_policy_number}, ${mp.medical_notes})`;

    // Vet appointment (upcoming → shows on Today / reminders list)
    const va = S.VET_APPOINTMENT;
    await tx`DELETE FROM vet_appointments WHERE pet_id = ${mangoPetId} AND owner_user_id = ${demoProfileId} AND title = ${va.title}`;
    await tx`
      INSERT INTO vet_appointments (pet_id, owner_user_id, title, appointment_date, appointment_time, clinic, veterinarian, reason_for_visit, notes, status, reminder_enabled, time_sensitive)
      VALUES (${mangoPetId}, ${demoProfileId}, ${va.title}, ${S.ymd(S.addDays(now, va.inDays))}, ${va.time},
        ${va.clinic}, ${va.veterinarian}, ${va.reason_for_visit}, ${va.notes}, 'scheduled', true, true)`;

    // Routines (feeding, walk, photo check, current meds) → populate Health → Today.
    await tx`DELETE FROM routines WHERE pet_id = ${mangoPetId} AND owner_user_id = ${demoProfileId}`;
    const insertRoutine = (fields) => tx`
      INSERT INTO routines (pet_id, owner_user_id, routine_type, is_active, title, description,
        feeding_schedule, walk_schedule, photo_check_details, medical_care_details,
        frequency, times, notification_enabled, time_sensitive)
      VALUES (${mangoPetId}, ${demoProfileId}, ${fields.routine_type}, true, ${fields.title}, ${fields.description ?? null},
        ${fields.feeding_schedule ? tx.json(fields.feeding_schedule) : null},
        ${fields.walk_schedule ? tx.json(fields.walk_schedule) : null},
        ${fields.photo_check_details ? tx.json(fields.photo_check_details) : null},
        ${fields.medical_care_details ? tx.json(fields.medical_care_details) : null},
        ${fields.frequency ?? null}, ${fields.times ?? null}, true, true)`;

    await insertRoutine({
      routine_type: "feeding", title: "Meals", frequency: "daily",
      feeding_schedule: S.FEEDING_MEALS,
    });
    await insertRoutine({
      routine_type: "walk", title: "Walks", frequency: "daily",
      walk_schedule: S.WALK_SCHEDULE,
    });
    await insertRoutine({
      routine_type: "photo_check", title: "Paws photo check", frequency: "daily",
      times: ["10:00"],
      photo_check_details: { photoCheckSchedule: S.PHOTO_CHECK_SCHEDULE, bodyArea: "Paws" },
    });
    await insertRoutine({
      routine_type: "medical_care", title: "Preventive care", frequency: "monthly",
      medical_care_details: {
        medicalCareItems: S.MEDICAL_CARE_ITEMS.map((m) => ({
          id: m.id, type: m.type, name: m.name, frequency: m.frequency,
          nextDue: S.ymd(S.addDays(now, m.nextDueInDays)),
          reminderEnabled: m.reminderEnabled, timeSensitive: m.timeSensitive, notes: m.notes,
        })),
      },
    });
  });
}

async function seedReviews(sql, profile, pet, providerId) {
  for (const r of S.PROVIDER.reviews) {
    const me = profile[r.reviewerKey];
    await asIdentity(sql, me, async (tx) => {
      await tx`DELETE FROM provider_reviews WHERE provider_id = ${providerId} AND owner_user_id = ${me}`;
      await tx`
        INSERT INTO provider_reviews (provider_id, owner_user_id, pet_id, rating, body)
        VALUES (${providerId}, ${me}, ${pet[r.petKey]}, ${r.rating}, ${r.body})`;
    });
  }
}

// ── reset ─────────────────────────────────────────────────────────────────────

async function reset(sql, env) {
  console.log("\n🧹 Removing demo data…");

  const usernames = Object.values(S.ACCOUNTS).map((a) => a.username);
  // All demo + filler profiles (filler usernames share a stable prefix).
  const profiles = await sql`
    SELECT id, auth_user_id FROM user_profiles
    WHERE username = ANY(${usernames})
       OR username LIKE ${S.FILLER_USERNAME_PREFIX + "%"}`;

  const profileIds = profiles.map((p) => p.id);
  const authIds = profiles.map((p) => p.auth_user_id);

  if (profileIds.length) {
    // Deleting user_profiles (RLS-disabled) FK-cascades to pets → all pet children,
    // posts → paws/barks, follows, friendships, providers → provider children,
    // vaccinations, appointments, routines, reviews. Cascades bypass child RLS.
    await sql`DELETE FROM user_profiles WHERE id = ANY(${profileIds})`;
    console.log(`   ✓ deleted ${profileIds.length} user_profiles (cascaded all owned data)`);
  } else {
    console.log("   • no demo user_profiles found");
  }

  if (authIds.length) {
    await sql`DELETE FROM auth_accounts WHERE "userId" = ANY(${authIds})`;
    await sql`DELETE FROM auth_users WHERE id = ANY(${authIds})`;
    console.log(`   ✓ deleted ${authIds.length} auth_users + their accounts`);
  }
  // Belt-and-suspenders: remove any demo auth_users still matched by email.
  await sql`DELETE FROM auth_users WHERE email = ANY(${S.ALL_ACCOUNT_EMAILS})`;

  // Storage objects (best-effort).
  let removed = 0;
  for (const asset of S.ASSETS) {
    if (await deleteStorageObject(env, objectPathFor(asset))) removed++;
  }
  console.log(`   ✓ removed ${removed}/${S.ASSETS.length} storage objects`);
  console.log("\n✅ Demo data reset complete.\n");
}

// ── summary ───────────────────────────────────────────────────────────────────

function printSeedSummary(profile) {
  const line = "─".repeat(64);
  console.log(`\n${line}`);
  console.log("✅ Demo seed complete.");
  console.log(line);
  console.log("Login / App Review demo account:");
  console.log(`   email:    ${S.ACCOUNTS.demo.email}`);
  console.log(`   password: ${S.DEMO_PASSWORD}`);
  console.log("");
  console.log(`Hero pet: Mango (@${S.PETS.mango.handle})  ·  demo profile id: ${profile.demo}`);
  console.log("Populated: feed + streak, friends/follows (Luna, Cooper),");
  console.log("Northside Veterinary Clinic, and the full Health/Vet-Record section.");
  console.log(line);
  console.log("Re-run safely (idempotent):   SEED_DEMO=1 node scripts/demo-seed/index.mjs");
  console.log("Remove demo data:             SEED_DEMO_RESET=1 node scripts/demo-seed/index.mjs");
  console.log(`${line}\n`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const env = loadEnv(join(WEB_DIR, ".env"));
  const wantSeed = env.SEED_DEMO === "1";
  const wantReset = env.SEED_DEMO_RESET === "1";

  if (!wantSeed && !wantReset) {
    console.error(
      [
        "Refusing to run: no gate set.",
        "",
        "  Seed:   SEED_DEMO=1 node scripts/demo-seed/index.mjs",
        "  Reset:  SEED_DEMO_RESET=1 node scripts/demo-seed/index.mjs",
        "",
        "Target DB = DEMO_DATABASE_URL (if set) else DATABASE_URL from web/.env.",
        "Point DEMO_DATABASE_URL at a dev/staging project to keep production untouched.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const connectionString = env.DEMO_DATABASE_URL || env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DEMO_DATABASE_URL or DATABASE_URL is set. Aborting.");
    process.exit(1);
  }
  const host = new URL(connectionString).hostname;
  console.log(`🎯 Target database host: ${host}`);

  // Production guard (0111 / night-run A2a): seeding fake data into the live DB is how demo
  // content leaked into real users' feeds in the first place. If DEMO_DATABASE_URL is unset we
  // are pointed at the app's own DATABASE_URL (production), so refuse unless the operator opts
  // in EXPLICITLY with ALLOW_PROD_SEED=1 (the sanctioned App-Review reseed path). Reset is
  // always allowed — removing demo data from prod is exactly what we want to be easy.
  if (wantSeed && !env.DEMO_DATABASE_URL && env.ALLOW_PROD_SEED !== "1") {
    console.error(
      [
        "Refusing to SEED: no DEMO_DATABASE_URL set, so the target is the app's own",
        `DATABASE_URL (host ${host}) — i.e. PRODUCTION.`,
        "",
        "  • Dev/staging seed:  DEMO_DATABASE_URL=<staging-url> SEED_DEMO=1 node scripts/demo-seed/index.mjs",
        "  • Sanctioned prod reseed (App Review): ALLOW_PROD_SEED=1 SEED_DEMO=1 node scripts/demo-seed/index.mjs",
        "",
        "Seeded accounts are flagged is_demo=true (0111) so their content is excluded from all",
        "global feeds/discovery — but seeding prod is still an explicit, deliberate act.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const sql = createSql(connectionString, env);
  try {
    if (wantReset) {
      await reset(sql, env);
    } else {
      await seed(sql, env);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("\n❌ Demo seed failed:", err);
  process.exit(1);
});
