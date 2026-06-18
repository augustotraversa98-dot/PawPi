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
    staffRole?: 'owner' | 'admin' | 'staff' | 'vet';
    providerStatus?: 'draft' | 'published';
  },
): Promise<{ providerId: number }> {
  const {
    providerId,
    ownerUserProfileId,
    staffUserProfileId,
    slug,
    staffStatus = 'active',
    staffRole = 'vet',
    providerStatus = 'draft',
  } = opts;
  await sql`
    insert into providers (id, owner_user_profile_id, provider_type, name, slug, status)
    values (${providerId}, ${ownerUserProfileId}, 'vet', ${slug}, ${slug}, ${providerStatus})
  `;
  await sql`
    insert into provider_staff (provider_id, user_profile_id, role, status)
    values (${providerId}, ${staffUserProfileId}, ${staffRole}, ${staffStatus})
  `;
  return { providerId };
}

/**
 * Seed a bare provider row (no staff) — for R2e tests that need a provider whose
 * staff/ownership shape they control row-by-row via seedStaff. status defaults to
 * 'draft'; owner_user_profile_id is the business owner (NOT auto-added as staff here).
 */
export async function seedProvider(
  sql: Sql,
  opts: {
    providerId: number;
    ownerUserProfileId: number;
    slug: string;
    status?: 'draft' | 'published';
  },
): Promise<{ providerId: number }> {
  const { providerId, ownerUserProfileId, slug, status = 'draft' } = opts;
  await sql`
    insert into providers (id, owner_user_profile_id, provider_type, name, slug, status)
    values (${providerId}, ${ownerUserProfileId}, 'vet', ${slug}, ${slug}, ${status})
  `;
  return { providerId };
}

/** Seed one provider_staff membership row (R2e). status/role default active/staff. */
export async function seedStaff(
  sql: Sql,
  opts: {
    providerId: number;
    userProfileId: number;
    role?: 'owner' | 'admin' | 'staff' | 'vet';
    status?: 'invited' | 'active' | 'removed';
  },
): Promise<void> {
  const { providerId, userProfileId, role = 'staff', status = 'active' } = opts;
  await sql`
    insert into provider_staff (provider_id, user_profile_id, role, status)
    values (${providerId}, ${userProfileId}, ${role}, ${status})
  `;
}

/**
 * Seed a provider_capability row (ticket 2.1). One row per (provider, capability);
 * capability must be in the allowed set (the table CHECK enforces it).
 */
export async function seedCapability(
  sql: Sql,
  opts: { providerId: number; capability: string },
): Promise<void> {
  const { providerId, capability } = opts;
  await sql`
    insert into provider_capabilities (provider_id, capability)
    values (${providerId}, ${capability})
  `;
}

/** Seed a provider_service (R2e). active defaults true; name carries the id. */
export async function seedService(
  sql: Sql,
  opts: { serviceId: number; providerId: number; active?: boolean; name?: string },
): Promise<{ serviceId: number }> {
  const { serviceId, providerId, active = true, name } = opts;
  await sql`
    insert into provider_services (id, provider_id, name, active)
    values (${serviceId}, ${providerId}, ${name ?? `service-${serviceId}`}, ${active})
  `;
  return { serviceId };
}

/** Seed a provider_location (R2e). name carries the id. */
export async function seedLocation(
  sql: Sql,
  opts: { locationId: number; providerId: number; name?: string },
): Promise<{ locationId: number }> {
  const { locationId, providerId, name } = opts;
  await sql`
    insert into provider_locations (id, provider_id, name)
    values (${locationId}, ${providerId}, ${name ?? `location-${locationId}`})
  `;
  return { locationId };
}

/**
 * Seed a provider_review by reviewer `ownerUserId` for `petId` (R2e / ticket 2.2). rating
 * defaults 5. appointmentId is optional — pass it to tie the review to a completed booking
 * (the 2.2 dedup column, added in 0028); omit for legacy-shape rows.
 */
