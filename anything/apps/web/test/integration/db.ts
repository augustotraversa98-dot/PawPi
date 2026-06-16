// Real-Postgres integration-test harness — test-side DB helpers (RLS R0 / Phase C).
//
// These run against a THROWAWAY embedded Postgres booted once per run by
// globalSetup.ts (NOT Supabase, NOT the app singleton in
// src/app/api/utils/sql.js). The connection string is published by globalSetup
// via Vitest's provide()/inject() seam and consumed here.
//
// NOTE: this module imports `vitest` (for inject) and so must only be imported
// from test files — never from globalSetup.ts (different context). The
// vitest-free migration runner lives in ./migrate.

import postgres from 'postgres';
import { inject } from 'vitest';
import type { Sql } from 'postgres';

export { MIGRATIONS_DIR, runMigrations } from './migrate';

/**
 * Open a test-only porsager client against the throwaway DB. Caller owns it and
 * must `await sql.end()` (do this in afterAll). max:1 keeps every statement on
 * one connection so TRUNCATE-based isolation is deterministic.
 */
export function makeTestSql(): Sql {
  const url = inject('TEST_DATABASE_URL');
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL was not provided — is test/integration/globalSetup.ts wired in vitest.integration.config.ts?',
    );
  }
  return postgres(url, { max: 1, onnotice: () => {} });
}

/**
 * Truncate every table in the public schema (RESTART IDENTITY CASCADE) for a
 * clean slate between tests. Generic on purpose — it discovers tables from the
 * catalog so new migrations need no maintenance here.
 */
export async function resetDb(sql: Sql): Promise<void> {
  const rows = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await sql.unsafe(`truncate table ${list} restart identity cascade`);
}

/**
 * Seed the real identity chain for one owner:
 *   auth_users.id -> user_profiles.auth_user_id -> user_profiles.id (= owner key)
 *   -> pets.owner_user_id
 * Returns the ids the way app code threads them (owner key is the PROFILE id,
 * never the auth id — the bug class PawPi has hit repeatedly). Explicit ids keep
 * the chain readable in assertions; identity columns allow explicit inserts.
 */
export async function seedOwnerWithPet(
  sql: Sql,
  opts: {
    authUserId: number;
    profileId: number;
    username: string;
    petId: number;
    petName: string;
  },
): Promise<{ authUserId: number; ownerUserId: number; petId: number }> {
  const { authUserId, profileId, username, petId, petName } = opts;
  await sql`
    insert into auth_users (id, name, email)
    values (${authUserId}, ${username}, ${`${username}@example.com`})
  `;
  await sql`
    insert into user_profiles (id, auth_user_id, username, onboarding_completed)
    values (${profileId}, ${authUserId}, ${username}, true)
  `;
  await sql`
    insert into pets (id, owner_user_id, name, handle)
    values (${petId}, ${profileId}, ${petName}, ${username + '-' + petName.toLowerCase()})
  `;
  return { authUserId, ownerUserId: profileId, petId };
}

/**
 * Seed a bare identity row pair (auth_users + user_profiles) with no pet — for a
 * provider-staff member, who is a user_profiles row but owns no pets in the test.
 */
export async function seedUser(
  sql: Sql,
  opts: { authUserId: number; profileId: number; username: string },
): Promise<{ profileId: number }> {
  const { authUserId, profileId, username } = opts;
  await sql`
    insert into auth_users (id, name, email)
    values (${authUserId}, ${username}, ${`${username}@example.com`})
  `;
  await sql`
    insert into user_profiles (id, auth_user_id, username, onboarding_completed)
    values (${profileId}, ${authUserId}, ${username}, true)
  `;
  return { profileId };
}

/**
 * Seed a provider + a provider_staff link to an existing user_profiles row. Used
 * to exercise the pets provider-read policy (the staff member is the "current" app
 * user via app.current_user_id). status defaults to 'active'.
 */
export async function seedProviderWithStaff(
  sql: Sql,
  opts: {
    providerId: number;
    ownerUserProfileId: number;
    staffUserProfileId: number;
    slug: string;
    staffStatus?: 'invited' | 'active' | 'removed';
  },
): Promise<{ providerId: number }> {
  const {
    providerId,
    ownerUserProfileId,
    staffUserProfileId,
    slug,
    staffStatus = 'active',
  } = opts;
  await sql`
    insert into providers (id, owner_user_profile_id, provider_type, name, slug)
    values (${providerId}, ${ownerUserProfileId}, 'vet', ${slug}, ${slug})
  `;
  await sql`
    insert into provider_staff (provider_id, user_profile_id, role, status)
    values (${providerId}, ${staffUserProfileId}, 'vet', ${staffStatus})
  `;
  return { providerId };
}

/**
 * Seed a care_access_grant for (pet, provider). Defaults to an active, non-expiring
 * grant covering medical_read — the happy path the provider-read policy allows.
 */
export async function seedGrant(
  sql: Sql,
  opts: {
    petId: number;
    ownerUserId: number;
    providerId: number;
    scopes?: string[];
    status?: 'pending' | 'active' | 'revoked' | 'expired';
    expiresAt?: string | null;
  },
): Promise<void> {
  const {
    petId,
    ownerUserId,
    providerId,
    scopes = ['medical_read'],
    status = 'active',
    expiresAt = null,
  } = opts;
  await sql`
    insert into care_access_grants
      (pet_id, owner_user_id, provider_id, scopes, status, requested_by, granted_at, expires_at)
    values (
      ${petId}, ${ownerUserId}, ${providerId}, ${scopes}, ${status}, 'provider',
      now(), ${expiresAt}
    )
  `;
}

/**
 * Seed a post authored by `userId` for `petId` (the social-feed unit). Explicit
 * id keeps assertions readable; caption defaults to the id for easy spotting.
 */
export async function seedPost(
  sql: Sql,
  opts: { postId: number; userId: number; petId: number; caption?: string },
): Promise<{ postId: number }> {
  const { postId, userId, petId, caption } = opts;
  await sql`
    insert into posts (id, user_id, pet_id, caption)
    values (${postId}, ${userId}, ${petId}, ${caption ?? `post-${postId}`})
  `;
  return { postId };
}

/** Seed a paw by `userId` on `postId` (post_paws is one row per (post,user)). */
export async function seedPaw(
  sql: Sql,
  opts: { postId: number; userId: number },
): Promise<void> {
  const { postId, userId } = opts;
  await sql`insert into post_paws (post_id, user_id) values (${postId}, ${userId})`;
}

/**
 * Seed a bark (comment) by `userId` on `postId`, posted AS `petId` (nullable —
 * legacy rows leave it null; the bark RLS does NOT gate on pet_id).
 */
export async function seedBark(
  sql: Sql,
  opts: { barkId: number; postId: number; userId: number; petId?: number | null; text?: string },
): Promise<{ barkId: number }> {
  const { barkId, postId, userId, petId = null, text } = opts;
  await sql`
    insert into post_barks (id, post_id, user_id, pet_id, text)
    values (${barkId}, ${postId}, ${userId}, ${petId}, ${text ?? `bark-${barkId}`})
  `;
  return { barkId };
}

/** Seed a one-directional pet follow (follower_pet_id -> followed_pet_id). */
export async function seedFollow(
  sql: Sql,
  opts: { followerPetId: number; followedPetId: number },
): Promise<void> {
  const { followerPetId, followedPetId } = opts;
  await sql`
    insert into pet_follows (follower_pet_id, followed_pet_id)
    values (${followerPetId}, ${followedPetId})
  `;
}

/**
 * Seed a pet_friendship between two (user, pet) participants. status defaults to
 * 'accepted' (the state social-walks reads). The participant RLS keys off the
 * requester/receiver USER ids.
 */
export async function seedFriendship(
  sql: Sql,
  opts: {
    requesterUserId: number;
    receiverUserId: number;
    requesterPetId: number;
    receiverPetId: number;
    status?: 'pending' | 'accepted' | 'blocked';
  },
): Promise<void> {
  const {
    requesterUserId,
    receiverUserId,
    requesterPetId,
    receiverPetId,
    status = 'accepted',
  } = opts;
  await sql`
    insert into pet_friendships
      (requester_user_id, receiver_user_id, requester_pet_id, receiver_pet_id, status)
    values (${requesterUserId}, ${receiverUserId}, ${requesterPetId}, ${receiverPetId}, ${status})
  `;
}

/**
 * Seed a health_food_log owned by `ownerUserId` for `petId` (R2c owner-private
 * group). owner_user_id is the RLS key; the rest is minimal valid data.
 */
export async function seedFoodLog(
  sql: Sql,
  opts: { logId: number; petId: number; ownerUserId: number; foodName?: string },
): Promise<{ logId: number }> {
  const { logId, petId, ownerUserId, foodName } = opts;
  await sql`
    insert into health_food_logs (id, pet_id, owner_user_id, food_name)
    values (${logId}, ${petId}, ${ownerUserId}, ${foodName ?? `food-${logId}`})
  `;
  return { logId };
}

/**
 * Seed a routine owned by `ownerUserId` for `petId` (R2c owner-private group).
 * routine_type is required; defaults to 'feeding'.
 */