export async function seedReview(
  sql: Sql,
  opts: {
    reviewId: number;
    providerId: number;
    ownerUserId: number;
    petId: number;
    rating?: number;
    appointmentId?: number | null;
  },
): Promise<{ reviewId: number }> {
  const { reviewId, providerId, ownerUserId, petId, rating = 5, appointmentId = null } = opts;
  await sql`
    insert into provider_reviews (id, provider_id, owner_user_id, pet_id, rating, body, appointment_id)
    values (${reviewId}, ${providerId}, ${ownerUserId}, ${petId}, ${rating}, ${`review-${reviewId}`}, ${appointmentId})
  `;
  return { reviewId };
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
 * Seed a social_walk owned by `ownerUserId` for `petId` (R2g social-walk group).
 * visibility/status default to the discoverable/scheduled happy path; walk_name +
 * scheduled_at carry the id for readable assertions.
 */
export async function seedSocialWalk(
  sql: Sql,
  opts: {
    walkId: number;
    petId: number;
    ownerUserId: number;
    visibility?: 'private' | 'friends_only' | 'nearby_pets';
    status?: 'scheduled' | 'cancelled' | 'completed';
    maxPets?: number;
  },
): Promise<{ walkId: number }> {
  const {
    walkId,
    petId,
    ownerUserId,
    visibility = 'nearby_pets',
    status = 'scheduled',
    maxPets = 4,
  } = opts;
  await sql`
    insert into social_walks
      (id, pet_id, owner_user_id, walk_name, scheduled_at, visibility, status, max_pets)
    values (
      ${walkId}, ${petId}, ${ownerUserId}, ${`walk-${walkId}`},
      '2026-08-01T09:00:00Z', ${visibility}, ${status}, ${maxPets}
    )
  `;
  return { walkId };
}

/**
 * Seed a social_walk_join_request by requester (`requesterUserId`/`requesterPetId`)
 * against `walkId` (R2g). status defaults to 'pending'.
 */
export async function seedJoinRequest(
  sql: Sql,
  opts: {
    requestId: number;
    walkId: number;
    requesterUserId: number;
    requesterPetId: number;
    status?: 'pending' | 'approved' | 'declined' | 'cancelled';
  },
): Promise<{ requestId: number }> {
  const { requestId, walkId, requesterUserId, requesterPetId, status = 'pending' } = opts;
  await sql`
    insert into social_walk_join_requests
      (id, social_walk_id, requester_user_id, requester_pet_id, status)
    values (${requestId}, ${walkId}, ${requesterUserId}, ${requesterPetId}, ${status})
  `;
  return { requestId };
}

/** Seed a pet_caregivers person↔person grant (ticket 2.47). Defaults to an active grant. */
export async function seedPetCaregiver(
  sql: Sql,
  opts: {
    id: number;
    petId: number;
    ownerUserId: number;
    granteeUserId: number;
    role?: 'family' | 'caregiver';
    scopes?: string[];
    status?: 'pending' | 'active' | 'revoked' | 'declined' | 'expired';
    expiresAt?: string | null;
  },
): Promise<{ id: number }> {
  const {
    id, petId, ownerUserId, granteeUserId,
    role = 'family', scopes = [], status = 'active', expiresAt = null,
  } = opts;
  await sql`
    insert into pet_caregivers
      (id, pet_id, owner_user_id, grantee_user_id, role, scopes, status, expires_at, accepted_at)
    values (
      ${id}, ${petId}, ${ownerUserId}, ${granteeUserId}, ${role}, ${scopes}, ${status},
      ${expiresAt}, ${status === 'active' ? sql`now()` : null}
    )
  `;
  return { id };
}

/** Seed a routines row owned by `ownerUserId` for `petId` (ticket 2.47 access proofs). */
export async function seedRoutineRow(
  sql: Sql,
  opts: { id: number; petId: number; ownerUserId: number; routineType?: string },
): Promise<{ id: number }> {
  const { id, petId, ownerUserId, routineType = 'feeding' } = opts;
  await sql`
    insert into routines (id, pet_id, owner_user_id, routine_type, title)
    values (${id}, ${petId}, ${ownerUserId}, ${routineType}, ${`routine-${id}`})
  `;
  return { id };
}

/** Seed a health_food_logs row (ticket 2.47 family read/write proofs). */
export async function seedFoodLogRow(
  sql: Sql,
  opts: { id: number; petId: number; ownerUserId: number },
): Promise<{ id: number }> {
  const { id, petId, ownerUserId } = opts;
  await sql`
    insert into health_food_logs (id, pet_id, owner_user_id, logged_at)
    values (${id}, ${petId}, ${ownerUserId}, now())
  `;
  return { id };
}

/** Seed a training_progress_self completion row (ticket 2.45). */
export async function seedSelfTrainingProgress(
  sql: Sql,
  opts: {
    id: number;
    ownerUserId: number;
    petId: number;
    programKey?: string;
    sessionKey?: string;
  },
): Promise<{ id: number }> {
  const { id, ownerUserId, petId, programKey = 'basic-obedience', sessionKey = 'sit' } = opts;
  await sql`
    insert into training_progress_self (id, owner_user_id, pet_id, program_key, session_key)
    values (${id}, ${ownerUserId}, ${petId}, ${programKey}, ${sessionKey})
  `;
  return { id };
}

/**
 * Seed a forum_threads row (ticket 2.44). Defaults to a live (non-deleted) General thread.
 */
export async function seedForumThread(
  sql: Sql,
  opts: {
    threadId: number;
    authorUserId: number;
    category?: string;
    title?: string;
    score?: number;
  },
): Promise<{ threadId: number }> {
  const { threadId, authorUserId, category = 'General', title = `thread-${opts.threadId}`, score = 0 } = opts;
  await sql`
    insert into forum_threads (id, author_user_id, category, title, body, score)
    values (${threadId}, ${authorUserId}, ${category}, ${title}, 'body', ${score})
  `;
  return { threadId };
}

/** Seed a forum_comments row (ticket 2.44). */
export async function seedForumComment(
  sql: Sql,
  opts: {
    commentId: number;
    threadId: number;
    authorUserId: number;
    parentCommentId?: number | null;
    score?: number;
  },
): Promise<{ commentId: number }> {
  const { commentId, threadId, authorUserId, parentCommentId = null, score = 0 } = opts;
  await sql`
    insert into forum_comments (id, thread_id, author_user_id, parent_comment_id, body, score)
    values (${commentId}, ${threadId}, ${authorUserId}, ${parentCommentId}, 'comment', ${score})
  `;
  return { commentId };
}

/** Seed a forum_votes row directly (ticket 2.44) — bypasses forum_vote() for setup. */
export async function seedForumVote(
  sql: Sql,
  opts: {
    voteId: number;
    userId: number;
    targetType: 'thread' | 'comment';
    targetId: number;
    value: 1 | -1;
  },
): Promise<{ voteId: number }> {
  const { voteId, userId, targetType, targetId, value } = opts;
  await sql`
    insert into forum_votes (id, user_id, target_type, target_id, value)
    values (${voteId}, ${userId}, ${targetType}, ${targetId}, ${value})
  `;
  return { voteId };
}

/**
 * Seed a social_walk_invites row — an owner-issued invitation to a PRIVATE walk
 * (ticket 2.43). `invitedByUserId` defaults to the walk's owner concept (caller passes it).
 */
export async function seedWalkInvite(
  sql: Sql,
  opts: {
    inviteId: number;
    walkId: number;
    invitedUserId: number;
    invitedByUserId: number;
    status?: 'invited' | 'accepted' | 'declined';
  },
): Promise<{ inviteId: number }> {
  const { inviteId, walkId, invitedUserId, invitedByUserId, status = 'invited' } = opts;
  await sql`
    insert into social_walk_invites
      (id, social_walk_id, invited_user_id, invited_by_user_id, status)
    values (${inviteId}, ${walkId}, ${invitedUserId}, ${invitedByUserId}, ${status})
  `;
  return { inviteId };
}

/**
 * Seed a provider_payment_account for (provider, rail) (ticket 2.3 — money group). Holds
 * the provider's rail token; provider-admin RLS only. Defaults to mercadopago/connected.
 */
export async function seedPaymentAccount(
  sql: Sql,
  opts: {
    accountId: number;
    providerId: number;
    rail?: 'mercadopago' | 'binance';
    accessToken?: string | null;
    accountRef?: string | null;
  },
): Promise<{ accountId: number }> {
  const {
    accountId,
    providerId,
    rail = 'mercadopago',
    accessToken = 'secret-token',
    accountRef = null,
  } = opts;
  await sql`
    insert into provider_payment_accounts (id, provider_id, rail, access_token, account_ref, status)
    values (${accountId}, ${providerId}, ${rail}, ${accessToken}, ${accountRef}, 'connected')
  `;
  return { accountId };
}

/**
 * Seed an order paid by `ownerUserId` to `providerId` (ticket 2.3 — money group). kind
 * defaults 'booking'; amount/currency carry sensible defaults; status 'pending'.
 */
export async function seedOrder(
  sql: Sql,
  opts: {
    orderId: number;
    ownerUserId: number;
    providerId: number;
    kind?: 'booking' | 'product' | 'adoption_fee' | 'donation' | 'subscription';
    amountCents?: number;
    status?: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'failed';
  },
): Promise<{ orderId: number }> {
  const {
    orderId,
    ownerUserId,
    providerId,
    kind = 'booking',
    amountCents = 10000,
    status = 'pending',
  } = opts;
  await sql`
    insert into orders (id, owner_user_id, provider_id, kind, amount_cents, currency, status)
    values (${orderId}, ${ownerUserId}, ${providerId}, ${kind}, ${amountCents}, 'ARS', ${status})
  `;
  return { orderId };
}

/** Seed an order_item line on `orderId` (ticket 2.3). */
export async function seedOrderItem(
  sql: Sql,
  opts: { itemId: number; orderId: number; name?: string; unitCents?: number },
): Promise<{ itemId: number }> {
  const { itemId, orderId, name, unitCents = 5000 } = opts;
  await sql`
    insert into order_items (id, order_id, name, quantity, unit_cents)
    values (${itemId}, ${orderId}, ${name ?? `item-${itemId}`}, 1, ${unitCents})
  `;
  return { itemId };
}

/** Seed a payment ledger row on `orderId` (ticket 2.3). rail/status default mercadopago/pending. */
export async function seedPayment(
  sql: Sql,
  opts: {
    paymentId: number;
    orderId: number;
    rail?: 'mercadopago' | 'binance';
    status?: 'pending' | 'approved' | 'refunded' | 'failed';
    amountCents?: number;
    externalId?: string | null;
  },
): Promise<{ paymentId: number }> {
  const {
    paymentId,
    orderId,
    rail = 'mercadopago',
    status = 'pending',
    amountCents = 10000,
    externalId = null,
  } = opts;
  await sql`
    insert into payments (id, order_id, rail, external_id, status, amount_cents, commission_cents)
    values (${paymentId}, ${orderId}, ${rail}, ${externalId}, ${status}, ${amountCents}, 0)
  `;
  return { paymentId };
}

/** Seed a payout for `providerId` (ticket 2.3 — provider-scoped settlement). */
export async function seedPayout(
  sql: Sql,
  opts: {
    payoutId: number;
    providerId: number;
    rail?: 'mercadopago' | 'binance';
    amountCents?: number;
    status?: 'pending' | 'paid' | 'failed';
  },
): Promise<{ payoutId: number }> {
  const {
    payoutId,
    providerId,
    rail = 'binance',
    amountCents = 9000,
    status = 'paid',
  } = opts;
  await sql`
    insert into payouts (id, provider_id, rail, amount_cents, status)
    values (${payoutId}, ${providerId}, ${rail}, ${amountCents}, ${status})
  `;
  return { payoutId };
}

/** Seed a subscription owned by `ownerUserId` billed to `providerId` (ticket 2.3). */
export async function seedSubscription(
  sql: Sql,
  opts: {
    subscriptionId: number;
    ownerUserId: number;
    providerId: number;
    plan?: string;
    status?: 'active' | 'paused' | 'cancelled';
  },
): Promise<{ subscriptionId: number }> {
  const {
    subscriptionId,
    ownerUserId,
    providerId,
    plan = 'monthly',
    status = 'active',
  } = opts;
  await sql`
    insert into subscriptions (id, owner_user_id, provider_id, plan, status)
    values (${subscriptionId}, ${ownerUserId}, ${providerId}, ${plan}, ${status})
  `;
  return { subscriptionId };
}

/**
 * Seed a shop_products catalog row for `providerId` (ticket 2.11). price/stock/active default
 * to a purchasable in-stock product; is_rx defaults false. Used to exercise the shop_products
 * RLS (discovery vs admin) + the cart→order→stock flow.
 */
export async function seedShopProduct(
  sql: Sql,
  opts: {
    productId: number;
    providerId: number;
    name?: string;
    priceCents?: number;
    stockQty?: number;
    isRx?: boolean;
    active?: boolean;
    category?: string | null;
  },
): Promise<{ productId: number }> {
  const {
    productId,
    providerId,
    name,
    priceCents = 5000,
    stockQty = 10,
    isRx = false,
    active = true,
    category = null,
  } = opts;
  await sql`
    insert into shop_products
      (id, provider_id, name, price_cents, stock_qty, is_rx, active, category)
    values (
      ${productId}, ${providerId}, ${name ?? `product-${productId}`}, ${priceCents},
      ${stockQty}, ${isRx}, ${active}, ${category}
    )
  `;
  return { productId };
}

/**
 * Set a provider's published status (ticket 2.11 discovery tests). seedProvider defaults to
 * 'draft'; flip to 'published' so its active products become discovery-readable.
 */
export async function setProviderStatus(
  sql: Sql,
  opts: { providerId: number; status: 'draft' | 'published' },
): Promise<void> {
  await sql`update providers set status = ${opts.status} where id = ${opts.providerId}`;
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
 * Seed a provider_availability window (ticket 2.4 — generalized booking). Defaults to a
 * Monday (weekday 0) 09:00–17:00 provider-wide window. staffUserId/capability NULL =
 * provider-wide / all-capability. Used to exercise the availability RLS.
 */
export async function seedAvailability(
  sql: Sql,
  opts: {
    availabilityId: number;
    providerId: number;
    staffUserId?: number | null;
    capability?: string | null;
    weekday?: number;
    startTime?: string;
    endTime?: string;
    slotMinutes?: number;
  },
): Promise<{ availabilityId: number }> {
  const {
    availabilityId,
    providerId,
    staffUserId = null,
    capability = null,
    weekday = 0,
    startTime = '09:00',
    endTime = '17:00',
    slotMinutes = 30,
  } = opts;
  await sql`
    insert into provider_availability
      (id, provider_id, staff_user_id, capability, weekday, start_time, end_time, slot_minutes)
    values (
      ${availabilityId}, ${providerId}, ${staffUserId}, ${capability},
      ${weekday}, ${startTime}, ${endTime}, ${slotMinutes}
    )
  `;
  return { availabilityId };
}

/**
 * Seed a GENERALIZED (non-vet) booking on vet_appointments with a concrete slot
 * (start_at/end_at) + capability + optional staff (ticket 2.4). Used to prove the
 * generalized columns + RLS + double-book index. Defaults to a groomer booking.
 */
export async function seedGeneralBooking(
  sql: Sql,
  opts: {
    apptId: number;
    petId: number;
    ownerUserId: number;
    providerId: number;
    staffUserId?: number | null;
    capability?: string;
    startAt?: string;
    endAt?: string;
    bookingStatus?: 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'completed';
    orderId?: number | null;
    recurrenceRule?: string | null;
    meetAndGreet?: boolean;
  },
): Promise<{ apptId: number }> {
  const {
    apptId,
    petId,
    ownerUserId,
    providerId,
    staffUserId = null,
    capability = 'groomer',
    startAt = '2026-07-06T09:00:00Z', // a Monday
    endAt = '2026-07-06T09:30:00Z',
    bookingStatus = 'requested',
    orderId = null,
    recurrenceRule = null,
    meetAndGreet = false,
  } = opts;
  await sql`
    insert into vet_appointments
      (id, pet_id, owner_user_id, title, appointment_date, appointment_time,
       provider_id, staff_user_id, capability, start_at, end_at, recurrence_rule,
       order_id, meet_and_greet, booking_status, source, status)
    values (
      ${apptId}, ${petId}, ${ownerUserId}, 'Groom', '2026-07-06', '09:00',
      ${providerId}, ${staffUserId}, ${capability}, ${startAt}, ${endAt}, ${recurrenceRule},
      ${orderId}, ${meetAndGreet}, ${bookingStatus}, 'owner', 'scheduled'
    )
  `;
  return { apptId };
}

/**
 * Seed a message_thread between owner `ownerUserId` and `providerId` (ticket 2.5 —
 * chat). bookingId optional (a booking-tied thread). Used to exercise the
 * participant-scoped RLS.
 */
export async function seedThread(
  sql: Sql,
  opts: {
    threadId: number;
    ownerUserId: number;
    providerId: number;
    bookingId?: number | null;
  },
): Promise<{ threadId: number }> {
  const { threadId, ownerUserId, providerId, bookingId = null } = opts;
  await sql`
    insert into message_threads (id, owner_user_id, provider_id, booking_id)
    values (${threadId}, ${ownerUserId}, ${providerId}, ${bookingId})
  `;
  return { threadId };
}

/**
 * Seed a message on `threadId` authored by `senderUserId` (ticket 2.5). body defaults
 * off the id; readAt optional (a read message). Used to exercise the messages RLS +
 * unread count.
 */
export async function seedMessage(
  sql: Sql,
  opts: {
    messageId: number;
    threadId: number;
    senderUserId: number;
    body?: string;
    attachmentUrl?: string | null;
    readAt?: string | null;
  },
): Promise<{ messageId: number }> {
  const { messageId, threadId, senderUserId, body, attachmentUrl = null, readAt = null } = opts;
  await sql`
    insert into messages (id, thread_id, sender_user_id, body, attachment_url, read_at)
    values (${messageId}, ${threadId}, ${senderUserId}, ${body ?? `msg-${messageId}`}, ${attachmentUrl}, ${readAt})
  `;
  return { messageId };
}

/**
 * Seed an adoptable_listings row for `providerId` (ticket 2.12 — adoption). status defaults
 * 'available'; name carries the id; fee defaults to a small fee. Used to exercise the
 * adoptable_listings RLS (published-available discovery vs shelter-staff) + the approval flow.
 */
export async function seedAdoptableListing(
  sql: Sql,
  opts: {
    listingId: number;
    providerId: number;
    name?: string;
    breed?: string | null;
    status?: 'available' | 'pending' | 'adopted';
    adoptionFeeCents?: number;
    photoUrls?: string[];
  },
): Promise<{ listingId: number }> {
  const {
    listingId,
    providerId,
    name,
    breed = 'Labrador',
    status = 'available',
    adoptionFeeCents = 5000,
    photoUrls = [`dog-${opts.listingId}.jpg`],
  } = opts;
  await sql`
    insert into adoptable_listings
      (id, provider_id, name, breed, age_years, gender, size, photo_urls, story,
       adoption_fee_cents, status)
    values (
      ${listingId}, ${providerId}, ${name ?? `dog-${listingId}`}, ${breed}, 2, 'male',
      'medium', ${photoUrls}, ${`story-${listingId}`}, ${adoptionFeeCents}, ${status}
    )
  `;
  return { listingId };
}

/**
 * Seed an adoption_applications row by applicant `applicantUserId` for `listingId` at
 * `providerId` (ticket 2.12). status defaults 'submitted'. Used to exercise the
 * applicant-own vs shelter-staff RLS + the approval → pet-transfer helper.
 */
export async function seedAdoptionApplication(
  sql: Sql,
  opts: {
    applicationId: number;
    listingId: number;
    providerId: number;
    applicantUserId: number;
    status?: 'submitted' | 'under_review' | 'approved' | 'declined';
    answers?: Record<string, unknown>;
  },
): Promise<{ applicationId: number }> {
  const {
    applicationId,
    listingId,
    providerId,
    applicantUserId,
    status = 'submitted',
    answers = { home: 'house', otherPets: false },
  } = opts;
  await sql`
    insert into adoption_applications
      (id, listing_id, provider_id, applicant_owner_user_id, answers, status)
    values (
      ${applicationId}, ${listingId}, ${providerId}, ${applicantUserId},
      ${sql.json(answers)}, ${status}
    )
  `;
  return { applicationId };
}

/** Seed an adoption_favorites row for owner `ownerUserId` on `listingId` (ticket 2.12). */
export async function seedAdoptionFavorite(
  sql: Sql,
  opts: { favoriteId: number; ownerUserId: number; listingId: number },
): Promise<{ favoriteId: number }> {
  const { favoriteId, ownerUserId, listingId } = opts;
  await sql`
    insert into adoption_favorites (id, owner_user_id, listing_id)
    values (${favoriteId}, ${ownerUserId}, ${listingId})
  `;
  return { favoriteId };
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

/**
 * Seed a groom_sessions row for `petId` owned by `ownerUserId`, logged by `providerId`
 * (ticket 2.6 — grooming). before/after URLs default off the id for readable
 * assertions. Used to exercise the owner-read / provider-grant RLS on groom_sessions.
 */
export async function seedGroomSession(
  sql: Sql,
  opts: {
    sessionId: number;
    petId: number;
    ownerUserId: number;
    providerId: number;
    bookingId?: number | null;
    beforeUrls?: string[];
    afterUrls?: string[];
    coatSkinNotes?: string | null;
  },
): Promise<{ sessionId: number }> {
  const {
    sessionId,
    petId,
    ownerUserId,
    providerId,
    bookingId = null,
    beforeUrls = [`before-${opts.sessionId}.jpg`],
    afterUrls = [`after-${opts.sessionId}.jpg`],
    coatSkinNotes = `coat-${opts.sessionId}`,
  } = opts;
  await sql`
    insert into groom_sessions
      (id, booking_id, pet_id, owner_user_id, provider_id, before_urls, after_urls, coat_skin_notes)
    values (
      ${sessionId}, ${bookingId}, ${petId}, ${ownerUserId}, ${providerId},
      ${beforeUrls}, ${afterUrls}, ${coatSkinNotes}
    )
  `;
  return { sessionId };
}

/**
 * Set a provider_locations.capacity (ticket 2.8). Seed the location with seedLocation
 * first, then set its capacity here (the column is additive in 0034). NULL clears it.
 */
export async function setLocationCapacity(
  sql: Sql,
  opts: { locationId: number; capacity: number | null },
): Promise<void> {
  const { locationId, capacity } = opts;
  await sql`update provider_locations set capacity = ${capacity} where id = ${locationId}`;
}

/**
 * Seed a daycare_requirements row (ticket 2.8) — a facility's required vaccine. locationId
 * NULL = provider-wide. active defaults true.
 */
export async function seedDaycareRequirement(
  sql: Sql,
  opts: {
    requirementId: number;
    providerId: number;
    vaccineName: string;
    locationId?: number | null;
    active?: boolean;
  },
): Promise<{ requirementId: number }> {
  const { requirementId, providerId, vaccineName, locationId = null, active = true } = opts;
  await sql`
    insert into daycare_requirements (id, provider_id, location_id, vaccine_name, active)
    values (${requirementId}, ${providerId}, ${locationId}, ${vaccineName}, ${active})
  `;
  return { requirementId };
}

/**
 * Seed a daycare_stays row for `petId` owned by `ownerUserId` at `providerId` (ticket 2.8).
 * status defaults 'booked'; start/end default to a one-day stay. Used to exercise the
 * owner-FOR-ALL + provider-via-grant RLS + the report-card scoping.
 */
export async function seedDaycareStay(
  sql: Sql,
  opts: {
    stayId: number;
    petId: number;
    ownerUserId: number;
    providerId: number;
    locationId?: number | null;
    bookingId?: number | null;
    startDate?: string;
    endDate?: string;
    status?: 'booked' | 'checked_in' | 'checked_out' | 'cancelled';
    feedingInstructions?: string | null;
    medInstructions?: string | null;
  },
): Promise<{ stayId: number }> {
  const {
    stayId,
    petId,
    ownerUserId,
    providerId,
    locationId = null,
    bookingId = null,
    startDate = '2026-08-01',
    endDate = '2026-08-03',
    status = 'booked',
    feedingInstructions = 'Two cups, morning and evening',
    medInstructions = null,
  } = opts;
  await sql`
    insert into daycare_stays
      (id, booking_id, pet_id, owner_user_id, provider_id, location_id,
       start_date, end_date, status, feeding_instructions, med_instructions)
    values (
      ${stayId}, ${bookingId}, ${petId}, ${ownerUserId}, ${providerId}, ${locationId},
      ${startDate}, ${endDate}, ${status}, ${feedingInstructions}, ${medInstructions}
    )
  `;
  return { stayId };
}

/**
 * Seed a report_cards row on `stayId` (ticket 2.8). date defaults to the stay's first day;
 * mood/photo carry the id for readable assertions. Used to exercise the through-stay RLS.
 */
export async function seedReportCard(
  sql: Sql,
  opts: {
    cardId: number;
    stayId: number;
    date?: string;
    mood?: string;
    photoUrls?: string[];
  },
): Promise<{ cardId: number }> {
  const { cardId, stayId, date = '2026-08-01', mood, photoUrls } = opts;
  await sql`
    insert into report_cards (id, stay_id, date, mood, photo_urls)
    values (
      ${cardId}, ${stayId}, ${date}, ${mood ?? `mood-${cardId}`},
      ${photoUrls ?? [`card-${cardId}.jpg`]}
    )
  `;
  return { cardId };
}

/**
 * Seed a walk_sessions row for `petId` owned by `ownerUserId`, run by `providerId` and
 * ASSIGNED to walker `staffUserId` (ticket 2.7 — walking GPS). status defaults to
 * 'in_progress'; route defaults to a one-point live track for readable assertions. Used
 * to exercise the participant-scoped RLS (owner FOR ALL + assigned-walker per-command) —
 * the live-location guard.
 */
export async function seedWalkSession(
  sql: Sql,
  opts: {
    sessionId: number;
    petId: number;
    ownerUserId: number;
    providerId: number;
    staffUserId?: number | null;
    bookingId?: number | null;
    status?: 'scheduled' | 'in_progress' | 'finished' | 'cancelled';
    route?: Array<{ lat: number; lng: number; t?: number | null }>;
  },
): Promise<{ sessionId: number }> {
  const {
    sessionId,
    petId,
    ownerUserId,
    providerId,
    staffUserId = null,
    bookingId = null,
    status = 'in_progress',
    route = [{ lat: 1.1, lng: 2.2, t: 1000 }],
  } = opts;
  await sql`
    insert into walk_sessions
      (id, booking_id, pet_id, owner_user_id, provider_id, staff_user_id, status, route)
    values (
      ${sessionId}, ${bookingId}, ${petId}, ${ownerUserId}, ${providerId},
      ${staffUserId}, ${status}, ${sql.json(route)}
    )
  `;
  return { sessionId };
}

/**
 * Seed a sitting_visits row for `petId` owned by `ownerUserId`, run by `providerId` and
 * ASSIGNED to sitter `staffUserId` (ticket 2.9 — pet sitting). status defaults to
 * 'completed'; photo/video default to one URL each for readable media assertions. Used to
 * exercise the participant-scoped RLS (owner FOR ALL + assigned-sitter per-command) — the
 * visit-media guard.
 */
export async function seedSittingVisit(
  sql: Sql,
  opts: {
    visitId: number;
    petId: number;
    ownerUserId: number;
    providerId: number;
    staffUserId?: number | null;
    bookingId?: number | null;
    status?: 'scheduled' | 'completed' | 'cancelled';
    photoUrls?: string[];
    videoUrls?: string[];
  },
): Promise<{ visitId: number }> {
  const {
    visitId,
    petId,
    ownerUserId,
    providerId,
    staffUserId = null,
    bookingId = null,
    status = 'completed',
    photoUrls,
    videoUrls,
  } = opts;
  await sql`
    insert into sitting_visits
      (id, booking_id, pet_id, owner_user_id, provider_id, staff_user_id, status,
       photo_urls, video_urls)
    values (
      ${visitId}, ${bookingId}, ${petId}, ${ownerUserId}, ${providerId},
      ${staffUserId}, ${status},
      ${photoUrls ?? [`visit-${visitId}.jpg`]},
      ${videoUrls ?? [`visit-${visitId}.mp4`]}
    )
  `;
  return { visitId };
}

/**
 * Seed a training_programs ENROLLMENT for `petId` owned by `ownerUserId` at `providerId`
 * (ticket 2.10 — training). status defaults 'active'; title/total_sessions/video_lesson_urls
 * carry sensible defaults. Used to exercise the owner-FOR-ALL + provider-via-grant RLS.
 */
export async function seedTrainingProgram(
  sql: Sql,
  opts: {
    programId: number;
    petId: number;
    ownerUserId: number;
    providerId: number;
    bookingId?: number | null;
    title?: string;
    totalSessions?: number;
    status?: 'active' | 'completed' | 'cancelled';
    videoLessonUrls?: string[];
  },
): Promise<{ programId: number }> {
  const {
    programId,
    petId,
    ownerUserId,
    providerId,
    bookingId = null,
    title,
    totalSessions = 6,
    status = 'active',
    videoLessonUrls,
  } = opts;
  await sql`
    insert into training_programs
      (id, booking_id, pet_id, owner_user_id, provider_id, title, total_sessions,
       status, video_lesson_urls)
    values (
      ${programId}, ${bookingId}, ${petId}, ${ownerUserId}, ${providerId},
      ${title ?? `program-${programId}`}, ${totalSessions}, ${status},
      ${videoLessonUrls ?? [`lesson-${programId}.mp4`]}
    )
  `;
  return { programId };
}

/**
 * Seed a training_sessions occurrence at `providerId` (ticket 2.10). kind defaults
 * 'group_class'; capacity NULL = unlimited (pass a number for a capacity-managed class).
 * Used to exercise the staff-manage / published-public RLS + the group-class capacity guard.
 */
export async function seedTrainingSession(
  sql: Sql,
  opts: {
    sessionId: number;
    providerId: number;
    programId?: number | null;
    kind?: 'one_on_one' | 'group_class' | 'program';
    title?: string;
    capacity?: number | null;
    status?: 'scheduled' | 'completed' | 'cancelled';
  },
): Promise<{ sessionId: number }> {
  const {
    sessionId,
    providerId,
    programId = null,
    kind = 'group_class',
    title,
    capacity = null,
    status = 'scheduled',
  } = opts;
  await sql`
    insert into training_sessions
      (id, provider_id, program_id, kind, title, capacity, status)
    values (
      ${sessionId}, ${providerId}, ${programId}, ${kind},
      ${title ?? `session-${sessionId}`}, ${capacity}, ${status}
    )
  `;
  return { sessionId };
}

/**
 * Seed a training_progress row (the per-pet attendance + progress note; ALSO the group-class
 * roster row) for `petId` owned by `ownerUserId` at `providerId` on `sessionId` (ticket
 * 2.10). status defaults 'booked'; progress_note/video carry the id. Used to exercise the
 * owner-FOR-ALL + provider-via-grant RLS (owner sees own pet's progress only) + capacity.
 */
export async function seedTrainingProgress(
  sql: Sql,
  opts: {
    progressId: number;
    sessionId: number;
    petId: number;
    ownerUserId: number;
    providerId: number;
    programId?: number | null;
    attended?: boolean;
    progressNote?: string | null;
    videoLessonUrls?: string[];
    status?: 'booked' | 'completed' | 'cancelled';
  },
): Promise<{ progressId: number }> {
  const {
    progressId,
    sessionId,
    petId,
    ownerUserId,
    providerId,
    programId = null,
    attended = false,
    progressNote = null,
    videoLessonUrls,
    status = 'booked',
  } = opts;
  await sql`
    insert into training_progress
      (id, session_id, program_id, pet_id, owner_user_id, provider_id, attended,
       progress_note, video_lesson_urls, status)
    values (
      ${progressId}, ${sessionId}, ${programId}, ${petId}, ${ownerUserId}, ${providerId},
      ${attended}, ${progressNote}, ${videoLessonUrls ?? []}, ${status}
    )
  `;
  return { progressId };
}