export async function seedRoutine(
  sql: Sql,
  opts: { routineId: number; petId: number; ownerUserId: number; routineType?: string },
): Promise<{ routineId: number }> {
  const { routineId, petId, ownerUserId, routineType = 'feeding' } = opts;
  await sql`
    insert into routines (id, pet_id, owner_user_id, routine_type)
    values (${routineId}, ${petId}, ${ownerUserId}, ${routineType})
  `;
  return { routineId };
}

/**
 * Seed a pet_allergy owned by `ownerUserId` for `petId` (R2c owner-private group,
 * vet-record extras — NOT a provider-readable medical record). allergen required.
 */
export async function seedAllergy(
  sql: Sql,
  opts: { allergyId: number; petId: number; ownerUserId: number; allergen?: string },
): Promise<{ allergyId: number }> {
  const { allergyId, petId, ownerUserId, allergen } = opts;
  await sql`
    insert into pet_allergies (id, pet_id, owner_user_id, allergen)
    values (${allergyId}, ${petId}, ${ownerUserId}, ${allergen ?? `allergen-${allergyId}`})
  `;
  return { allergyId };
}

/**
 * Seed a vet_appointments booking linking a provider to a pet (the inbox path).
 * deleted defaults false; pass deleted:true to prove a soft-deleted booking grants
 * no visibility.
 */
export async function seedBooking(
  sql: Sql,
  opts: {
    apptId?: number;
    petId: number;
    ownerUserId: number;
    providerId: number;
    deleted?: boolean;
  },
): Promise<{ apptId: number }> {
  const { apptId, petId, ownerUserId, providerId, deleted = false } = opts;
  const deletedAt = deleted ? '2026-06-01T00:00:00Z' : null;
  const rows =
    apptId != null
      ? await sql<{ id: number }[]>`
          insert into vet_appointments
            (id, pet_id, owner_user_id, title, appointment_date, appointment_time,
             provider_id, booking_status, source, deleted_at)
          values (
            ${apptId}, ${petId}, ${ownerUserId}, 'Checkup', '2026-07-01', '09:00',
            ${providerId}, 'requested', 'owner', ${deletedAt}
          )
          returning id
        `
      : await sql<{ id: number }[]>`
          insert into vet_appointments
            (pet_id, owner_user_id, title, appointment_date, appointment_time,
             provider_id, booking_status, source, deleted_at)
          values (
            ${petId}, ${ownerUserId}, 'Checkup', '2026-07-01', '09:00',
            ${providerId}, 'requested', 'owner', ${deletedAt}
          )
          returning id
        `;
  return { apptId: rows[0].id };
}

/**
 * Seed a pet_medical_profiles row for `petId` owned by `ownerUserId` (R2d
 * provider-accessible medical group). One row per pet (unique pet_id). microchip_id
 * carries the id for readable assertions.
 */
export async function seedMedicalProfile(
  sql: Sql,
  opts: { profileRowId: number; petId: number; ownerUserId: number },
): Promise<{ profileRowId: number }> {
  const { profileRowId, petId, ownerUserId } = opts;
  await sql`
    insert into pet_medical_profiles (id, pet_id, owner_user_id, microchip_id)
    values (${profileRowId}, ${petId}, ${ownerUserId}, ${`chip-${profileRowId}`})
  `;
  return { profileRowId };
}

/**
 * Seed a vet_note for `petId` owned by `ownerUserId` (R2d). note + note_date are
 * required; both default off the id for readable assertions.
 */
export async function seedVetNote(
  sql: Sql,
  opts: { noteId: number; petId: number; ownerUserId: number; note?: string },
): Promise<{ noteId: number }> {
  const { noteId, petId, ownerUserId, note } = opts;
  await sql`
    insert into vet_notes (id, pet_id, owner_user_id, note_date, note)
    values (${noteId}, ${petId}, ${ownerUserId}, '2026-06-01', ${note ?? `note-${noteId}`})
  `;
  return { noteId };
}

/**
 * Seed a pet_vaccination for `petId` owned by `ownerUserId` (R2d). name is required;
 * defaults off the id.
 */
export async function seedVaccination(
  sql: Sql,
  opts: { vaxId: number; petId: number; ownerUserId: number; name?: string },
): Promise<{ vaxId: number }> {
  const { vaxId, petId, ownerUserId, name } = opts;
  await sql`
    insert into pet_vaccinations (id, pet_id, owner_user_id, name)
    values (${vaxId}, ${petId}, ${ownerUserId}, ${name ?? `vax-${vaxId}`})
  `;
  return { vaxId };
}
